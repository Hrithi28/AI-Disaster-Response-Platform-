// Audit trail: every state-changing API call (POST/PATCH/PUT/DELETE) is
// recorded with who did it, from where, and the result. Controllers can add
// extra context through res.locals.audit = { action, entity, entity_id, details }.
import { json, query } from '../db/postgres.js';

const SKIP = [/^\/api\/auth\/refresh/, /^\/api\/sync\/ingest/, /^\/api\/push\//];
const REDACT = ['password', 'token', 'refresh_token'];

export function auditTrail(req, res, next) {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) || SKIP.some((r) => r.test(req.originalUrl))) return next();
  res.on('finish', () => {
    const extra = res.locals.audit || {};
    const parts = req.originalUrl.split('?')[0].split('/').filter(Boolean); // ['api','incidents','12','resolve']
    const body = { ...(req.body || {}) };
    for (const k of REDACT) if (k in body) body[k] = '•••';
    const who = req.user || res.locals.actor || {};
    query(
      `INSERT INTO audit_logs (user_id, user_email, role, action, entity, entity_id, status, details, ip) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        who.id || null,
        who.email || null,
        who.role || 'anonymous',
        extra.action || `${req.method} /${parts.slice(1).join('/')}`,
        extra.entity || parts[1] || null,
        extra.entity_id != null ? String(extra.entity_id) : parts.find((p) => /^\d+$/.test(p)) || null,
        res.statusCode,
        json({ body: Object.keys(body).length ? body : undefined, ...extra.details }),
        req.ip,
      ],
    ).catch((e) => console.error('[audit]', e.message));
  });
  next();
}
