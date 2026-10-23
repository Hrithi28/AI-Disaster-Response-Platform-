import { one, query } from '../db/postgres.js';
import { emit } from '../services/realtime.js';

export async function list(req, res) {
  const where = req.query.type ? 'WHERE type=$1' : '';
  res.json(await query(`SELECT * FROM resources ${where} ORDER BY type, id`, req.query.type ? [req.query.type] : []));
}

export async function create(req, res) {
  const b = req.body;
  const row = await one(
    `INSERT INTO resources (name, type, base_name, base_lat, base_lng, lat, lng, capacity) VALUES ($1,$2,$3,$4,$5,$4,$5,$6) RETURNING *`,
    [b.name, b.type, b.base_name, b.lat, b.lng, b.capacity],
  );
  emit('resource:update', row);
  res.status(201).json(row);
}

export async function patch(req, res) {
  const cur = await one('SELECT * FROM resources WHERE id=$1', [Number(req.params.id)]);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  if (!['available', 'offline'].includes(cur.status)) return res.status(409).json({ error: `Unit is ${cur.status}; wait until it is back at base` });
  const row = await one('UPDATE resources SET status=$2, updated_at=now() WHERE id=$1 RETURNING *', [cur.id, req.body.status]);
  emit('resource:update', row);
  res.json(row);
}
