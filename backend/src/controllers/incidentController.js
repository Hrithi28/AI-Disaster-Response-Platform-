import { one } from '../db/postgres.js';
import { autoDispatchCritical, outstandingDemand, requirements } from '../services/allocation.js';
import { createIncident, getIncident, listIncidents, rescore, resolveIncident } from '../services/incidents.js';
import { explainSeverity } from '../services/ml.js';
import { emit } from '../services/realtime.js';

export async function list(req, res) {
  res.json(await listIncidents({ status: req.query.status, active: req.query.active === 'true' }));
}

export async function get(req, res) {
  const inc = await getIncident(Number(req.params.id));
  if (!inc) return res.status(404).json({ error: 'Not found' });
  res.json({ ...inc, requirements: requirements(inc), outstanding: await outstandingDemand(inc) });
}

export async function explain(req, res) {
  const inc = await one('SELECT features FROM incidents WHERE id=$1', [Number(req.params.id)]);
  if (!inc) return res.status(404).json({ error: 'Not found' });
  res.json(await explainSeverity(inc.features));
}

export async function create(req, res) {
  const inc = await createIncident({ ...req.body, source: req.user.role === 'responder' ? 'field' : 'manual' });
  if (inc.severity >= 4) await autoDispatchCritical();
  res.locals.audit = { action: 'incident.create', entity: 'incident', entity_id: inc.id };
  res.status(201).json(inc);
}

export async function patch(req, res) {
  const id = Number(req.params.id);
  let inc = await one('SELECT * FROM incidents WHERE id=$1', [id]);
  if (!inc) return res.status(404).json({ error: 'Not found' });
  const { status, ...featurePatch } = req.body;
  if (Object.keys(featurePatch).length) inc = await rescore(inc, featurePatch);
  if (status) {
    inc = await one('UPDATE incidents SET status=$2, updated_at=now() WHERE id=$1 RETURNING *', [id, status]);
    emit('incident:update', inc);
  }
  res.json(inc);
}

export async function resolve(req, res) {
  res.locals.audit = { action: 'incident.resolve', entity: 'incident', entity_id: req.params.id, details: { actual_severity: req.body.actual_severity } };
  res.json(await resolveIncident(Number(req.params.id), req.body.actual_severity));
}
