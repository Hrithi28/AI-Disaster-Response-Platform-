import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { one, query } from '../db/postgres.js';
import { signToken } from '../middleware/auth.js';
import { sendSms } from '../services/sms.js';
import { consumeResetToken, createResetToken, issueRefreshToken, revokeRefreshToken, rotateRefreshToken } from '../services/tokens.js';

export const publicUser = ({ password_hash, ...u }) => u;

async function session(user) {
  return { token: signToken(user), refresh_token: await issueRefreshToken(user.id), user: publicUser(user) };
}

export async function login(req, res) {
  const user = await one('SELECT * FROM users WHERE email = $1', [req.body.email.toLowerCase()]);
  res.locals.audit = { action: 'auth.login', entity: 'user', details: { email: req.body.email } };
  if (!user || !bcrypt.compareSync(req.body.password, user.password_hash)) return res.status(401).json({ error: 'Invalid email or password' });
  if (!user.is_active) return res.status(403).json({ error: 'Account disabled. Contact the control room.' });
  if (user.role === 'volunteer' && user.volunteer_status !== 'approved') return res.status(403).json({ error: 'Your volunteer registration is waiting for approval. The control room must approve it first (Users & Volunteers → Approve), then you can log in.' });
  await query('UPDATE users SET last_login=now() WHERE id=$1', [user.id]);
  res.locals.actor = user;
  res.json(await session(user));
}

export async function register(req, res) {
  const exists = await one('SELECT id FROM users WHERE email = $1', [req.body.email.toLowerCase()]);
  if (exists) return res.status(409).json({ error: 'Email already registered' });
  const user = await one(`INSERT INTO users (name, email, password_hash, role, phone) VALUES ($1,$2,$3,'citizen',$4) RETURNING *`, [
    req.body.name, req.body.email.toLowerCase(), bcrypt.hashSync(req.body.password, 8), req.body.phone || null,
  ]);
  res.status(201).json(await session(user));
}

export async function registerVolunteer(req, res) {
  const b = req.body;
  const exists = await one('SELECT id FROM users WHERE email = $1', [b.email.toLowerCase()]);
  if (exists) return res.status(409).json({ error: 'Email already registered' });
  const user = await one(
    `INSERT INTO users (name, email, password_hash, role, phone, organization, skills, volunteer_status) VALUES ($1,$2,$3,'volunteer',$4,$5,$6,'pending') RETURNING *`,
    [b.name, b.email.toLowerCase(), bcrypt.hashSync(b.password, 8), b.phone, b.organization || 'Individual', JSON.stringify(b.skills || [])],
  );
  res.locals.actor = user;
  res.status(201).json({ user: publicUser(user), message: 'Registration received and saved on the control-room server (no internet needed). You can log in after the control room approves you and assigns a relief camp (admin: Users & Volunteers → Approve).' });
}

export async function me(req, res) {
  const user = await one('SELECT * FROM users WHERE id = $1', [req.user.id]);
  res.json(user ? publicUser(user) : null);
}

export async function refresh(req, res) {
  const out = await rotateRefreshToken(req.body.refresh_token);
  if (!out) return res.status(401).json({ error: 'Session expired, please log in again', code: 'refresh_invalid' });
  res.json({ token: signToken(out.user), refresh_token: out.refreshToken, user: publicUser(out.user) });
}

export async function logout(req, res) {
  if (req.body?.refresh_token) await revokeRefreshToken(req.body.refresh_token);
  res.json({ ok: true });
}

export async function forgotPassword(req, res) {
  const user = await one('SELECT * FROM users WHERE email=$1 AND is_active=true', [req.body.email.toLowerCase()]);
  const generic = { message: 'If the account exists, a reset link has been sent.' };
  if (!user) return res.json(generic);
  const token = await createResetToken(user.id);
  const link = `${req.headers.origin || `http://localhost:${config.port}`}/reset-password?token=${token}`;
  console.log(`[password-reset] ${user.email}: ${link}`);
  // Delivered by SMS when a phone is on file (works offline through the SMS gateway)
  if (user.phone) await sendSms({ phone: user.phone, body: `DRP password reset link (valid 30 min): ${link}` });
  // In development the link is returned so the demo works without email/SMS
  res.json(config.env === 'production' ? generic : { ...generic, dev_reset_link: link });
}

export async function resetPassword(req, res) {
  const userId = await consumeResetToken(req.body.token);
  if (!userId) return res.status(400).json({ error: 'Reset link is invalid or has expired' });
  await query('UPDATE users SET password_hash=$2 WHERE id=$1', [userId, bcrypt.hashSync(req.body.password, 8)]);
  await query('UPDATE refresh_tokens SET revoked=true WHERE user_id=$1', [userId]);
  res.locals.audit = { action: 'auth.password_reset', entity: 'user', entity_id: userId };
  res.json({ ok: true, message: 'Password updated. Please log in.' });
}
