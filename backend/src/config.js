import 'dotenv/config';

const bool = (v, d) => (v === undefined || v === '' ? d : v === 'true' || v === '1');

export const config = {
  port: Number(process.env.PORT || 4000),
  env: process.env.NODE_ENV || 'development',
  // Leave DATABASE_URL empty to use embedded PostgreSQL (PGlite) saved in backend/data/local-db
  databaseUrl: process.env.DATABASE_URL || '',
  // Leave MONGO_URL empty to keep unstructured reports in a local file store (backend/data/local-docs*.json)
  mongoUrl: process.env.MONGO_URL || '',
  mlUrl: process.env.ML_URL || 'http://localhost:8000',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL || '15m',
  refreshTokenDays: Number(process.env.REFRESH_TOKEN_DAYS || 7),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  // Simulation: 1 real second = SIM_SPEED simulated seconds
  simEnabled: bool(process.env.SIM_ENABLED, true),
  simSpeed: Number(process.env.SIM_SPEED || 30),
  simIntervalMs: Number(process.env.SIM_INTERVAL_MS || 5000),
  autoDispatch: bool(process.env.AUTO_DISPATCH, true),

  // ---- resilience / offline ----
  nodeId: process.env.NODE_ID || 'chennai-eoc',
  nodeRole: process.env.NODE_ROLE || 'edge', // 'edge' (control room) or 'cloud' (state HQ)
  cloudSyncUrl: process.env.CLOUD_SYNC_URL || '', // e.g. https://drp-cloud.onrender.com
  syncKey: process.env.SYNC_KEY || 'dev-sync-key',
  connectivityUrl: process.env.CONNECTIVITY_CHECK_URL || 'https://api.open-meteo.com',
  tileUrl: process.env.TILE_URL || '', // optional self-hosted tile server for fully offline maps

  // ---- SMS gateway ----
  // simulated | twilio | android (an Android phone running an SMS-gateway app on the LAN)
  smsProvider: process.env.SMS_PROVIDER || 'simulated',
  smsGatewayUrl: process.env.SMS_GATEWAY_URL || '', // e.g. http://192.168.1.20:8080/send
  helplineNumber: process.env.HELPLINE_NUMBER || '+91 90000 11200',
  twilio: {
    sid: process.env.TWILIO_ACCOUNT_SID || '',
    token: process.env.TWILIO_AUTH_TOKEN || '',
    from: process.env.TWILIO_FROM || '',
    to: process.env.ALERT_SMS_TO || '',
  },

  // ---- external data ----
  weatherEnabled: bool(process.env.WEATHER_ENABLED, true),
  weatherIntervalMs: Number(process.env.WEATHER_INTERVAL_MS || 10 * 60 * 1000),
  osrmUrl: process.env.OSRM_URL || 'https://router.project-osrm.org',
  osrmEnabled: bool(process.env.OSRM_ENABLED, true),

  // ---- web push (VAPID) ----
  vapidPublic: process.env.VAPID_PUBLIC_KEY || '',
  vapidPrivate: process.env.VAPID_PRIVATE_KEY || '',
  vapidSubject: process.env.VAPID_SUBJECT || 'mailto:control-room@drp.local',

  // Map centre: Chennai
  region: { name: 'Chennai Metropolitan Area', lat: 13.0285, lng: 80.2207 },
};
