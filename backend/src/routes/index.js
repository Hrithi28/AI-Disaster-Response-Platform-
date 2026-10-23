// Route table (MVC "routes" layer): URL + middleware + validation → controller.
// Business logic lives in services/, HTTP handling in controllers/.
import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import * as allocation from '../controllers/allocationController.js';
import * as analytics from '../controllers/analyticsController.js';
import * as audit from '../controllers/auditController.js';
import * as auth from '../controllers/authController.js';
import * as camps from '../controllers/campController.js';
import * as exportsC from '../controllers/exportController.js';
import * as field from '../controllers/fieldController.js';
import * as gateway from '../controllers/gatewayController.js';
import * as incidents from '../controllers/incidentController.js';
import * as push from '../controllers/pushController.js';
import * as reports from '../controllers/reportController.js';
import * as resources from '../controllers/resourceController.js';
import * as sync from '../controllers/syncController.js';
import * as system from '../controllers/systemController.js';
import * as users from '../controllers/userController.js';
import * as voice from '../controllers/voiceController.js';
import { requireAuth, validate } from '../middleware/auth.js';

const r = Router();
const ADMIN = requireAuth('admin');
const STAFF = requireAuth('admin', 'responder');
const DISASTER = z.enum(['flood', 'cyclone', 'earthquake', 'fire', 'landslide']);
const RESOURCE_TYPES = z.enum(['ambulance', 'rescue_boat', 'fire_truck', 'medical_team', 'relief_truck', 'ndrf_team']);
const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);
const limiter = (limit) => rateLimit({ windowMs: 60_000, limit, standardHeaders: 'draft-7', legacyHeaders: false });

// ---------------- Auth & users ----------------
r.post('/auth/login', limiter(30), validate(z.object({ email: z.string().email(), password: z.string().min(1) })), auth.login);
r.post('/auth/register', validate(z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(6), phone: z.string().optional() })), auth.register);
r.post(
  '/auth/register-volunteer',
  limiter(10),
  validate(z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(6), phone: z.string().min(8), organization: z.string().optional(), skills: z.array(z.string()).optional() })),
  auth.registerVolunteer,
);
r.post('/auth/refresh', validate(z.object({ refresh_token: z.string().min(10) })), auth.refresh);
r.post('/auth/logout', auth.logout);
r.post('/auth/forgot-password', limiter(5), validate(z.object({ email: z.string().email() })), auth.forgotPassword);
r.post('/auth/reset-password', validate(z.object({ token: z.string().min(10), password: z.string().min(6) })), auth.resetPassword);
r.get('/auth/me', requireAuth(), auth.me);

r.get('/users', ADMIN, users.list);
r.post(
  '/users',
  ADMIN,
  validate(z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(6), role: z.enum(['admin', 'responder', 'citizen', 'volunteer']), phone: z.string().optional(), resource_id: z.number().int().optional(), organization: z.string().optional() })),
  users.create,
);
r.patch(
  '/users/:id',
  ADMIN,
  validate(
    z.object({
      role: z.enum(['admin', 'responder', 'citizen', 'volunteer']).optional(),
      is_active: z.boolean().optional(),
      resource_id: z.number().int().nullable().optional(),
      camp_id: z.number().int().nullable().optional(),
      volunteer_status: z.enum(['pending', 'approved', 'rejected']).optional(),
      phone: z.string().optional(),
      organization: z.string().optional(),
    }),
  ),
  users.update,
);

// ---------------- Incidents ----------------
r.get('/incidents', incidents.list);
r.get('/incidents/:id', incidents.get);
r.get('/incidents/:id/explain', incidents.explain);
r.post(
  '/incidents',
  STAFF,
  validate(
    z.object({
      title: z.string().min(3).optional(),
      description: z.string().optional(),
      disaster_type: DISASTER,
      lat,
      lng,
      locality: z.string().optional(),
      affected_people: z.number().int().min(0).optional(),
      injured: z.number().int().min(0).optional(),
      needs: z.array(z.string()).optional(),
      features: z.record(z.string(), z.any()).optional(),
    }),
  ),
  incidents.create,
);
r.patch(
  '/incidents/:id',
  STAFF,
  validate(z.object({ status: z.enum(['open', 'assigned', 'in_progress']).optional(), affected_people: z.number().int().min(0).optional(), injured: z.number().int().min(0).optional(), infrastructure_damage: z.number().min(0).max(1).optional(), water_level_m: z.number().min(0).optional() })),
  incidents.patch,
);
r.post('/incidents/:id/resolve', STAFF, validate(z.object({ actual_severity: z.number().int().min(1).max(5) })), incidents.resolve);

// ---------------- Resources ----------------
r.get('/resources', resources.list);
r.post('/resources', ADMIN, validate(z.object({ name: z.string().min(2), type: RESOURCE_TYPES, base_name: z.string().min(2), lat, lng, capacity: z.number().int().min(1).default(1) })), resources.create);
r.patch('/resources/:id', ADMIN, validate(z.object({ status: z.enum(['available', 'offline']) })), resources.patch);

// ---------------- Allocation ----------------
r.get('/allocation/queue', allocation.queue);
r.post('/allocation/optimize', ADMIN, validate(z.object({ commit: z.boolean().default(false), min_severity: z.number().int().min(1).max(5).default(1) })), allocation.optimize);
r.get('/allocation/nearest/:incidentId', allocation.nearest);
r.get('/allocation/route', allocation.route);
r.post('/allocation/dispatch', ADMIN, validate(z.object({ incident_id: z.number().int(), resource_id: z.number().int() })), allocation.dispatch);
r.get('/allocation/dispatches', allocation.dispatches);
r.patch('/allocation/dispatches/:id', STAFF, validate(z.object({ status: z.enum(['on_scene', 'completed', 'cancelled']), actual_severity: z.number().int().min(1).max(5).optional() })), allocation.patchDispatch);
r.get('/field/assignment', STAFF, field.assignment);

// ---------------- Reports (web) ----------------
const reportSchema = z.object({
  text: z.string().min(5).max(1000),
  lat,
  lng,
  people: z.number().int().min(1).max(10000).optional(),
  name: z.string().max(80).optional(),
  phone: z.string().max(20).optional(),
  disaster_type: DISASTER.optional(),
});
r.get('/reports', reports.list);
r.post('/reports/sos', limiter(20), validate(reportSchema), reports.sos);
r.post('/reports/field', STAFF, validate(reportSchema.omit({ name: true, phone: true })), reports.field);
r.post('/reports/social', ADMIN, validate(reportSchema.pick({ text: true, lat: true, lng: true })), reports.social);
r.get('/reports/track/:incidentId', reports.track);

// ---------------- Low-bandwidth gateway (SMS / LoRa / radio) ----------------
r.post('/gateway/sms', limiter(120), gateway.smsInbound); // Twilio / Android SMS gateway webhook
r.post(
  '/gateway/mesh',
  limiter(120),
  validate(z.object({ from: z.string().min(1), text: z.string().min(2).max(500), channel: z.enum(['lora', 'radio', 'sms']).default('lora'), lat: lat.optional(), lng: lng.optional(), node: z.string().optional(), snr: z.number().optional(), hops: z.number().optional() })),
  gateway.meshInbound,
);
const audioBody = express.raw({ type: ['audio/wav', 'audio/x-wav', 'audio/wave', 'application/octet-stream'], limit: '12mb' });
r.post('/gateway/voice', limiter(60), audioBody, voice.gatewayVoice); // 2G voice call / voice note / radio recording
r.get('/gateway/messages', ADMIN, gateway.messages);

// ---------------- Voice (offline speech-to-text) ----------------
r.get('/voice/info', voice.info);
r.post('/voice/transcribe', limiter(60), audioBody, voice.transcribeAudio);
r.get('/gateway/info', gateway.info);

// ---------------- Relief camps, inventory, evacuation ----------------
r.get('/camps', camps.list);
r.get('/camps/:id', camps.get);
r.post('/camps', ADMIN, validate(z.object({ name: z.string().min(3), locality: z.string().optional(), lat, lng, capacity: z.number().int().min(1), contact: z.string().optional() })), camps.create);
r.post('/camps/:id/occupancy', requireAuth('admin', 'volunteer'), validate(z.object({ delta: z.number().int() })), camps.occupancy);
r.patch('/camps/:id', ADMIN, validate(z.object({ status: z.enum(['open', 'full', 'closed']) })), camps.status);
r.post('/camps/:id/stock', requireAuth('admin', 'volunteer'), validate(z.object({ item: z.string(), delta: z.number(), reason: z.string().min(2).max(120) })), camps.stock);
r.put(
  '/camps/:id/items',
  ADMIN,
  validate(z.object({ item: z.string().min(2), category: z.string(), unit: z.string(), quantity: z.number().min(0), min_level: z.number().min(0), per_person_daily: z.number().min(0).default(0) })),
  camps.item,
);
r.post('/camps/:id/resupply', requireAuth('admin', 'volunteer'), camps.requestResupply);
r.get('/evacuation/plan', camps.evacuationPlan);
r.post('/evacuation/execute', ADMIN, camps.evacuationExecute);

// ---------------- Analytics, audit, exports ----------------
r.get('/analytics/summary', analytics.summary);
r.get('/audit', ADMIN, audit.list);
r.get('/exports/sitrep.pdf', ADMIN, exportsC.sitrep);
r.get('/exports/:dataset.csv', ADMIN, exportsC.csv);

// ---------------- System, AI, simulation ----------------
r.get('/health', system.health);
r.get('/config', system.clientConfig);
r.get('/alerts', system.alerts);
r.patch('/alerts/:id/ack', ADMIN, system.ackAlert);
r.get('/zones', system.zones);
r.post('/zones/refresh', system.zonesRefresh);
r.get('/sensors', system.sensors);
r.get('/sensors/:code/readings', system.sensorReadings);
r.get('/weather', system.getWeather);
r.post('/weather/refresh', ADMIN, system.refreshWeatherNow);
r.get('/feeds', system.getFeeds);
r.post('/feeds/refresh', ADMIN, system.refreshFeedsNow);
r.get('/map/info', system.mapInfo);

r.get('/ml/models', system.mlModels);
r.get('/ml/comparison', system.mlComparison);
r.post('/ml/predict', system.mlPredict);
r.post('/ml/explain', system.mlExplain);
r.post('/ml/classify', validate(z.object({ text: z.string().min(3) })), system.mlClassify);
r.post('/ml/anomaly', validate(z.object({ sensor_type: z.enum(['rain_gauge', 'water_level', 'seismic', 'wind']), value: z.number(), previous: z.number().optional() })), system.mlAnomaly);
r.post('/ml/retrain', ADMIN, system.mlRetrain);

r.get('/simulation', system.simulation);
r.post('/simulation', ADMIN, validate(z.object({ enabled: z.boolean().optional(), speed: z.number().min(1).max(120).optional(), autoDispatch: z.boolean().optional() })), system.setSimulation);
r.post('/simulation/scenario', ADMIN, validate(z.object({ type: z.enum(['flood', 'cyclone', 'earthquake', 'fire', 'landslide', 'live']), intensity: z.number().min(0.1).max(1).default(0.85) })), system.scenario);

// ---------------- Resilience: connectivity, LAN, sync, push ----------------
r.get('/resilience/connectivity', system.connectivity);
r.post('/resilience/connectivity', ADMIN, validate(z.object({ forcedOffline: z.boolean() })), system.setConnectivity);
r.get('/resilience/lan', system.lan);
r.get('/sync/status', sync.getStatus);
r.post('/sync/push', ADMIN, sync.pushNow);
r.post('/sync/ingest', sync.ingest); // authenticated by x-sync-key
r.get('/sync/nodes', sync.nodes);
r.get('/push/key', push.key);
r.post('/push/subscribe', requireAuth(), push.subscribe);
r.post('/push/test', requireAuth(), push.test);

export default r;
