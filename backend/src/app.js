// Express application (no network listening here, so tests can import it).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { config } from './config.js';
import { buildOpenApi } from './docs/openapi.js';
import { auditTrail } from './middleware/audit.js';
import { optionalAuth } from './middleware/auth.js';
import { idempotent } from './middleware/idempotency.js';
import routes from './routes/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function buildApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false })); // Twilio webhooks
  if (config.env !== 'test') app.use(morgan('dev', { skip: (req) => req.method === 'GET' }));

  const spec = buildOpenApi();
  app.get('/api/openapi.json', (_req, res) => res.json(spec));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'DRP API docs' }));

  app.use('/api', optionalAuth, idempotent, auditTrail, routes);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API route' }));

  // Serve the built React app (single-port production mode)
  const dist = path.resolve(__dirname, '../../frontend/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { setHeaders: (res, p) => p.endsWith('sw.js') && res.setHeader('cache-control', 'no-cache') }));
    app.get(/^\/(?!api|socket\.io).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  // Express 5 forwards async errors here automatically
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error('[error]', err);
    res.status(status).json({ error: err.message || 'Internal error' });
  });
  return app;
}
