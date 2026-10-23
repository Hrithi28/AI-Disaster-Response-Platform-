// Resource Allocation layer:
//   1. Requirement model     – what each incident needs (by type, severity, NLP needs)
//   2. Priority Queue        – incidents ordered by AI severity + ageing + casualties
//   3. Optimisation Engine   – Hungarian assignment minimising priority-weighted ETA
//   4. Nearest matching      – ranked candidates for manual dispatch
//   5. Route planning        – A* routes that avoid other high-risk zones
//   6. Dispatch lifecycle    – en_route → on_scene → completed → returning → available
import { json, one, query } from '../db/postgres.js';
import { planRoute, pointAlong, quickEta } from './geo.js';
import { assignWithSkip } from './hungarian.js';
import { resolveIncident } from './incidents.js';
import { createAlert } from './notifier.js';
import { incidentPriority, PriorityQueue } from './priorityQueue.js';
import { EVENTS, publish } from './events.js';
import { emit } from './realtime.js';
import { routeBetween, routeSync } from './routing.js';
import { state } from './state.js';

export function requirements(incident) {
  const f = incident.features || {};
  const sev = incident.severity;
  const req = {};
  const add = (t, n = 1) => (req[t] = Math.max(req[t] || 0, n));
  switch (incident.disaster_type) {
    case 'flood': {
      const needs = incident.needs || [];
      const rescueNeeded = needs.includes('rescue') || sev >= 4 || (!needs.length && (f.water_level_m || 0) >= 1.5);
      if (rescueNeeded) add('rescue_boat', sev >= 4 ? 2 : 1);
      if (incident.affected_people >= 200) add('relief_truck');
      break;
    }
    case 'cyclone':
      add('ndrf_team');
      if ((f.water_level_m || 0) > 1) add('rescue_boat');
      if (incident.affected_people >= 200) add('relief_truck');
      break;
    case 'earthquake':
      add('ndrf_team', sev >= 4 ? 2 : 1);
      if (sev >= 3) add('medical_team');
      break;
    case 'fire':
      add('fire_truck', sev >= 4 ? 2 : 1);
      break;
    case 'landslide':
      add('ndrf_team');
      break;
    default:
      break;
  }
  if (incident.injured > 0) add('ambulance', incident.injured > 25 ? 2 : 1);
  for (const need of incident.needs || []) {
    if (need === 'medical') add('ambulance');
    if (need === 'food_water' || need === 'shelter') add('relief_truck');
    if (need === 'firefighting') add('fire_truck');
    if (need === 'infrastructure') add('ndrf_team'); // debris / road clearance
    if (need === 'rescue') add(incident.disaster_type === 'flood' || incident.disaster_type === 'cyclone' ? 'rescue_boat' : 'ndrf_team');
  }
  if (sev <= 1) {
    // low severity: only the primary unit
    const first = Object.keys(req)[0];
    return first ? { [first]: 1 } : {};
  }
  return req;
}

async function activeDispatchCounts() {
  const rows = await query(
    `SELECT d.incident_id, r.type, COUNT(*)::int AS n FROM dispatches d JOIN resources r ON r.id = d.resource_id
     WHERE d.status IN ('en_route','on_scene','completed') GROUP BY d.incident_id, r.type`,
  );
  const map = {};
  for (const r of rows) (map[r.incident_id] ||= {})[r.type] = r.n;
  return map;
}

export async function outstandingDemand(incident, counts) {
  const have = counts?.[incident.id] || (await activeDispatchCounts())[incident.id] || {};
  const need = requirements(incident);
  const out = {};
  for (const [t, n] of Object.entries(need)) if (n - (have[t] || 0) > 0) out[t] = n - (have[t] || 0);
  return out;
}

/** Priority-ordered queue of all unresolved incidents. */
export async function priorityQueue() {
  const incidents = await query(`SELECT * FROM incidents WHERE status <> 'resolved'`);
  const counts = await activeDispatchCounts();
  const pq = new PriorityQueue();
  for (const inc of incidents) {
    const outstanding = await outstandingDemand(inc, counts);
    pq.push({ ...inc, priority: incidentPriority(inc, Date.now(), state.sim.speed), outstanding, requirements: requirements(inc) });
  }
  return pq.drain();
}

/**
 * Global optimiser. For each resource type, builds a cost matrix
 * (demand slots × available units) where cost = ETA ÷ priority weight, and
 * solves it with the Hungarian algorithm. Each slot also has a "leave unfilled"
 * option whose cost grows with priority, so scarce units go to the most urgent
 * incidents first and, among those, to the closest.
 */
export async function optimise({ commit = false, minSeverity = 1, method = 'optimizer' } = {}) {
  const queue = (await priorityQueue()).filter((i) => i.severity >= minSeverity);
  const available = await query(`SELECT * FROM resources WHERE status = 'available'`);
  const byType = {};
  for (const r of available) (byType[r.type] ||= []).push(r);

  const plan = [];
  const unmet = [];
  const types = new Set(queue.flatMap((i) => Object.keys(i.outstanding)));
  for (const type of types) {
    const slots = [];
    for (const inc of queue) for (let k = 0; k < (inc.outstanding[type] || 0); k++) slots.push(inc);
    const units = byType[type] || [];
    if (!units.length) {
      slots.forEach((s) => unmet.push({ incident_id: s.id, type }));
      continue;
    }
    const weight = (p) => 0.5 + p / 50; // priority 100 → weight 2.5
    const cost = slots.map((s) => units.map((u) => quickEta(u, s, type).etaMin / weight(s.priority)));
    const skip = slots.map((s) => 500 + s.priority * 50);
    const assign = assignWithSkip(cost, skip);
    assign.forEach((col, i) => {
      if (col < 0) unmet.push({ incident_id: slots[i].id, type });
      else {
        const u = units[col];
        const route = routeSync(u, slots[i], type, state.zones);
        plan.push({
          incident_id: slots[i].id,
          incident_title: slots[i].title,
          priority: slots[i].priority,
          severity: slots[i].severity,
          resource_id: u.id,
          resource_name: u.name,
          resource_type: type,
          distance_km: +route.distanceKm.toFixed(2),
          eta_min: +route.etaMin.toFixed(1),
          detour: route.detour,
          engine: route.engine,
          route: route.path,
        });
      }
    });
  }
  plan.sort((a, b) => b.priority - a.priority);
  const summary = {
    generated_at: new Date().toISOString(),
    queue_size: queue.length,
    assignments: plan.length,
    unmet_slots: unmet.length,
    avg_eta_min: plan.length ? +(plan.reduce((s, p) => s + p.eta_min, 0) / plan.length).toFixed(1) : 0,
    committed: commit,
  };
  // baseline comparison: naive first-come-first-served nearest unit
  summary.baseline_avg_eta_min = await naiveBaseline(queue, available);
  if (commit) {
    for (const p of plan) await createDispatch(p.incident_id, p.resource_id, { method, route: p.route, eta: p.eta_min, distance: p.distance_km, engine: p.engine });
    state.lastOptimisation = summary;
    emit('optimizer:run', summary);
  }
  return { summary, plan, unmet };
}

/** FCFS greedy baseline (oldest incident first, nearest free unit) for comparison. */
async function naiveBaseline(queue, available) {
  const free = available.map((r) => ({ ...r }));
  const etas = [];
  const fcfs = [...queue].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  for (const inc of fcfs)
    for (const [type, n] of Object.entries(inc.outstanding))
      for (let k = 0; k < n; k++) {
        let best = -1;
        let bestEta = Infinity;
        free.forEach((r, i) => {
          if (r.type !== type || r.used) return;
          const e = quickEta(r, inc, type).etaMin;
          if (e < bestEta) {
            bestEta = e;
            best = i;
          }
        });
        if (best >= 0) {
          free[best].used = true;
          // measure the baseline on the same road-network ETA as the optimiser
          etas.push(routeSync(free[best], inc, type, state.zones).etaMin ?? bestEta);
        }
      }
  return etas.length ? +(etas.reduce((a, b) => a + b, 0) / etas.length).toFixed(1) : 0;
}

export async function nearestResources(incidentId, type) {
  const inc = await one(`SELECT * FROM incidents WHERE id=$1`, [incidentId]);
  if (!inc) return null;
  const rows = await query(`SELECT * FROM resources WHERE status='available' ${type ? 'AND type=$1' : ''}`, type ? [type] : []);
  return rows
    .map((r) => ({ ...r, ...quickEta(r, inc, r.type) }))
    .map((r) => ({ ...r, distanceKm: +r.distanceKm.toFixed(2), etaMin: +r.etaMin.toFixed(1) }))
    .sort((a, b) => a.etaMin - b.etaMin)
    .slice(0, 15);
}

export async function createDispatch(incidentId, resourceId, { method = 'manual', route, eta, distance, engine } = {}) {
  const r = await one(`SELECT * FROM resources WHERE id=$1`, [resourceId]);
  const inc = await one(`SELECT * FROM incidents WHERE id=$1`, [incidentId]);
  if (!r || !inc) throw Object.assign(new Error('Incident or resource not found'), { status: 404 });
  if (r.status !== 'available') throw Object.assign(new Error(`${r.name} is not available (${r.status})`), { status: 409 });
  if (inc.status === 'resolved') throw Object.assign(new Error('Incident already resolved'), { status: 409 });
  if (!route) {
    const planned = await routeBetween(r, inc, r.type, state.zones);
    route = planned.path;
    eta = planned.etaMin;
    distance = planned.distanceKm;
    engine = planned.engine;
  }
  const d = await one(
    `INSERT INTO dispatches (incident_id, resource_id, distance_km, eta_min, route, method, route_engine) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [incidentId, resourceId, +distance.toFixed(2), +eta.toFixed(1), json(route), method, engine || (method === 'manual' ? 'offline A*' : 'optimiser A*')],
  );
  const res = await one(`UPDATE resources SET status='dispatched', assigned_incident_id=$2, updated_at=now() WHERE id=$1 RETURNING *`, [resourceId, incidentId]);
  if (inc.status === 'open') {
    const upd = await one(`UPDATE incidents SET status='assigned', updated_at=now() WHERE id=$1 RETURNING *`, [incidentId]);
    emit('incident:update', upd);
  }
  const payload = { ...d, resource_name: r.name, resource_type: r.type, incident_title: inc.title };
  emit('dispatch:new', payload);
  publish(EVENTS.DISPATCH_CREATED, payload);
  emit('resource:update', res);
  emit('assignment', payload, `resource:${resourceId}`);
  return payload;
}

export async function updateDispatchStatus(dispatchId, status, { actualSeverity } = {}) {
  const d = await one(`SELECT * FROM dispatches WHERE id=$1`, [dispatchId]);
  if (!d) throw Object.assign(new Error('Dispatch not found'), { status: 404 });
  if (status === 'on_scene') {
    const upd = await one(`UPDATE dispatches SET status='on_scene', arrived_at=now() WHERE id=$1 RETURNING *`, [dispatchId]);
    const inc = await one(`SELECT * FROM incidents WHERE id=$1`, [d.incident_id]);
    const res = await one(`UPDATE resources SET status='on_scene', lat=$2, lng=$3, updated_at=now() WHERE id=$1 RETURNING *`, [d.resource_id, inc.lat, inc.lng]);
    if (inc.status !== 'in_progress' && inc.status !== 'resolved') {
      emit('incident:update', await one(`UPDATE incidents SET status='in_progress', updated_at=now() WHERE id=$1 RETURNING *`, [inc.id]));
    }
    emit('dispatch:update', upd);
    publish(EVENTS.DISPATCH_UPDATED, upd);
    emit('resource:update', res);
    return upd;
  }
  if (status === 'completed' || status === 'cancelled') {
    const upd = await one(`UPDATE dispatches SET status=$2, completed_at=now() WHERE id=$1 RETURNING *`, [dispatchId, status]);
    const res = await one(`UPDATE resources SET status='returning', assigned_incident_id=NULL, updated_at=now() WHERE id=$1 RETURNING *`, [d.resource_id]);
    emit('dispatch:update', upd);
    publish(EVENTS.DISPATCH_UPDATED, upd);
    emit('resource:update', res);
    // resolve incident once every unit is done and nothing more is required
    const remaining = await one(`SELECT COUNT(*)::int AS n FROM dispatches WHERE incident_id=$1 AND status IN ('en_route','on_scene')`, [d.incident_id]);
    const inc = await one(`SELECT * FROM incidents WHERE id=$1`, [d.incident_id]);
    if (status === 'completed' && remaining.n === 0 && inc.status !== 'resolved') {
      const outstanding = await outstandingDemand(inc);
      if (!Object.keys(outstanding).length || actualSeverity) await resolveIncident(inc.id, actualSeverity);
    }
    return upd;
  }
  throw Object.assign(new Error('Unsupported status'), { status: 400 });
}

/**
 * Moves units along their routes and advances the dispatch lifecycle.
 * Runs every second; time is accelerated by SIM_SPEED.
 */
export async function lifecycleTick() {
  const speed = state.sim.speed;
  const now = Date.now();
  const active = await query(
    `SELECT d.*, r.type AS rtype, r.base_lat, r.base_lng, r.status AS rstatus FROM dispatches d JOIN resources r ON r.id = d.resource_id
     WHERE d.status IN ('en_route','on_scene')`,
  );
  for (const d of active) {
    const elapsedMin = ((now - new Date(d.created_at).getTime()) / 60000) * speed;
    if (d.status === 'en_route') {
      const t = Math.min(1, elapsedMin / d.eta_min);
      if (t >= 1) await updateDispatchStatus(d.id, 'on_scene');
      else {
        const p = pointAlong(d.route, t);
        const res = await one(`UPDATE resources SET lat=$2, lng=$3 WHERE id=$1 RETURNING *`, [d.resource_id, p.lat, p.lng]);
        emit('resource:move', { id: res.id, lat: res.lat, lng: res.lng, status: res.status, progress: +t.toFixed(3) });
      }
    } else if (d.status === 'on_scene' && state.sim.enabled) {
      const onSceneMin = ((now - new Date(d.arrived_at).getTime()) / 60000) * speed;
      const workMin = 25 + (d.id % 4) * 8; // deterministic 25–49 simulated minutes
      if (onSceneMin >= workMin) {
        const inc = await one(`SELECT severity FROM incidents WHERE id=$1`, [d.incident_id]);
        const jitter = [0, 0, 0, 1, -1][d.id % 5]; // field-confirmed severity differs sometimes
        await updateDispatchStatus(d.id, 'completed', { actualSeverity: Math.min(5, Math.max(1, inc.severity + jitter)) });
      }
    }
  }
  // returning units drive back to base
  const returning = await query(`SELECT * FROM resources WHERE status='returning'`);
  for (const r of returning) {
    const base = { lat: r.base_lat, lng: r.base_lng };
    const stepKm = ((speedFor(r.type) * speed) / 3600) * 1.0; // per real second
    const { distanceKm } = quickEta(r, base, r.type);
    if (distanceKm <= stepKm) {
      const res = await one(`UPDATE resources SET status='available', lat=base_lat, lng=base_lng, updated_at=now() WHERE id=$1 RETURNING *`, [r.id]);
      emit('resource:update', res);
    } else {
      const f = stepKm / distanceKm;
      const p = { lat: r.lat + (base.lat - r.lat) * f, lng: r.lng + (base.lng - r.lng) * f };
      await query(`UPDATE resources SET lat=$2, lng=$3 WHERE id=$1`, [r.id, p.lat, p.lng]);
      emit('resource:move', { id: r.id, lat: p.lat, lng: p.lng, status: 'returning' });
    }
  }
}

const speedFor = (t) => ({ ambulance: 40, fire_truck: 35, rescue_boat: 18, medical_team: 35, relief_truck: 30, ndrf_team: 32 })[t] || 30;

/** Auto-dispatch for critical incidents (severity ≥ 4) the moment they appear. */
export async function autoDispatchCritical() {
  if (!state.autoDispatch) return null;
  const { plan, summary } = await optimise({ commit: false, minSeverity: 4 });
  if (!plan.length) return null;
  for (const p of plan) await createDispatch(p.incident_id, p.resource_id, { method: 'auto-critical', route: p.route, eta: p.eta_min, distance: p.distance_km, engine: p.engine });
  await createAlert({ level: 'info', title: 'Auto-dispatch', message: `${plan.length} unit(s) auto-dispatched to critical incidents (avg ETA ${summary.avg_eta_min} min)` });
  return plan;
}
