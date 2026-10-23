// Live weather from Open-Meteo (free, no API key). Used for the weather panel,
// heavy-rain alerts (IMD thresholds) and, in "live weather" scenario mode, as
// the rainfall / wind inputs of the severity model. Falls back to the
// simulated scenario when there is no internet.
import { config } from '../config.js';
import { internetAvailable } from './connectivity.js';
import { createAlert } from './notifier.js';
import { emit } from './realtime.js';

const POINTS = [
  { name: 'Nungambakkam', lat: 13.067, lng: 80.241 },
  { name: 'Meenambakkam', lat: 12.994, lng: 80.18 },
  { name: 'Tambaram', lat: 12.925, lng: 80.1 },
  { name: 'Ennore', lat: 13.214, lng: 80.32 },
  { name: 'Sholinganallur', lat: 12.901, lng: 80.228 },
];

export const weather = { source: 'unavailable', updatedAt: null, points: [], summary: null, error: null };
let lastAlertLevel = null;

/** IMD rainfall categories for 24 h accumulation (mm). */
export function imdCategory(mm) {
  if (mm >= 204.5) return 'Extremely heavy';
  if (mm >= 115.6) return 'Very heavy';
  if (mm >= 64.5) return 'Heavy';
  if (mm >= 15.6) return 'Moderate';
  if (mm >= 2.5) return 'Light';
  return 'None / very light';
}

export function summarise(points) {
  const max = (k) => Math.max(...points.map((p) => p[k] ?? 0));
  const rain24 = max('rain_next_24h_mm');
  return {
    max_rain_next_24h_mm: +rain24.toFixed(1),
    max_precip_now_mm: +max('precipitation_mm').toFixed(1),
    max_wind_kmph: +max('wind_kmph').toFixed(1),
    max_gust_kmph: +max('gust_kmph').toFixed(1),
    imd_category: imdCategory(rain24),
  };
}

export async function refreshWeather() {
  if (!config.weatherEnabled) return weather;
  if (!internetAvailable()) {
    weather.source = weather.points.length ? 'cached (offline)' : 'unavailable (offline)';
    emit('weather:update', weather);
    return weather;
  }
  try {
    const lat = POINTS.map((p) => p.lat).join(',');
    const lng = POINTS.map((p) => p.lng).join(',');
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=precipitation,rain,wind_speed_10m,wind_gusts_10m,temperature_2m&hourly=precipitation&forecast_days=2&timezone=Asia%2FKolkata`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    const data = await res.json();
    const arr = Array.isArray(data) ? data : [data];
    weather.points = arr.map((d, i) => {
      const nowIdx = Math.max(0, (d.hourly?.time || []).findIndex((t) => t >= (d.current?.time || '')));
      const next24 = (d.hourly?.precipitation || []).slice(nowIdx, nowIdx + 24).reduce((s, v) => s + (v || 0), 0);
      return {
        ...POINTS[i],
        precipitation_mm: d.current?.precipitation ?? 0,
        wind_kmph: d.current?.wind_speed_10m ?? 0,
        gust_kmph: d.current?.wind_gusts_10m ?? 0,
        temperature_c: d.current?.temperature_2m ?? null,
        rain_next_24h_mm: +next24.toFixed(1),
      };
    });
    weather.summary = summarise(weather.points);
    weather.source = 'Open-Meteo (live)';
    weather.updatedAt = new Date().toISOString();
    weather.error = null;
    const cat = weather.summary.imd_category;
    if (['Heavy', 'Very heavy', 'Extremely heavy'].includes(cat) && cat !== lastAlertLevel) {
      lastAlertLevel = cat;
      await createAlert({ level: cat === 'Heavy' ? 'warning' : 'critical', title: `IMD category: ${cat} rainfall forecast`, message: `Up to ${weather.summary.max_rain_next_24h_mm} mm expected in 24 h (Open-Meteo). Pre-position boats in low-lying areas.` });
    }
  } catch (e) {
    weather.error = e.message;
    weather.source = weather.points.length ? 'cached (fetch failed)' : 'unavailable';
  }
  emit('weather:update', weather);
  return weather;
}

/** Scenario inputs derived from live weather (used by "live" scenario mode). */
export function liveScenarioIntensity() {
  if (!weather.summary) return null;
  const r = Math.min(1, weather.summary.max_rain_next_24h_mm / 200);
  const w = Math.min(1, weather.summary.max_gust_kmph / 150);
  return +Math.max(r, w, 0.05).toFixed(2);
}
