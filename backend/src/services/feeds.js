// Real-time public disaster feeds (used when the server has internet):
//   • USGS earthquakes (GeoJSON, updated every minute)  earthquake.usgs.gov
//   • GDACS global disaster alerts — cyclones, floods, earthquakes (RSS)  gdacs.org
// Events near India / the Bay of Bengal are shown on the dashboard and raise
// alerts; Open-Meteo weather is handled in weather.js. Offline → last cached list.
import { config } from '../config.js';
import { internetAvailable } from './connectivity.js';
import { haversineKm } from './geo.js';
import { createAlert } from './notifier.js';
import { emit } from './realtime.js';

const USGS_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson';
const GDACS_URL = 'https://www.gdacs.org/xml/rss.xml';
const RADIUS_KM = Number(process.env.FEEDS_RADIUS_KM || 2500); // around Chennai
const NEARBY = ['India', 'Sri Lanka', 'Bangladesh', 'Myanmar', 'Maldives', 'Nepal', 'Pakistan'];

export const feeds = { updatedAt: null, sources: {}, items: [] };
const alerted = new Set();

const distKm = (lat, lng) => Math.round(haversineKm({ lat, lng }, config.region));

export function parseUsgs(geojson) {
  return (geojson.features || [])
    .map((f) => {
      const [lng, lat, depth] = f.geometry.coordinates;
      return {
        id: `usgs:${f.id}`,
        source: 'USGS',
        type: 'earthquake',
        title: f.properties.title,
        magnitude: f.properties.mag,
        depth_km: depth,
        lat,
        lng,
        time: new Date(f.properties.time).toISOString(),
        url: f.properties.url,
        alert_level: f.properties.alert || (f.properties.mag >= 6 ? 'orange' : f.properties.mag >= 5 ? 'yellow' : 'green'),
        tsunami: Boolean(f.properties.tsunami),
        distance_km: distKm(lat, lng),
      };
    })
    .filter((e) => e.distance_km <= RADIUS_KM);
}

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : null;
};
const TYPE = { EQ: 'earthquake', TC: 'cyclone', FL: 'flood', VO: 'volcano', DR: 'drought', WF: 'wildfire', TS: 'tsunami' };

export function parseGdacs(xml) {
  const items = xml.split(/<item>/i).slice(1);
  return items
    .map((it) => {
      const lat = Number(tag(it, 'geo:lat'));
      const lng = Number(tag(it, 'geo:long'));
      const country = tag(it, 'gdacs:country') || '';
      const typeCode = tag(it, 'gdacs:eventtype') || '';
      return {
        id: `gdacs:${typeCode}:${tag(it, 'gdacs:eventid') || tag(it, 'guid')}`,
        source: 'GDACS',
        type: TYPE[typeCode] || typeCode.toLowerCase(),
        title: tag(it, 'title'),
        description: (tag(it, 'description') || '').replace(/<[^>]+>/g, '').slice(0, 300),
        country,
        lat,
        lng,
        time: new Date(tag(it, 'pubDate') || Date.now()).toISOString(),
        url: tag(it, 'link'),
        alert_level: (tag(it, 'gdacs:alertlevel') || 'green').toLowerCase(),
        severity_text: tag(it, 'gdacs:severity'),
        distance_km: Number.isFinite(lat) ? distKm(lat, lng) : null,
      };
    })
    .filter((e) => (e.distance_km != null && e.distance_km <= RADIUS_KM) || NEARBY.some((c) => e.country.includes(c)));
}

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}
async function getText(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.text();
}

export async function refreshFeeds() {
  if (!internetAvailable()) {
    for (const k of ['USGS', 'GDACS']) feeds.sources[k] = { ...(feeds.sources[k] || {}), status: feeds.items.length ? 'cached (offline)' : 'offline' };
    emit('feeds:update', feeds);
    return feeds;
  }
  const items = [];
  for (const [name, fn] of [
    ['USGS', async () => parseUsgs(await getJson(USGS_URL))],
    ['GDACS', async () => parseGdacs(await getText(GDACS_URL))],
  ]) {
    try {
      const got = await fn();
      items.push(...got);
      feeds.sources[name] = { status: 'live', count: got.length, at: new Date().toISOString() };
    } catch (e) {
      feeds.sources[name] = { status: `error: ${e.message}`, at: new Date().toISOString() };
      items.push(...feeds.items.filter((i) => i.source === name)); // keep last good data
    }
  }
  feeds.items = items.sort((a, b) => (a.time < b.time ? 1 : -1)).slice(0, 100);
  feeds.updatedAt = new Date().toISOString();
  await raiseAlerts(feeds.items);
  emit('feeds:update', feeds);
  return feeds;
}

export async function raiseAlerts(items) {
  for (const e of items) {
    const serious = ['orange', 'red'].includes(e.alert_level) || (e.type === 'earthquake' && e.magnitude >= 5.5) || e.tsunami;
    if (!serious || alerted.has(e.id)) continue;
    alerted.add(e.id);
    const near = e.distance_km != null && e.distance_km < 800;
    await createAlert({
      level: e.alert_level === 'red' || e.tsunami || near ? 'critical' : 'warning',
      title: `${e.source}: ${e.type} ${e.alert_level?.toUpperCase() || ''} alert`,
      message: `${e.title} · ${e.distance_km != null ? `${e.distance_km} km from Chennai` : e.country}${e.tsunami ? ' · TSUNAMI flag' : ''}`,
    });
  }
}
