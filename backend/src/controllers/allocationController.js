import { one, query } from '../db/postgres.js';
import { createDispatch, nearestResources, optimise, priorityQueue, updateDispatchStatus } from '../services/allocation.js';
import { routeBetween } from '../services/routing.js';
import { state } from '../services/state.js';

export const queue = async (_req, res) => res.json(await priorityQueue());

export async function optimize(req, res) {
  res.locals.audit = { action: req.body.commit ? 'allocation.optimise.commit' : 'allocation.optimise.preview', entity: 'allocation' };
  res.json(await optimise({ commit: req.body.commit, minSeverity: req.body.min_severity }));
}

export async function nearest(req, res) {
  const list = await nearestResources(Number(req.params.incidentId), req.query.type);
  if (!list) return res.status(404).json({ error: 'Incident not found' });
  res.json(list);
}

export async function route(req, res) {
  const { fromLat, fromLng, toLat, toLng, type = 'ambulance' } = req.query;
  res.json(await routeBetween({ lat: +fromLat, lng: +fromLng }, { lat: +toLat, lng: +toLng }, type, state.zones));
}

export async function dispatch(req, res) {
  const d = await createDispatch(req.body.incident_id, req.body.resource_id, { method: 'manual' });
  res.locals.audit = { action: 'dispatch.create', entity: 'dispatch', entity_id: d.id, details: { incident_id: d.incident_id, resource: d.resource_name } };
  res.status(201).json(d);
}

export async function dispatches(req, res) {
  const active = req.query.active === 'true';
  const limit = Math.min(1000, Number(req.query.limit) || 200);
  res.json(
    await query(
      `SELECT d.*, r.name AS resource_name, r.type AS resource_type, i.title AS incident_title, i.locality, i.severity FROM dispatches d
       JOIN resources r ON r.id=d.resource_id JOIN incidents i ON i.id=d.incident_id
       ${active ? "WHERE d.status IN ('en_route','on_scene')" : ''} ORDER BY d.id DESC LIMIT ${limit}`,
    ),
  );
}

export async function patchDispatch(req, res) {
  const id = Number(req.params.id);
  if (req.user.role === 'responder') {
    const d = await one('SELECT resource_id FROM dispatches WHERE id=$1', [id]);
    if (!d || d.resource_id !== req.user.resource_id) return res.status(403).json({ error: 'Not your assignment' });
  }
  const current = await one('SELECT status FROM dispatches WHERE id=$1', [id]);
  if (current && (current.status === req.body.status || (current.status === 'completed' && req.body.status === 'on_scene'))) {
    // replayed from an offline queue after the server already moved on
    return res.json({ ...(await one('SELECT * FROM dispatches WHERE id=$1', [id])), note: 'already applied' });
  }
  res.locals.audit = { action: `dispatch.${req.body.status}`, entity: 'dispatch', entity_id: id };
  res.json(await updateDispatchStatus(id, req.body.status, { actualSeverity: req.body.actual_severity }));
}
