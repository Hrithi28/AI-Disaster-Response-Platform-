// Refresh-token rotation and password-reset tokens. Only SHA-256 hashes are
// stored, so a database leak does not expose usable tokens.
import crypto from 'node:crypto';
import { config } from '../config.js';
import { one, query } from '../db/postgres.js';

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const random = () => crypto.randomBytes(32).toString('base64url');

export async function issueRefreshToken(userId) {
  const token = random();
  await query(`INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)`, [
    userId,
    sha(token),
    new Date(Date.now() + config.refreshTokenDays * 86400000).toISOString(),
  ]);
  return token;
}

/** Validates and rotates: the old token is revoked, a new one is issued. */
export async function rotateRefreshToken(token) {
  const row = await one(`SELECT * FROM refresh_tokens WHERE token_hash=$1`, [sha(token || '')]);
  if (!row) return null;
  if (row.revoked) {
    // reuse of a revoked token → possible theft: revoke the whole family
    await query(`UPDATE refresh_tokens SET revoked=true WHERE user_id=$1`, [row.user_id]);
    return null;
  }
  if (new Date(row.expires_at) < new Date()) return null;
  await query(`UPDATE refresh_tokens SET revoked=true WHERE id=$1`, [row.id]);
  const user = await one(`SELECT * FROM users WHERE id=$1 AND is_active=true`, [row.user_id]);
  if (!user) return null;
  return { user, refreshToken: await issueRefreshToken(user.id) };
}

export async function revokeRefreshToken(token) {
  await query(`UPDATE refresh_tokens SET revoked=true WHERE token_hash=$1`, [sha(token || '')]);
}

export async function createResetToken(userId) {
  const token = random();
  await query(`INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1,$2,$3)`, [userId, sha(token), new Date(Date.now() + 30 * 60000).toISOString()]);
  return token;
}

export async function consumeResetToken(token) {
  const row = await one(`SELECT * FROM password_resets WHERE token_hash=$1 AND used=false`, [sha(token || '')]);
  if (!row || new Date(row.expires_at) < new Date()) return null;
  await query(`UPDATE password_resets SET used=true WHERE id=$1`, [row.id]);
  return row.user_id;
}
