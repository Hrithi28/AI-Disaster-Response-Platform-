import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function signToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role, resource_id: user.resource_id, camp_id: user.camp_id },
    config.jwtSecret,
    { expiresIn: config.accessTokenTtl },
  );
}

/** Attaches req.user when a valid Bearer token is present (never rejects). */
export function optionalAuth(req, _res, next) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(h.slice(7), config.jwtSecret);
    } catch (e) {
      req.authError = e.name === 'TokenExpiredError' ? 'token_expired' : 'invalid_token';
    }
  }
  next();
}

export function requireAuth(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required', code: req.authError || 'no_token' });
    if (roles.length && !roles.includes(req.user.role)) return res.status(403).json({ error: `Requires role: ${roles.join(' or ')}` });
    next();
  };
}

/** zod validation helper */
export const validate = (schema) => (req, res, next) => {
  const r = schema.safeParse(req.body);
  if (!r.success) return res.status(400).json({ error: 'Validation failed', details: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
  req.body = r.data;
  next();
};
