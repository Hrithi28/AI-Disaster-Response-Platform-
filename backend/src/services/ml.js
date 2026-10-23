// Client for the Python AI/ML engine. If the ML service is unreachable the
// backend degrades gracefully to transparent rule-based fallbacks, so the
// command centre never goes dark during an emergency.
import { config } from '../config.js';

export const mlStatus = { online: false, lastCheck: null, modelVersion: null };

async function call(path, body, timeoutMs = 3000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(config.mlUrl + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`ML ${path} → ${res.status}: ${await res.text()}`);
    mlStatus.online = true;
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

export async function checkMl() {
  try {
    const h = await call('/health', undefined, 1500);
    mlStatus.online = true;
    mlStatus.modelVersion = h.model_version;
  } catch {
    mlStatus.online = false;
  }
  mlStatus.lastCheck = new Date().toISOString();
  return mlStatus;
}

const LABELS = { 1: 'Low', 2: 'Moderate', 3: 'High', 4: 'Severe', 5: 'Critical' };

export function fallbackSeverity(f) {
  const type = f.disaster_type;
  let hazard;
  if (type === 'flood') hazard = Math.min(1, (f.rainfall_mm / 300) * 0.5 + (f.water_level_m / 4) * 0.5);
  else if (type === 'cyclone') hazard = Math.min(1, (f.wind_kmph / 220) * 0.7 + (f.rainfall_mm / 300) * 0.3);
  else if (type === 'earthquake') hazard = Math.min(1, Math.max(0, (f.magnitude - 3) / 5));
  else if (type === 'landslide') hazard = Math.min(1, (f.rainfall_mm / 250) * 0.6 + f.infrastructure_damage * 0.4);
  else hazard = Math.min(1, f.infrastructure_damage * 0.6 + (f.wind_kmph / 100) * 0.4);
  const lg = (x, m) => Math.min(1, Math.log1p(x) / Math.log1p(m));
  const s =
    0.3 * hazard +
    0.22 * lg(f.affected_people, 20000) +
    0.22 * lg(f.injured, 500) +
    0.12 * f.infrastructure_damage +
    0.08 * Math.min(1, f.population_density / 30000) +
    0.06 * lg(f.report_count, 200);
  const level = s < 0.2 ? 1 : s < 0.36 ? 2 : s < 0.52 ? 3 : s < 0.68 ? 4 : 5;
  return {
    severity: level,
    label: LABELS[level],
    score: +Math.min(100, s * 125).toFixed(1),
    confidence: null,
    probabilities: null,
    model_version: 0,
    fallback: true,
  };
}

const KEYWORDS = {
  rescue: ['trapped', 'stuck', 'stranded', 'rescue', 'boat', 'evacuate', 'rooftop', 'missing', 'buried'],
  medical: ['injured', 'hurt', 'ambulance', 'doctor', 'hospital', 'bleeding', 'medicine', 'pain', 'fever', 'insulin'],
  fire: ['fire', 'smoke', 'blast', 'burning'],
  food_water: ['food', 'water bottle', 'drinking', 'hungry', 'milk', 'rice', 'supplies'],
  shelter: ['shelter', 'tent', 'blanket', 'homeless', 'roof', 'displaced'],
  infrastructure: ['bridge', 'power', 'tree', 'road', 'transformer', 'network', 'subway'],
};

export function fallbackClassify(text) {
  const low = text.toLowerCase();
  let best = 'info';
  let hits = 0;
  for (const [cat, words] of Object.entries(KEYWORDS)) {
    const h = words.filter((w) => low.includes(w)).length;
    if (h > hits) {
      hits = h;
      best = cat;
    }
  }
  const urgentTerms = ['urgent', 'immediately', 'trapped', 'help', 'sos', 'please', 'asap'].filter((w) => low.includes(w));
  const urgency = Math.min(1, (best === 'info' ? 0.05 : 0.45) + urgentTerms.length * 0.1);
  const m = low.match(/(\d{1,5})\s+(people|persons|families|children|kids|residents)/);
  return {
    category: best,
    confidence: null,
    top3: [{ category: best, p: null }],
    urgency,
    urgency_label: urgency >= 0.7 ? 'high' : urgency >= 0.4 ? 'medium' : 'low',
    urgent_terms: urgentTerms,
    entities: { people_count: m ? Number(m[1]) : null, locations: [] },
    actionable: best !== 'info',
    fallback: true,
  };
}

export async function predictSeverity(features) {
  try {
    return await call('/predict/severity', features);
  } catch {
    mlStatus.online = false;
    return fallbackSeverity(features);
  }
}

export async function classifyReport(text) {
  try {
    return await call('/classify/report', { text });
  } catch {
    mlStatus.online = false;
    return fallbackClassify(text);
  }
}

export async function analyseSensor(sensor_type, value, previous) {
  try {
    return await call('/anomaly/sensor', { sensor_type, value, previous });
  } catch {
    const limits = { rain_gauge: 30, water_level: 2.6, seismic: 0.05, wind: 60 };
    const anomaly = value > (limits[sensor_type] ?? Infinity);
    return { anomaly, anomaly_score: null, reason: anomaly ? `${sensor_type} above fixed threshold` : 'within expected range', fallback: true };
  }
}

export async function riskZones(points) {
  if (points.length < 2) return [];
  try {
    return await call('/zones', { points, eps_km: 2.5, min_samples: 2 });
  } catch {
    return [];
  }
}

export async function sendFeedback(features, actualSeverity) {
  try {
    return await call('/feedback', { features, actual_severity: actualSeverity });
  } catch {
    return null;
  }
}

export const retrain = () => call('/retrain', {}, 60000);
export const modelInfo = () => call('/models', undefined, 5000);

// ---------------- Explainability ----------------
// Occlusion attribution: reset one feature at a time to a "calm day" baseline
// and measure how much the severity score drops. Model-agnostic, so the same
// method explains the ML model and the offline rule-based fallback.
export const CALM_BASELINE = {
  rainfall_mm: 0,
  wind_kmph: 10,
  magnitude: 0,
  water_level_m: 0,
  population_density: 8000,
  affected_people: 0,
  injured: 0,
  infrastructure_damage: 0,
  report_count: 1,
};

export function fallbackExplain(features) {
  const base = fallbackSeverity(features).score;
  const contributions = Object.keys(CALM_BASELINE)
    .filter((k) => features[k] !== undefined && features[k] !== CALM_BASELINE[k])
    .map((k) => ({ feature: k, value: features[k], contribution: +(base - fallbackSeverity({ ...features, [k]: CALM_BASELINE[k] }).score).toFixed(1) }))
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return { score: base, method: 'occlusion (rule-based fallback)', contributions, fallback: true };
}

export async function explainSeverity(features) {
  try {
    return await call('/explain/severity', features, 5000);
  } catch {
    return fallbackExplain(features);
  }
}

export const modelComparison = () => call('/models/comparison', undefined, 90000);
