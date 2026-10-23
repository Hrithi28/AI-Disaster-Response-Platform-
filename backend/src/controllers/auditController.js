import { query } from '../db/postgres.js';

export async function list(req, res) {
  const cond = [];
  const params = [];
  if (req.query.user) cond.push(`user_email ILIKE $${params.push(`%${req.query.user}%`)}`);
  if (req.query.entity) cond.push(`entity = $${params.push(req.query.entity)}`);
  if (req.query.action) cond.push(`action ILIKE $${params.push(`%${req.query.action}%`)}`);
  params.push(Math.min(1000, Number(req.query.limit) || 200));
  res.json(await query(`SELECT * FROM audit_logs ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY id DESC LIMIT $${params.length}`, params));
}
