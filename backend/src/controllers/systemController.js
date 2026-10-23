import QRCode from 'qrcode';
import { config } from '../config.js';
import { mongoMode, store } from '../db/mongo.js';
import { one, pgMode, query } from '../db/postgres.js';
import { lanAddresses, setForcedOffline, status as connectivityStatus, checkInternet } from '../services/connectivity.js';
import { analyseSensor, checkMl, classifyReport, explainSeverity, mlStatus, modelComparison, modelInfo, predictSeverity, retrain } from '../services/ml.js';
import { listAlerts } from '../services/notifier.js';
import { connectedClients, emit } from '../services/realtime.js';
import { refreshZones, triggerScenario } from '../services/simulator.js';
import { state } from '../services/state.js';
import { status as syncStatus } from '../services/sync.js';
import { liveScenarioIntensity, refreshWeather, weather } from '../services/weather.js';
import { feeds, refreshFeeds } from '../services/feeds.js';
import { roadGraphInfo } from '../services/roadGraph.js';
import { streetCount } from '../data/chennai.js';

export async function health(_req, res) {
  res.json({
    status: 'ok',
    node: { id: config.nodeId, role: config.nodeRole },
    postgres: pgMode,
    documentStore: mongoMode,
    ml: mlStatus,
    connectivity: connectivityStatus(),
    clients: connectedClients(),
    uptime_s: Math.round(process.uptime()),
  });
}

export const clientConfig = (_req, res) =>
  res.json({ tileUrl: config.tileUrl || null, helpline: config.helplineNumber, nodeId: config.nodeId, nodeRole: config.nodeRole, smsProvider: config.smsProvider });

// ---- alerts, zones, sensors ----
export const alerts = async (req, res) => res.json(await listAlerts(Math.min(200, Number(req.query.limit) || 50)));
export const ackAlert = async (req, res) => res.json(await one('UPDATE alerts SET acknowledged=true WHERE id=$1 RETURNING *', [Number(req.params.id)]));
export const zones = (_req, res) => res.json(state.zones);
export const zonesRefresh = async (_req, res) => res.json(await refreshZones());
export const sensors = async (_req, res) => res.json(await query('SELECT * FROM sensors ORDER BY code'));
export const sensorReadings = async (req, res) => res.json(await store.recentReadings(req.params.code, 40));

// ---- AI / ML proxy ----
export async function mlModels(_req, res) {
  try {
    res.json({ online: true, ...(await modelInfo()) });
  } catch {
    await checkMl();
    res.json({ online: false });
  }
}
export const mlPredict = async (req, res) => res.json(await predictSeverity(req.body));
export const mlExplain = async (req, res) => res.json(await explainSeverity(req.body));
export const mlClassify = async (req, res) => res.json(await classifyReport(req.body.text));
export const mlAnomaly = async (req, res) => res.json(await analyseSensor(req.body.sensor_type, req.body.value, req.body.previous));
export async function mlComparison(_req, res) {
  try {
    res.json(await modelComparison());
  } catch (e) {
    res.status(503).json({ error: 'ML service unavailable', detail: e.message });
  }
}
export async function mlRetrain(_req, res) {
  try {
    const out = await retrain();
    emit('ml:retrained', out);
    res.json(out);
  } catch (e) {
    res.status(503).json({ error: 'ML service unavailable', detail: e.message });
  }
}

// ---- simulation ----
export const simulation = (_req, res) => res.json({ ...state.sim, scenario: state.scenario, autoDispatch: state.autoDispatch, lastOptimisation: state.lastOptimisation });
export function setSimulation(req, res) {
  if (req.body.enabled !== undefined) state.sim.enabled = req.body.enabled;
  if (req.body.speed !== undefined) state.sim.speed = req.body.speed;
  if (req.body.autoDispatch !== undefined) state.autoDispatch = req.body.autoDispatch;
  const out = { ...state.sim, scenario: state.scenario, autoDispatch: state.autoDispatch };
  emit('simulation:update', out);
  res.json(out);
}
export async function scenario(req, res) {
  if (req.body.type === 'live') {
    const intensity = liveScenarioIntensity();
    if (intensity == null) return res.status(409).json({ error: 'Live weather is not available (no internet or Open-Meteo unreachable). Using simulated scenarios instead.' });
    return res.json(await triggerScenario({ type: 'flood', intensity, name: `Live weather – Open-Meteo (${weather.summary.imd_category} rain)` }));
  }
  res.json(await triggerScenario(req.body));
}

// ---- resilience ----
export async function connectivity(_req, res) {
  res.json({ ...connectivityStatus(), lan: lanAddresses(), sync: await syncStatus(), weather: { source: weather.source, updatedAt: weather.updatedAt } });
}
export async function setConnectivity(req, res) {
  const out = setForcedOffline(req.body.forcedOffline);
  if (!req.body.forcedOffline) await checkInternet();
  res.locals.audit = { action: req.body.forcedOffline ? 'resilience.simulate_outage' : 'resilience.restore', entity: 'system' };
  res.json(out);
}
export async function lan(req, res) {
  const port = req.socket.localPort || config.port;
  const addrs = lanAddresses(port);
  const target = (addrs[0]?.url || `http://localhost:${port}`) + (req.query.path || '/field');
  res.json({ addresses: addrs, target, qr_svg: await QRCode.toString(target, { type: 'svg', margin: 1, color: { dark: '#0b1120', light: '#ffffff' } }) });
}

// ---- weather ----
export const getWeather = (_req, res) => res.json(weather);
export const getFeeds = (_req, res) => res.json(feeds);
export const refreshFeedsNow = async (_req, res) => res.json(await refreshFeeds());
export const mapInfo = (_req, res) => res.json({ road_graph: roadGraphInfo(), street_names: streetCount(), tiles: '/offline/chennai-streets.pmtiles', attribution: '© OpenStreetMap contributors (ODbL)' });
export const refreshWeatherNow = async (_req, res) => res.json(await refreshWeather());
