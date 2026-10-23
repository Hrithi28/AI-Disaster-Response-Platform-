// Evacuation planner: for every high/critical risk zone, estimate the people
// to move and assign them to the nearest open relief camps with free capacity
// (capacity-constrained greedy assignment, closest camp first, most dangerous
// zone first).
import { query } from '../db/postgres.js';
import { haversineKm } from './geo.js';
import { routeBetween } from './routing.js';
import { state } from './state.js';

export async function planEvacuation({ withRoutes = true } = {}) {
  const camps = (await query(`SELECT * FROM camps WHERE status <> 'closed'`)).map((c) => ({ ...c, free: c.capacity - c.occupancy }));
  const zones = state.zones.filter((z) => z.risk_level !== 'elevated').sort((a, b) => b.risk_score - a.risk_score);
  const incidents = await query(`SELECT id, affected_people FROM incidents WHERE status <> 'resolved'`);
  const byId = Object.fromEntries(incidents.map((i) => [i.id, i]));
  const plan = [];
  for (const z of zones) {
    const affected = z.incident_ids.reduce((s, id) => s + (byId[id]?.affected_people || 0), 0);
    // not everyone affected must leave: evacuate 35% (high) / 60% (critical)
    let toMove = Math.round(affected * (z.risk_level === 'critical' ? 0.6 : 0.35));
    const allocations = [];
    const options = camps
      .filter((c) => c.free > 0 && !state.zones.some((oz) => oz.risk_level !== 'elevated' && haversineKm(c, oz.center) <= oz.radius_km))
      .map((c) => ({ c, d: haversineKm(z.center, c) }))
      .sort((a, b) => a.d - b.d);
    for (const { c, d } of options) {
      if (toMove <= 0) break;
      const n = Math.min(c.free, toMove);
      c.free -= n;
      toMove -= n;
      const route = withRoutes ? await routeBetween(z.center, c, 'relief_truck', state.zones) : null;
      allocations.push({
        camp_id: c.id,
        camp_name: c.name,
        people: n,
        distance_km: +(route?.distanceKm ?? d).toFixed(2),
        eta_min: route ? +route.etaMin.toFixed(0) : null,
        route: route?.path || [z.center, { lat: c.lat, lng: c.lng }],
        engine: route?.engine,
      });
    }
    plan.push({
      zone_id: z.zone_id,
      center: z.center,
      risk_level: z.risk_level,
      risk_score: z.risk_score,
      affected,
      to_evacuate: allocations.reduce((s, a) => s + a.people, 0) + toMove,
      unplaced: toMove,
      allocations,
    });
  }
  return {
    generated_at: new Date().toISOString(),
    zones: plan,
    total_to_evacuate: plan.reduce((s, p) => s + p.to_evacuate, 0),
    total_unplaced: plan.reduce((s, p) => s + p.unplaced, 0),
    camps_free_capacity: camps.reduce((s, c) => s + Math.max(0, c.free), 0),
  };
}
