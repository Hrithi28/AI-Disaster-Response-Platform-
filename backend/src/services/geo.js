// Geospatial helpers: distance, travel-time model and hazard-aware route planning.

export const SPEED_KMPH = {
  ambulance: 40,
  fire_truck: 35,
  rescue_boat: 18,
  medical_team: 35,
  relief_truck: 30,
  ndrf_team: 32,
};
const ROAD_FACTOR = 1.3; // roads are ~30% longer than the straight line
const MOBILISATION_MIN = 3;

export function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function pathLengthKm(path) {
  let d = 0;
  for (let i = 1; i < path.length; i++) d += haversineKm(path[i - 1], path[i]);
  return d;
}

export function etaMinutes(distanceKm, resourceType) {
  const speed = SPEED_KMPH[resourceType] || 30;
  const factor = resourceType === 'rescue_boat' ? 1.1 : ROAD_FACTOR;
  return MOBILISATION_MIN + ((distanceKm * factor) / speed) * 60;
}

/** Quick estimate used inside the optimiser's cost matrix (no routing). */
export function quickEta(from, to, resourceType) {
  const d = haversineKm(from, to);
  return { distanceKm: d, etaMin: etaMinutes(d, resourceType) };
}

const inZone = (p, z) => haversineKm(p, z.center) <= z.radius_km;

/**
 * Route planning with A* on a lat/lng grid. Cells inside high-risk zones
 * (other than the zone that contains the origin/destination) are heavily
 * penalised so vehicles detour around flooded / collapsed areas. Rescue boats
 * are allowed through flood zones.
 */
export function planRoute(from, to, zones = [], resourceType = 'ambulance') {
  const hazards = (zones || []).filter(
    (z) => z.risk_level !== 'elevated' && !inZone(from, z) && !inZone(to, z) && resourceType !== 'rescue_boat',
  );
  const pt = (p) => ({ lat: +Number(p.lat).toFixed(5), lng: +Number(p.lng).toFixed(5) });
  const straight = [pt(from), pt(to)];
  if (!hazards.length || !hazards.some((z) => segmentNearZone(from, to, z))) {
    const d = haversineKm(from, to);
    return { path: straight, distanceKm: d, etaMin: etaMinutes(d, resourceType), detour: false };
  }

  const pad = 0.04;
  const minLat = Math.min(from.lat, to.lat) - pad;
  const maxLat = Math.max(from.lat, to.lat) + pad;
  const minLng = Math.min(from.lng, to.lng) - pad;
  const maxLng = Math.max(from.lng, to.lng) + pad;
  const N = 48;
  const dLat = (maxLat - minLat) / N;
  const dLng = (maxLng - minLng) / N;
  const cellOf = (p) => [
    Math.min(N - 1, Math.max(0, Math.floor((p.lat - minLat) / dLat))),
    Math.min(N - 1, Math.max(0, Math.floor((p.lng - minLng) / dLng))),
  ];
  const centre = (r, c) => ({ lat: minLat + (r + 0.5) * dLat, lng: minLng + (c + 0.5) * dLng });
  const penalty = new Float32Array(N * N);
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) if (hazards.some((z) => inZone(centre(r, c), z))) penalty[r * N + c] = 40;

  const [sr, sc] = cellOf(from);
  const [tr, tc] = cellOf(to);
  const key = (r, c) => r * N + c;
  const g = new Float64Array(N * N).fill(Infinity);
  const came = new Int32Array(N * N).fill(-1);
  const open = new MinHeap();
  const h = (r, c) => Math.hypot(r - tr, c - tc);
  g[key(sr, sc)] = 0;
  open.push(h(sr, sc), key(sr, sc));
  const closed = new Uint8Array(N * N);
  while (open.size) {
    const cur = open.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    const r = Math.floor(cur / N);
    const c = cur % N;
    if (r === tr && c === tc) break;
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= N || nc >= N) continue;
        const k = key(nr, nc);
        const step = (dr && dc ? Math.SQRT2 : 1) * (1 + penalty[k]);
        if (g[cur] + step < g[k]) {
          g[k] = g[cur] + step;
          came[k] = cur;
          open.push(g[k] + h(nr, nc), k);
        }
      }
  }
  const cells = [];
  for (let k = key(tr, tc); k !== -1; k = came[k]) cells.push(k);
  cells.reverse();
  // keep only turning points to get a clean polyline
  const pts = [from];
  for (let i = 1; i < cells.length - 1; i++) {
    const [a, b, d] = [cells[i - 1], cells[i], cells[i + 1]];
    const dir1 = [Math.floor(b / N) - Math.floor(a / N), (b % N) - (a % N)];
    const dir2 = [Math.floor(d / N) - Math.floor(b / N), (d % N) - (b % N)];
    if (dir1[0] !== dir2[0] || dir1[1] !== dir2[1]) pts.push(centre(Math.floor(b / N), b % N));
  }
  pts.push(to);
  const path = pts.map((p) => ({ lat: +p.lat.toFixed(5), lng: +p.lng.toFixed(5) }));
  const distanceKm = pathLengthKm(path);
  return { path, distanceKm, etaMin: etaMinutes(distanceKm, resourceType), detour: true, avoidedZones: hazards.length };
}

function segmentNearZone(a, b, z) {
  for (let t = 0; t <= 1; t += 0.05) {
    const p = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
    if (inZone(p, z)) return true;
  }
  return false;
}

/** Position at fraction t (0..1) along a polyline. */
export function pointAlong(path, t) {
  if (!path?.length) return null;
  if (t <= 0 || path.length === 1) return path[0];
  if (t >= 1) return path[path.length - 1];
  const total = pathLengthKm(path);
  let target = total * t;
  for (let i = 1; i < path.length; i++) {
    const seg = haversineKm(path[i - 1], path[i]);
    if (target <= seg) {
      const f = seg === 0 ? 0 : target / seg;
      return {
        lat: path[i - 1].lat + (path[i].lat - path[i - 1].lat) * f,
        lng: path[i - 1].lng + (path[i].lng - path[i - 1].lng) * f,
      };
    }
    target -= seg;
  }
  return path[path.length - 1];
}

class MinHeap {
  constructor() {
    this.a = [];
  }
  get size() {
    return this.a.length;
  }
  push(p, v) {
    const a = this.a;
    a.push([p, v]);
    let i = a.length - 1;
    while (i > 0) {
      const j = (i - 1) >> 1;
      if (a[j][0] <= a[i][0]) break;
      [a[i], a[j]] = [a[j], a[i]];
      i = j;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top[1];
  }
}
