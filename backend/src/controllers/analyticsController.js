import { store } from '../db/mongo.js';
import { query } from '../db/postgres.js';
import { state } from '../services/state.js';

const mins = (a, b) => ((new Date(b) - new Date(a)) / 60000) * state.sim.speed; // simulated minutes
const avg = (xs) => (xs.length ? +(xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(1) : null);
const countBy = (rows, key) => rows.reduce((m, r) => ((m[r[key]] = (m[r[key]] || 0) + 1), m), {});

export async function summary(_req, res) {
  const incidents = await query('SELECT id, disaster_type, status, severity, actual_severity, created_at, resolved_at, affected_people, injured, source FROM incidents');
  const dispatches = await query('SELECT incident_id, resource_id, status, eta_min, distance_km, method, route_engine, created_at, arrived_at FROM dispatches');
  const resources = await query('SELECT type, status FROM resources');
  const camps = await query('SELECT capacity, occupancy, status FROM camps');
  const sms = await query(`SELECT channel, direction FROM sms_messages`);

  const active = incidents.filter((i) => i.status !== 'resolved');
  const firstDispatch = {};
  for (const d of dispatches) if (!firstDispatch[d.incident_id] || d.created_at < firstDispatch[d.incident_id]) firstDispatch[d.incident_id] = d.created_at;
  const byId = Object.fromEntries(incidents.map((i) => [i.id, i]));
  const dispatchDelay = Object.entries(firstDispatch).map(([id, t]) => mins(byId[id].created_at, t));
  const travel = dispatches.filter((d) => d.arrived_at).map((d) => mins(d.created_at, d.arrived_at));
  const resolution = incidents.filter((i) => i.resolved_at).map((i) => mins(i.created_at, i.resolved_at));

  const resByType = {};
  for (const r of resources) {
    const t = (resByType[r.type] ||= { type: r.type, total: 0, available: 0, busy: 0, offline: 0 });
    t.total++;
    if (r.status === 'available') t.available++;
    else if (r.status === 'offline') t.offline++;
    else t.busy++;
  }
  const busy = resources.filter((r) => !['available', 'offline'].includes(r.status)).length;

  const now = Date.now();
  const BUCKET = 30000;
  const timeline = Array.from({ length: 30 }, (_, k) => {
    const start = now - (30 - k) * BUCKET;
    const end = start + BUCKET;
    const inB = (t) => t && new Date(t).getTime() >= start && new Date(t).getTime() < end;
    return { t: new Date(end).toISOString(), reported: incidents.filter((i) => inB(i.created_at)).length, resolved: incidents.filter((i) => inB(i.resolved_at)).length, dispatched: dispatches.filter((d) => inB(d.created_at)).length };
  });

  const validated = incidents.filter((i) => i.actual_severity);
  res.json({
    totals: {
      incidents: incidents.length,
      active: active.length,
      resolved: incidents.length - active.length,
      critical_active: active.filter((i) => i.severity >= 4).length,
      people_affected: active.reduce((s, i) => s + i.affected_people, 0),
      injured: active.reduce((s, i) => s + i.injured, 0),
      dispatches: dispatches.length,
      active_dispatches: dispatches.filter((d) => ['en_route', 'on_scene'].includes(d.status)).length,
      camp_capacity: camps.reduce((s, c) => s + c.capacity, 0),
      camp_occupancy: camps.reduce((s, c) => s + c.occupancy, 0),
      sms_in: sms.filter((m) => m.direction === 'in').length,
      sms_out: sms.filter((m) => m.direction === 'out').length,
    },
    response: {
      avg_dispatch_delay_min: avg(dispatchDelay),
      avg_travel_min: avg(travel),
      avg_planned_eta_min: avg(dispatches.map((d) => d.eta_min)),
      avg_resolution_min: avg(resolution),
      sim_speed: state.sim.speed,
    },
    byType: countBy(incidents, 'disaster_type'),
    byStatus: countBy(incidents, 'status'),
    bySource: countBy(incidents, 'source'),
    dispatchMethods: countBy(dispatches, 'method'),
    routeEngines: countBy(dispatches.filter((d) => d.route_engine), 'route_engine'),
    severityDistribution: [1, 2, 3, 4, 5].map((s) => ({ severity: s, active: active.filter((i) => i.severity === s).length, all: incidents.filter((i) => i.severity === s).length })),
    resources: { total: resources.length, busy, utilisation_pct: resources.length ? Math.round((busy / resources.length) * 100) : 0, byType: Object.values(resByType) },
    timeline,
    reports: await store.reportStats(),
    lowBandwidth: countBy(sms.filter((m) => m.direction === 'in'), 'channel'),
    modelValidation: {
      samples: validated.length,
      exact_pct: validated.length ? Math.round((validated.filter((i) => i.actual_severity === i.severity).length / validated.length) * 100) : null,
      within_one_pct: validated.length ? Math.round((validated.filter((i) => Math.abs(i.actual_severity - i.severity) <= 1).length / validated.length) * 100) : null,
    },
    lastOptimisation: state.lastOptimisation,
    scenario: state.scenario,
  });
}
