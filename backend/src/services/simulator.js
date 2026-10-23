// Live data simulator for demos. Emulates the four Data Ingestion sources from
// the architecture: satellite/weather feeds (scenario intensity), social-media
// reports, IoT field sensors, and citizen SOS requests. Every item goes through
// the same pipeline real data would (NLP → fusion → severity → allocation).
import { LOCALITIES, SENSORS } from '../data/chennai.js';
import { one, query } from '../db/postgres.js';
import { store } from '../db/mongo.js';
import { autoDispatchCritical, lifecycleTick } from './allocation.js';
import { createIncident } from './incidents.js';
import { processReport } from './reports.js';
import { consumeTick } from './camps.js';
import { receiveMessage } from './sms.js';
import { analyseSensor, riskZones } from './ml.js';
import { createAlert } from './notifier.js';
import { emit } from './realtime.js';
import { state } from './state.js';

const SOCIAL = {
  flood: [
    '{n} people trapped on rooftop in {loc}, water rising fast please help',
    'water entered houses in {loc}, {n} families need shelter tonight',
    'no drinking water in {loc} since yesterday #ChennaiRains',
    'subway flooded at {loc}, cars stuck',
    'elderly woman injured and stranded at {loc}, need ambulance urgently',
    'need boats to evacuate residents of {loc} immediately',
    'relief camp at {loc} running out of food and water',
    'water level at {loc} has started receding',
    'power lines down across main road at {loc}',
  ],
  cyclone: [
    'roof blown off by wind at {loc}, family has nowhere to stay',
    'huge tree fallen blocking the road at {loc}',
    '{n} fishermen missing off the coast near {loc}',
    'people injured by flying debris in {loc}, need doctor',
    'mobile network down in {loc} since last night',
    'houses flooded in {loc}, {n} people need shelter tonight',
  ],
  earthquake: [
    'building collapsed at {loc}, people trapped under debris',
    '{n} people injured after collapse at {loc}, bleeding badly',
    'cracks in apartment walls at {loc}, residents evacuated need shelter',
    'bridge damaged near {loc}, road cut off',
  ],
  fire: ['huge fire at chemical factory in {loc}, thick smoke', 'fire spreading in warehouse near {loc}', 'people hurt in fire at {loc}, need ambulance'],
  landslide: ['landslide buried two houses at {loc}, people inside', 'road blocked by landslide near {loc}'],
};
const SOS = [
  'SOS {n} of us stuck on second floor, water rising, kids with us',
  'my father has chest pain and roads are flooded, need ambulance',
  'we have no food or water for 2 days, {n} people here',
  'house collapsed, my neighbour is injured',
];
const NAMES = ['@chennai_updates', '@rain_watch', '@local_citizen', '@velachery_resident', '@ndtv_tn_live', '@tn_weatherman', '@volunteer_ch'];

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const fill = (tpl, loc) => tpl.replace('{n}', String(Math.floor(rnd(2, 40)))).replace('{loc}', loc);

function weightedLocality() {
  // low-lying localities flood more often
  const pool = LOCALITIES.flatMap((l) => (l.lowLying ? [l, l, l] : [l]));
  return pick(pool);
}

export async function simulateSocialPost(channel = 'social') {
  const type = state.scenario.type;
  const loc = weightedLocality();
  const tpl = channel === 'sos' ? pick(SOS) : pick(SOCIAL[type] || SOCIAL.flood);
  const text = fill(tpl, loc.name);
  const lat = loc.lat + rnd(-0.008, 0.008);
  const lng = loc.lng + rnd(-0.008, 0.008);
  return processReport({ channel, text, lat, lng, author: channel === 'sos' ? 'Citizen (SOS app)' : pick(NAMES) });
}

export { processReport };

const SMS_TEXTS = [
  'SOS {loc} {n} people trapped water rising',
  'help {loc} old man injured need ambulance',
  '{loc} no food no water {n} families',
  '{ta} பகுதியில் {n} பேர் வெள்ளத்தில் சிக்கியுள்ளோம் உதவி',
  '{ta} இல் குடிநீர் இல்லை, {n} குடும்பங்களுக்கு உணவு தேவை',
];
/** Feature phones on 2G (SMS) and LoRa mesh relays from boats. */
export async function simulateLowBandwidth() {
  const loc = weightedLocality();
  const tpl = pick(SMS_TEXTS);
  const text = tpl.replace('{loc}', loc.name).replace('{ta}', loc.ta || loc.name).replace('{n}', String(Math.floor(rnd(2, 25))));
  if (Math.random() < 0.75) return receiveMessage({ from: `+9198${Math.floor(rnd(10000000, 99999999))}`, body: text, channel: 'sms' });
  return receiveMessage({ from: `lora-boat-${Math.floor(rnd(1, 9))}`, body: text, channel: 'lora', lat: loc.lat + rnd(-0.005, 0.005), lng: loc.lng + rnd(-0.005, 0.005), meta: { hops: Math.floor(rnd(1, 4)) } });
}

const lastValue = {};
export async function simulateSensor(sensor, forceSpike = false) {
  const k = state.scenario.intensity;
  const typeBoost = {
    water_level: ['flood', 'cyclone'].includes(state.scenario.type),
    rain_gauge: ['flood', 'cyclone', 'landslide'].includes(state.scenario.type),
    wind: state.scenario.type === 'cyclone',
    seismic: state.scenario.type === 'earthquake',
  }[sensor.sensor_type];
  const spike = forceSpike || (typeBoost && Math.random() < 0.08 * k);
  const base = { water_level: [1.2, 0.3], rain_gauge: [6, 3], wind: [18, 5], seismic: [0.01, 0.004] }[sensor.sensor_type];
  let value = base[0] + rnd(-1, 1) * base[1] + (typeBoost ? base[1] * 2 * k : 0);
  if (spike) value = base[0] + base[1] * rnd(4, 7);
  value = Math.max(0, +value.toFixed(sensor.sensor_type === 'seismic' ? 4 : 2));
  const prev = lastValue[sensor.code];
  lastValue[sensor.code] = value;
  const analysis = await analyseSensor(sensor.sensor_type, value, prev);
  const reading = await store.addReading({ sensorCode: sensor.code, sensorType: sensor.sensor_type, value, unit: analysis.unit, anomaly: analysis.anomaly, analysis });
  const updated = await one(`UPDATE sensors SET last_value=$2, anomaly=$3, unit=COALESCE($4, unit), updated_at=now() WHERE code=$1 RETURNING *`, [
    sensor.code, value, analysis.anomaly, analysis.unit || null,
  ]);
  emit('sensor:reading', { ...updated, analysis, reading_id: reading.id });
  if (analysis.anomaly) {
    await createAlert({ level: 'warning', title: `Sensor anomaly · ${sensor.code}`, message: `${sensor.locality}: ${analysis.reason}` });
    if (sensor.sensor_type === 'water_level' || sensor.sensor_type === 'seismic') {
      const type = sensor.sensor_type === 'seismic' ? 'earthquake' : 'flood';
      await createIncident({
        title: `Sensor-detected ${type} risk – ${sensor.locality}`,
        description: analysis.reason,
        disaster_type: type,
        lat: sensor.lat + rnd(-0.004, 0.004),
        lng: sensor.lng + rnd(-0.004, 0.004),
        source: 'sensor',
        affected_people: Math.round(rnd(100, 1500)),
        features: type === 'flood' ? { water_level_m: Math.max(2.5, value), rainfall_mm: 180 + 120 * k } : { magnitude: +(4 + value * 30).toFixed(1) },
      });
      await autoDispatchCritical();
    }
  }
  return { reading, analysis };
}

export async function refreshZones() {
  const incidents = await query(`SELECT id, lat, lng, severity FROM incidents WHERE status <> 'resolved'`);
  const zones = await riskZones(incidents.map((i) => ({ id: i.id, lat: i.lat, lng: i.lng, severity: i.severity })));
  const newlyCritical = zones.filter((z) => z.risk_level === 'critical' && !state.zones.some((o) => o.risk_level === 'critical' && near(o, z)));
  state.zones = zones;
  emit('zones:update', zones);
  for (const z of newlyCritical)
    await createAlert({ level: 'critical', title: 'Critical risk zone detected', message: `${z.incident_count} incidents within ${z.radius_km} km (risk ${z.risk_score}/100). Consider evacuation.` });
  return zones;
}
const near = (a, b) => Math.abs(a.center.lat - b.center.lat) < 0.01 && Math.abs(a.center.lng - b.center.lng) < 0.01;

/** Scenario injection, e.g. "Cyclone landfall" button on the dashboard. */
export async function triggerScenario({ type = 'cyclone', intensity = 0.85, name } = {}) {
  state.scenario = { type, intensity, name: name || defaultName(type), startedAt: new Date().toISOString() };
  emit('scenario:update', state.scenario);
  await createAlert({ level: 'critical', title: `Scenario: ${state.scenario.name}`, message: `Intensity ${Math.round(intensity * 100)}%. Expect surge in reports.` });
  const burst = type === 'earthquake' ? 5 : 6;
  for (let i = 0; i < burst; i++) await simulateSocialPost(i % 3 === 0 ? 'sos' : 'social');
  const s = SENSORS.find((x) => (type === 'earthquake' ? x.sensor_type === 'seismic' : x.sensor_type === 'water_level'));
  if (s && type !== 'fire') await simulateSensor(s, true);
  await refreshZones();
  return state.scenario;
}
const defaultName = (t) =>
  ({ flood: 'Northeast Monsoon – Urban Flooding', cyclone: 'Severe Cyclonic Storm – Landfall', earthquake: 'M6.1 Earthquake – Bay of Bengal', fire: 'Industrial Fire – Manali', landslide: 'Hill-slope Landslide' })[t];

let simTimer = null;
let lifeTimer = null;
let lifeBusy = false;
let simBusy = false;

export function startLoops(intervalMs) {
  lifeTimer = setInterval(async () => {
    if (lifeBusy) return;
    lifeBusy = true;
    try {
      await lifecycleTick();
    } catch (e) {
      console.error('[lifecycle]', e.message);
    } finally {
      lifeBusy = false;
    }
  }, 1000);

  simTimer = setInterval(async () => {
    if (!state.sim.enabled || simBusy) return;
    simBusy = true;
    try {
      state.sim.ticks++;
      const active = await one(`SELECT COUNT(*)::int AS n FROM incidents WHERE status <> 'resolved'`);
      if (Math.random() < 0.55 && active.n < 30) await simulateSocialPost('social');
      if (Math.random() < 0.15 && active.n < 30) await simulateSocialPost('sos');
      if (Math.random() < 0.12 && active.n < 30) await simulateLowBandwidth();
      for (let i = 0; i < 3; i++) await simulateSensor(pick(SENSORS));
      if (state.sim.ticks % 2 === 0) await refreshZones();
      await consumeTick((intervalMs / 1000) * (state.sim.speed / 60));
      emit('stats:tick', { ticks: state.sim.ticks, at: new Date().toISOString() });
    } catch (e) {
      console.error('[simulator]', e.message);
    } finally {
      simBusy = false;
    }
  }, intervalMs);
}

export function stopLoops() {
  clearInterval(simTimer);
  clearInterval(lifeTimer);
}
