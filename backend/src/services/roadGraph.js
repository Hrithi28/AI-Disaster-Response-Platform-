// Offline routing on the REAL Chennai road network (OpenStreetMap).
// The graph (≈246k intersections, 312k road segments) is built from an OSM
// extract by tools/map/build_offline_map.py and loaded into memory, so routing
// needs no internet and no external routing server.
//
// A* search, cost = travel time. Roads inside high/critical risk zones (flooded,
// collapsed) get an 8× time penalty so vehicles detour around them, except the
// zone the incident itself is in (that is where the unit has to go).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { haversineKm } from './geo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.resolve(__dirname, '../../data/chennai-roads.graph.json');

let G = null; // { lon, lat, head, next, to, len, speed, geom, nodeCount, grid }
const HAZARD_PENALTY = 8;
const CELL = 0.01; // ~1.1 km grid cells for nearest-node lookup

export function loadRoadGraph(file = FILE) {
  if (G) return G;
  const candidates = [file, `${file}.gz`];
  const found = candidates.find((f) => fs.existsSync(f));
  if (!found) return null;
  const t = Date.now();
  const raw = found.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(found)).toString('utf8') : fs.readFileSync(found, 'utf8');
  const g = JSON.parse(raw);
  const n = g.nodes.length;
  const lon = new Float64Array(n);
  const lat = new Float64Array(n);
  g.nodes.forEach(([x, y], i) => {
    lon[i] = x;
    lat[i] = y;
  });
  const speeds = g.classes.map((c) => g.speeds_kmph[c]);
  // directed adjacency list in compressed arrays
  let m = 0;
  for (const e of g.edges) m += e[4] ? 1 : 2;
  const head = new Int32Array(n).fill(-1);
  const next = new Int32Array(m);
  const to = new Int32Array(m);
  const len = new Float32Array(m);
  const speed = new Float32Array(m);
  const geomIdx = new Int32Array(m); // index into g.edges (negative = reversed)
  let k = 0;
  const add = (a, b, L, sp, ei) => {
    to[k] = b;
    len[k] = L;
    speed[k] = sp;
    geomIdx[k] = ei;
    next[k] = head[a];
    head[a] = k++;
  };
  g.edges.forEach((e, i) => {
    const [a, b, L, cls, oneway] = e;
    add(a, b, L, speeds[cls], i + 1);
    if (!oneway) add(b, a, L, speeds[cls], -(i + 1));
  });
  const grid = new Map();
  for (let i = 0; i < n; i++) {
    if (head[i] === -1) continue;
    const key = `${Math.floor(lat[i] / CELL)}:${Math.floor(lon[i] / CELL)}`;
    let arr = grid.get(key);
    if (!arr) grid.set(key, (arr = []));
    arr.push(i);
  }
  G = { lon, lat, head, next, to, len, speed, geomIdx, edges: g.edges, nodeCount: n, edgeCount: k, grid, loadMs: Date.now() - t };
  return G;
}

export const roadGraphInfo = () => (G ? { nodes: G.nodeCount, directed_edges: G.edgeCount, load_ms: G.loadMs } : null);

export function nearestNode(p, maxKm = 3) {
  if (!G) return -1;
  const cy = Math.floor(p.lat / CELL);
  const cx = Math.floor(p.lng / CELL);
  let best = -1;
  let bestD = Infinity;
  for (let r = 0; r <= 3 && (best === -1 || r <= 1); r++) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const arr = G.grid.get(`${cy + dy}:${cx + dx}`);
        if (!arr) continue;
        for (const i of arr) {
          const d = (G.lat[i] - p.lat) ** 2 + ((G.lon[i] - p.lng) * Math.cos((p.lat * Math.PI) / 180)) ** 2;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
      }
  }
  if (best === -1) return -1;
  return haversineKm(p, { lat: G.lat[best], lng: G.lon[best] }) <= maxKm ? best : -1;
}

class Heap {
  constructor(cap) {
    this.k = new Float64Array(cap);
    this.v = new Int32Array(cap);
    this.n = 0;
  }
  push(key, val) {
    if (this.n >= this.k.length) {
      const k2 = new Float64Array(this.k.length * 2);
      k2.set(this.k);
      const v2 = new Int32Array(this.v.length * 2);
      v2.set(this.v);
      this.k = k2;
      this.v = v2;
    }
    let i = this.n++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= key) break;
      this.k[i] = this.k[p];
      this.v[i] = this.v[p];
      i = p;
    }
    this.k[i] = key;
    this.v[i] = val;
  }
  pop() {
    const top = this.v[0];
    const key = this.k[--this.n];
    const val = this.v[this.n];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.n) break;
      if (c + 1 < this.n && this.k[c + 1] < this.k[c]) c++;
      if (this.k[c] >= key) break;
      this.k[i] = this.k[c];
      this.v[i] = this.v[c];
      i = c;
    }
    this.k[i] = key;
    this.v[i] = val;
    return top;
  }
}

function edgeGeometry(gi) {
  const e = G.edges[Math.abs(gi) - 1];
  const [a, b, , , , enc] = e;
  const pts = [[G.lat[a], G.lon[a]]];
  let x = Math.round(G.lon[a] * 1e5);
  let y = Math.round(G.lat[a] * 1e5);
  for (let i = 0; i < enc.length; i += 2) {
    x += enc[i];
    y += enc[i + 1];
    pts.push([y / 1e5, x / 1e5]);
  }
  pts.push([G.lat[b], G.lon[b]]);
  return gi > 0 ? pts : pts.reverse();
}

/**
 * Fastest road route between two points, avoiding hazard zones.
 * Returns null when the graph is not loaded or no road path exists.
 */
export function roadRoute(from, to, { zones = [], slowdown = 1.0 } = {}) {
  if (!G) return null;
  const s = nearestNode(from);
  const t = nearestNode(to);
  if (s < 0 || t < 0) return null;
  const inZone = (la, lo, z) => haversineKm({ lat: la, lng: lo }, z.center) <= z.radius_km;
  const hazards = zones.filter((z) => z.risk_level !== 'elevated' && !inZone(from.lat, from.lng, z) && !inZone(to.lat, to.lng, z));
  const n = G.nodeCount;
  const gScore = new Float64Array(n).fill(Infinity);
  const prevEdge = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const hazardCache = new Int8Array(n); // 0 unknown, 1 safe, 2 hazard
  const isHazard = (i) => {
    if (!hazards.length) return false;
    if (!hazardCache[i]) hazardCache[i] = hazards.some((z) => inZone(G.lat[i], G.lon[i], z)) ? 2 : 1;
    return hazardCache[i] === 2;
  };
  const tLat = G.lat[t];
  const tLon = G.lon[t];
  const cosT = Math.cos((tLat * Math.PI) / 180);
  const VMAX = 60 / 3.6; // m/s, admissible heuristic
  const h = (i) => (Math.sqrt((G.lat[i] - tLat) ** 2 + ((G.lon[i] - tLon) * cosT) ** 2) * 111320) / VMAX;
  const heap = new Heap(1 << 16);
  gScore[s] = 0;
  heap.push(h(s), s);
  let expanded = 0;
  let avoided = 0;
  while (heap.n) {
    const u = heap.pop();
    if (closed[u]) continue;
    closed[u] = 1;
    expanded++;
    if (u === t) break;
    for (let e = G.head[u]; e !== -1; e = G.next[e]) {
      const v = G.to[e];
      if (closed[v]) continue;
      let cost = G.len[e] / (G.speed[e] / 3.6);
      if (isHazard(v)) {
        cost *= HAZARD_PENALTY;
        avoided++;
      }
      const ng = gScore[u] + cost;
      if (ng < gScore[v]) {
        gScore[v] = ng;
        prevEdge[v] = e;
        heap.push(ng + h(v), v);
      }
    }
  }
  if (!Number.isFinite(gScore[t])) return null;
  // rebuild path
  const edgeSeq = [];
  for (let v = t; v !== s; ) {
    const e = prevEdge[v];
    edgeSeq.push(e);
    // find source node of e: walk back using geometry direction
    const gi = G.geomIdx[e];
    const raw = G.edges[Math.abs(gi) - 1];
    v = gi > 0 ? raw[0] : raw[1];
  }
  edgeSeq.reverse();
  const pts = [[from.lat, from.lng]];
  let meters = haversineKm(from, { lat: G.lat[s], lng: G.lon[s] }) * 1000;
  let hazardMeters = 0;
  for (const e of edgeSeq) {
    const geom = edgeGeometry(G.geomIdx[e]);
    for (const p of geom) pts.push(p);
    meters += G.len[e];
    if (isHazard(G.to[e])) hazardMeters += G.len[e];
  }
  pts.push([to.lat, to.lng]);
  meters += haversineKm(to, { lat: G.lat[t], lng: G.lon[t] }) * 1000;
  // simplify: drop consecutive duplicates, keep ≤ 400 points for the map
  const path = [];
  const step = Math.max(1, Math.ceil(pts.length / 400));
  pts.forEach((p, i) => {
    if (i % step === 0 || i === pts.length - 1) path.push({ lat: +p[0].toFixed(5), lng: +p[1].toFixed(5) });
  });
  const pureSeconds = edgeSeq.reduce((sum, e) => sum + G.len[e] / (G.speed[e] / 3.6), 0);
  return {
    path,
    distanceKm: meters / 1000,
    etaMin: 3 + (pureSeconds / 60) * slowdown + (hazardMeters / 1000) * 4, // wading through flood: +4 min/km
    detour: hazards.length > 0,
    avoidedZones: hazards.length,
    hazardKm: +(hazardMeters / 1000).toFixed(2),
    expanded,
    penalisedEdges: avoided,
  };
}
