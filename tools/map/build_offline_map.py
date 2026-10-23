"""Build the offline street map, road graph and street gazetteer from an
OpenStreetMap extract of Chennai.

Input : an .osm.pbf extract (default: data/osm/chennai-streets.osm.pbf)
Output:
  frontend/public/offline/chennai-streets.pmtiles   vector tiles (roads + water + places) for MapLibre
  backend/data/chennai-roads.graph.json.gz          compact road graph for offline A* routing
  backend/data/chennai-streets.gazetteer.json       street name (EN + TA) → coordinates, for SMS geocoding

Requires: pip install osmium pmtiles ; the `tippecanoe` binary on PATH (github.com/felt/tippecanoe).
Map data © OpenStreetMap contributors, ODbL 1.0 — https://www.openstreetmap.org/copyright
"""
from __future__ import annotations

import json
import math
import os
import subprocess
import sys
import tempfile
from collections import defaultdict
from pathlib import Path

import osmium

ROOT = Path(__file__).resolve().parents[2]
PBF = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data" / "osm" / "chennai-streets.osm.pbf"
TIPPECANOE = os.environ.get("TIPPECANOE", "tippecanoe")

# road class → (min zoom shown, routing speed km/h, routable)
CLASSES = {
    "motorway": (8, 60, True), "motorway_link": (11, 40, True),
    "trunk": (8, 50, True), "trunk_link": (11, 35, True),
    "primary": (9, 40, True), "primary_link": (12, 30, True),
    "secondary": (10, 35, True), "secondary_link": (12, 25, True),
    "tertiary": (11, 30, True), "tertiary_link": (13, 25, True),
    "unclassified": (12, 25, True), "residential": (13, 20, True),
    "living_street": (14, 15, True), "road": (13, 20, True),
    "service": (14, 15, False), "track": (14, 10, False),
}
GROUP = {k: k.replace("_link", "") for k in CLASSES}


class Collector(osmium.SimpleHandler):
    def __init__(self, geo_out):
        super().__init__()
        self.geo_out = geo_out
        self.ways = []  # (node_ids, coords, cls, oneway, name)
        self.node_use = defaultdict(int)
        self.names = defaultdict(list)
        self.east = {}  # lat band → easternmost road longitude (for a data-driven coastline)

    def way(self, w):
        hw = w.tags.get("highway")
        if hw not in CLASSES:
            return
        try:
            coords = [(n.location.lon, n.location.lat) for n in w.nodes]
            ids = [n.ref for n in w.nodes]
        except osmium.InvalidLocationError:
            return
        if len(coords) < 2:
            return
        for x, y in coords:
            band = round(y, 2)
            if x > self.east.get(band, -999):
                self.east[band] = x
        minzoom, _, routable = CLASSES[hw]
        name = w.tags.get("name")
        name_ta = w.tags.get("name:ta")
        props = {"class": GROUP[hw], "link": hw.endswith("_link")}
        if name:
            props["name"] = name
        if name_ta:
            props["name_ta"] = name_ta
        if w.tags.get("ref"):
            props["ref"] = w.tags["ref"]
        if w.tags.get("bridge") == "yes":
            props["bridge"] = True
        self.geo_out.write(json.dumps({
            "type": "Feature", "tippecanoe": {"layer": "roads", "minzoom": minzoom},
            "properties": props, "geometry": {"type": "LineString", "coordinates": [[round(x, 6), round(y, 6)] for x, y in coords]},
        }) + "\n")
        if routable:
            oneway = w.tags.get("oneway") in ("yes", "1", "true") or hw in ("motorway", "motorway_link")
            self.ways.append((ids, coords, GROUP[hw], oneway, name))
            for i in ids:
                self.node_use[i] += 1
        for nm in filter(None, (name, name_ta)):
            mid = coords[len(coords) // 2]
            self.names[nm].append(mid)


def hav(a, b):
    R = 6371000.0
    la1, la2 = math.radians(a[1]), math.radians(b[1])
    dla, dlo = la2 - la1, math.radians(b[0] - a[0])
    h = math.sin(dla / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(dlo / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def build_graph(c: Collector) -> dict:
    """Contract the street network: graph nodes are intersections / dead ends;
    each edge keeps its full geometry (delta-encoded) for drawing routes."""
    node_index, nodes = {}, []

    def nid(osm_id, coord):
        if osm_id not in node_index:
            node_index[osm_id] = len(nodes)
            nodes.append([round(coord[0], 5), round(coord[1], 5)])
        return node_index[osm_id]

    edges = []
    for ids, coords, cls, oneway, _name in c.ways:
        seg_start = 0
        for i in range(1, len(ids)):
            is_break = i == len(ids) - 1 or c.node_use[ids[i]] > 1
            if not is_break:
                continue
            pts = coords[seg_start : i + 1]
            length = sum(hav(pts[k - 1], pts[k]) for k in range(1, len(pts)))
            a, b = nid(ids[seg_start], coords[seg_start]), nid(ids[i], coords[i])
            if a != b:
                # geometry without endpoints, delta-encoded at 1e-5 deg
                mid = pts[1:-1]
                enc, px, py = [], round(pts[0][0] * 1e5), round(pts[0][1] * 1e5)
                for x, y in mid:
                    ix, iy = round(x * 1e5), round(y * 1e5)
                    enc += [ix - px, iy - py]
                    px, py = ix, iy
                edges.append([a, b, round(length), list(CLASSES).index(cls), 1 if oneway else 0, enc])
            seg_start = i
    return {
        "format": "drp-road-graph/1",
        "source": "OpenStreetMap contributors (ODbL)",
        "classes": list(CLASSES),
        "speeds_kmph": {k: v[1] for k, v in CLASSES.items()},
        "nodes": nodes,
        "edges": edges,  # [from, to, length_m, class_idx, oneway, delta_geometry]
    }


def build_gazetteer(c: Collector) -> dict:
    """Street name → a point on that street (case-insensitive names).
    Segments are clustered (3 km linkage). A name is kept when one cluster holds
    ≥70% of its segments — one long road like Anna Salai, plus maybe a stray
    namesake elsewhere; names spread over many suburbs ("Main Road") are skipped."""
    groups = defaultdict(list)
    spellings = defaultdict(lambda: defaultdict(int))
    for name, pts in c.names.items():
        key = " ".join(name.lower().split())
        groups[key] += pts
        spellings[key][name] += len(pts)
    out = {}
    for key, pts in groups.items():
        if len(key) < 6:
            continue
        clusters = []
        for p in pts:
            hit = [i for i, cl in enumerate(clusters) if any(hav(p, q) < 3000 for q in cl)]
            if not hit:
                clusters.append([p])
            else:
                merged = [p] + [q for i in hit for q in clusters[i]]
                clusters = [cl for i, cl in enumerate(clusters) if i not in hit] + [merged]
        main = max(clusters, key=len)
        if len(main) < 0.7 * len(pts):
            continue
        lon = sum(p[0] for p in main) / len(main)
        lat = sum(p[1] for p in main) / len(main)
        best = min(main, key=lambda p: hav(p, (lon, lat)))  # a point ON the road
        name = max(spellings[key].items(), key=lambda kv: kv[1])[0]
        out[name] = [round(best[1], 5), round(best[0], 5)]
    return out


def coastline(c: Collector):
    """Derive the shoreline from the street data: in each 0.01° latitude band the
    sea starts just east of the easternmost road (beach roads run along the coast)."""
    pts = []
    for band in sorted(c.east):
        if 12.70 <= band <= 13.35 and c.east[band] > 80.18:
            pts.append([round(c.east[band] + 0.0025, 5), band])
    # smooth with a 5-band moving maximum so inland gaps don't create bays
    sm = []
    for i, (x, y) in enumerate(pts):
        win = [p[0] for p in pts[max(0, i - 2) : i + 3]]
        sm.append([max(win), y])
    return sm


def schematic_layers(fh, c: Collector):
    """Water and locality labels from the bundled schematic map (the streets
    extract only contains roads); sea + coast are rebuilt from the road data."""
    geo = json.loads((ROOT / "frontend" / "public" / "offline-map.json").read_text(encoding="utf-8"))
    coast = coastline(c)
    if len(coast) > 10:
        sea = coast + [[80.6, coast[-1][1]], [80.6, coast[0][1]], coast[0]]
        fh.write(json.dumps({"type": "Feature", "tippecanoe": {"layer": "water", "minzoom": 8}, "properties": {"kind": "sea", "name": "Bay of Bengal"}, "geometry": {"type": "Polygon", "coordinates": [sea]}}) + "\n")
    for f in geo["features"]:
        kind = f["properties"]["kind"]
        if kind == "road" or (kind in ("sea", "coast") and len(coast) > 10):
            continue  # real OSM roads replace the hand-drawn ones; sea rebuilt above
        layer = "places" if kind == "label" else "water"
        fh.write(json.dumps({"type": "Feature", "tippecanoe": {"layer": layer, "minzoom": 8}, "properties": f["properties"], "geometry": f["geometry"]}, ensure_ascii=False) + "\n")


def main():
    if not PBF.exists():
        sys.exit(f"OSM extract not found: {PBF}")
    tmp = Path(tempfile.mkdtemp())
    seq = tmp / "features.geojsonseq"
    with open(seq, "w", encoding="utf-8") as fh:
        c = Collector(fh)
        c.apply_file(str(PBF), locations=True)
        schematic_layers(fh, c)
    print(f"roads: {len(c.ways)} routable ways, {len(c.names)} street names")

    graph = build_graph(c)
    (ROOT / "backend" / "data").mkdir(exist_ok=True)
    import gzip

    with gzip.open(ROOT / "backend" / "data" / "chennai-roads.graph.json.gz", "wt", encoding="utf-8") as gz:
        gz.write(json.dumps(graph, separators=(",", ":")))
    print(f"graph: {len(graph['nodes'])} nodes, {len(graph['edges'])} edges")
    gaz = build_gazetteer(c)
    (ROOT / "backend" / "data" / "chennai-streets.gazetteer.json").write_text(json.dumps(gaz, ensure_ascii=False, separators=(",", ":")))
    print(f"gazetteer: {len(gaz)} unambiguous street names")

    mbtiles = tmp / "chennai.mbtiles"
    subprocess.run([
        TIPPECANOE, "-o", str(mbtiles), "--force", "-Z8", "-z15", "--read-parallel",
        "--simplification=4", "--drop-densest-as-needed", "--extend-zooms-if-still-dropping",
        "-n", "Chennai streets (OSM)", "-A", "© OpenStreetMap contributors", "-P", str(seq),
    ], check=True)
    from pmtiles.convert import mbtiles_to_pmtiles

    out = ROOT / "frontend" / "public" / "offline" / "chennai-streets.pmtiles"
    out.parent.mkdir(parents=True, exist_ok=True)
    mbtiles_to_pmtiles(str(mbtiles), str(out), maxzoom=15)
    print(f"tiles: {out} ({out.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
