// Route planning with graceful degradation:
//   1. Real Chennai road network from OpenStreetMap, routed locally with A*
//      (works fully offline, avoids flooded / high-risk zones)        ← default
//   2. OSRM (online routing server) if the road graph is unavailable
//   3. Grid A* around hazard zones as the last resort
// Rescue boats travel straight over water.
import { config } from '../config.js';
import { internetAvailable } from './connectivity.js';
import { etaMinutes, haversineKm, pathLengthKm, planRoute } from './geo.js';
import { loadRoadGraph, roadRoute } from './roadGraph.js';

const inZone = (p, z) => haversineKm(p, z.center) <= z.radius_km;
const SPEED_FACTOR = { ambulance: 1.0, fire_truck: 1.1, medical_team: 1.0, relief_truck: 1.25, ndrf_team: 1.1 };

let graphTried = false;
function graph() {
  if (!graphTried) {
    graphTried = true;
    const g = loadRoadGraph();
    if (g) console.log(`[routing] OSM road graph loaded: ${g.nodeCount.toLocaleString()} nodes, ${g.edgeCount.toLocaleString()} directed edges (${g.loadMs} ms)`);
    else console.log('[routing] road graph not found – using grid A* / OSRM');
  }
  return loadRoadGraph();
}

/** Synchronous version used by the optimiser preview (no network calls). */
export function routeSync(from, to, type = 'ambulance', zones = []) {
  if (type === 'rescue_boat') return { ...planRoute(from, to, [], type), engine: 'direct (boat)' };
  if (graph()) {
    const r = roadRoute(from, to, { zones, slowdown: 1.25 * (SPEED_FACTOR[type] || 1) });
    if (r) return { ...r, engine: r.penalisedEdges ? 'OSM roads · offline A* (avoiding hazard zones)' : 'OSM roads · offline A*' };
  }
  const g = planRoute(from, to, zones, type);
  return { ...g, engine: g.detour ? 'grid A* (hazard detour)' : 'straight line estimate' };
}

export async function routeBetween(from, to, type = 'ambulance', zones = []) {
  const local = routeSync(from, to, type, zones);
  if (local.engine.startsWith('OSM') || type === 'rescue_boat') return local;
  if (!config.osrmEnabled || !internetAvailable()) return local;
  try {
    const url = `${config.osrmUrl}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=simplified&geometries=geojson`;
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const r = (await res.json()).routes?.[0];
    if (!r) throw new Error('no route');
    const path = r.geometry.coordinates.map(([lng, lat]) => ({ lat: +lat.toFixed(5), lng: +lng.toFixed(5) }));
    const hazards = (zones || []).filter((z) => z.risk_level !== 'elevated' && !inZone(from, z) && !inZone(to, z));
    if (hazards.some((z) => path.some((p) => inZone(p, z)))) return local;
    const distanceKm = r.distance / 1000 || pathLengthKm(path);
    return { path, distanceKm, etaMin: Math.max(3 + (r.duration / 60) * 1.25, etaMinutes(distanceKm, type) * 0.6), detour: false, engine: 'OSRM (online)' };
  } catch {
    return local;
  }
}
