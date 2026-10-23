import bcrypt from 'bcryptjs';
import { one, query } from '../db/postgres.js';
import { sendSms } from '../services/sms.js';
import { publicUser } from './authController.js';

export async function list(req, res) {
  const where = req.query.role ? 'WHERE role=$1' : '';
  const rows = await query(`SELECT * FROM users ${where} ORDER BY id`, req.query.role ? [req.query.role] : []);
  res.json(rows.map(publicUser));
}

export async function create(req, res) {
  const b = req.body;
  if (await one('SELECT id FROM users WHERE email=$1', [b.email.toLowerCase()])) return res.status(409).json({ error: 'Email already registered' });
  const u = await one(
    `INSERT INTO users (name, email, password_hash, role, phone, resource_id, organization, volunteer_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [b.name, b.email.toLowerCase(), bcrypt.hashSync(b.password, 8), b.role, b.phone || null, b.resource_id || null, b.organization || null, b.role === 'volunteer' ? 'approved' : null],
  );
  res.status(201).json(publicUser(u));
}

export async function update(req, res) {
  const id = Number(req.params.id);
  const cur = await one('SELECT * FROM users WHERE id=$1', [id]);
  if (!cur) return res.status(404).json({ error: 'User not found' });
  if (id === req.user.id && (req.body.is_active === false || (req.body.role && req.body.role !== 'admin')))
    return res.status(400).json({ error: 'You cannot disable or demote your own account' });
  const fields = ['role', 'is_active', 'resource_id', 'camp_id', 'volunteer_status', 'phone', 'organization'];
  const sets = [];
  const params = [id];
  // Approving a volunteer without choosing a camp: assign the open camp with the most free space,
  // so the volunteer's camp portal works immediately after login.
  if (cur.role === 'volunteer' && req.body.volunteer_status === 'approved' && req.body.camp_id === undefined && !cur.camp_id) {
    const best = await one(`SELECT id FROM camps WHERE status='open' ORDER BY (capacity - occupancy) DESC, id LIMIT 1`);
    if (best) req.body.camp_id = best.id;
  }
  for (const f of fields) if (req.body[f] !== undefined) sets.push(`${f}=$${params.push(req.body[f])}`);
  if (!sets.length) return res.json(publicUser(cur));
  const u = await one(`UPDATE users SET ${sets.join(', ')} WHERE id=$1 RETURNING *`, params);
  if (req.body.is_active === false) await query('UPDATE refresh_tokens SET revoked=true WHERE user_id=$1', [id]);
  if (cur.role === 'volunteer' && req.body.volunteer_status === 'approved' && cur.volunteer_status !== 'approved' && u.phone) {
    const camp = u.camp_id ? await one('SELECT name FROM camps WHERE id=$1', [u.camp_id]) : null;
    await sendSms({ phone: u.phone, body: `DRP: Your volunteer registration is approved${camp ? `. Report to ${camp.name}` : ''}. Log in at the DRP portal.` });
  }
  res.json(publicUser(u));
}
