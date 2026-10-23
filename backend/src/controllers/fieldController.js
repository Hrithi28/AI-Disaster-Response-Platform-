import { one, query } from '../db/postgres.js';

// Field Team Mobile App: the responder's unit, current assignment and history
export async function assignment(req, res) {
  const resourceId = req.user.role === 'admin' ? Number(req.query.resource_id) : req.user.resource_id;
  const resource = await one('SELECT * FROM resources WHERE id=$1', [resourceId]);
  if (!resource) return res.status(404).json({ error: 'No unit linked to this account' });
  const current = await one(
    `SELECT d.*, i.title, i.description, i.disaster_type, i.lat AS incident_lat, i.lng AS incident_lng, i.locality, i.severity,
            i.severity_label, i.severity_score, i.affected_people, i.injured, i.needs, i.status AS incident_status
     FROM dispatches d JOIN incidents i ON i.id=d.incident_id
     WHERE d.resource_id=$1 AND d.status IN ('en_route','on_scene') ORDER BY d.id DESC LIMIT 1`,
    [resourceId],
  );
  const history = await query(
    `SELECT d.id, d.status, d.eta_min, d.created_at, d.completed_at, i.title FROM dispatches d JOIN incidents i ON i.id=d.incident_id
     WHERE d.resource_id=$1 ORDER BY d.id DESC LIMIT 10`,
    [resourceId],
  );
  res.json({ resource, current, history, server_time: new Date().toISOString() });
}
