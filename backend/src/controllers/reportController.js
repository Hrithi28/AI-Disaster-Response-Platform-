import { store } from '../db/mongo.js';
import { one } from '../db/postgres.js';
import { processReport } from '../services/reports.js';

export async function list(req, res) {
  res.json(await store.listReports({ channel: req.query.channel, limit: Math.min(200, Number(req.query.limit) || 50) }));
}

export async function sos(req, res) {
  const b = req.body;
  res.status(201).json(
    await processReport({ channel: 'sos', text: b.text, lat: b.lat, lng: b.lng, author: b.name || req.user?.name || 'Anonymous citizen', phone: b.phone, people: b.people, disasterType: b.disaster_type }),
  );
}

export async function field(req, res) {
  const b = req.body;
  res.status(201).json(await processReport({ channel: 'field', text: b.text, lat: b.lat, lng: b.lng, author: req.user.name, people: b.people, disasterType: b.disaster_type }));
}

export async function social(req, res) {
  res.status(201).json(await processReport({ channel: 'social', ...req.body, author: 'manual import' }));
}

export async function track(req, res) {
  const inc = await one(`SELECT id, title, status, severity_label, locality, updated_at FROM incidents WHERE id=$1`, [Number(req.params.incidentId)]);
  if (!inc) return res.status(404).json({ error: 'Not found' });
  const d = await one(`SELECT COUNT(*)::int AS n, MIN(eta_min) AS eta FROM dispatches WHERE incident_id=$1 AND status IN ('en_route','on_scene')`, [inc.id]);
  res.json({ ...inc, units_assigned: d.n, best_eta_min: d.eta });
}
