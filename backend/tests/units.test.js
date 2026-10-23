import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localityInText } from '../src/data/chennai.js';
import { fallbackExplain } from '../src/services/ml.js';
import { routeBetween } from '../src/services/routing.js';
import { parseSms } from '../src/services/sms.js';
import { imdCategory, summarise } from '../src/services/weather.js';

test('SMS parser extracts locality, people and intent (English)', () => {
  const p = parseSms('SOS Velachery 6 people trapped, water rising');
  assert.equal(p.locality, 'Velachery');
  assert.equal(p.people, 6);
  assert.equal(p.isSos, true);
  assert.equal(p.locationSource, 'gazetteer');
});

test('SMS parser understands Tamil and inflected place names', () => {
  const p = parseSms('தாம்பரத்தில் 12 பேர் வெள்ளத்தில் சிக்கியுள்ளோம் உதவி');
  assert.equal(p.language, 'ta');
  assert.equal(p.locality, 'Tambaram');
  assert.equal(p.people, 12);
  assert.equal(p.isSos, true);
});

test('SMS parser prefers GPS coordinates and reads responder commands', () => {
  const p = parseSms('trapped at 12.97612, 80.22301 near lake');
  assert.equal(p.locationSource, 'gps');
  assert.equal(p.lat, 12.97612);
  assert.deepEqual(parseSms('DONE 4').command, { action: 'completed', severity: 4 });
  assert.deepEqual(parseSms('arrived').command, { action: 'on_scene', severity: null });
});

test('locality matching handles spelling variants', () => {
  assert.equal(localityInText('flooding in tnagar')?.name, 'T Nagar');
  assert.equal(localityInText('nothing here'), null);
});

test('routing falls back to offline A* without internet', async () => {
  const r = await routeBetween({ lat: 13.0, lng: 80.15 }, { lat: 13.0, lng: 80.3 }, 'ambulance', [{ center: { lat: 13.0, lng: 80.225 }, radius_km: 3, risk_level: 'critical' }]);
  assert.match(r.engine, /offline A\*/);
  assert.equal(r.detour, true);
});

test('offline explainability ranks the strongest driver first', () => {
  const e = fallbackExplain({ disaster_type: 'flood', rainfall_mm: 300, water_level_m: 3.8, wind_kmph: 10, magnitude: 0, population_density: 8000, affected_people: 0, injured: 0, infrastructure_damage: 0, report_count: 1 });
  assert.ok(['water_level_m', 'rainfall_mm'].includes(e.contributions[0].feature));
  assert.ok(e.contributions[0].contribution > 0);
});

test('IMD rainfall categories and weather summary', () => {
  assert.equal(imdCategory(70), 'Heavy');
  assert.equal(imdCategory(210), 'Extremely heavy');
  const s = summarise([{ rain_next_24h_mm: 20, precipitation_mm: 1, wind_kmph: 30, gust_kmph: 50 }, { rain_next_24h_mm: 120, precipitation_mm: 4, wind_kmph: 40, gust_kmph: 70 }]);
  assert.equal(s.imd_category, 'Very heavy');
  assert.equal(s.max_gust_kmph, 70);
});

// ---------------- v3: real data & offline street routing ----------------
import fs from 'node:fs';
import { streetInText } from '../src/data/chennai.js';
import { parseGdacs, parseUsgs } from '../src/services/feeds.js';
import { roadRoute, loadRoadGraph } from '../src/services/roadGraph.js';
import { routeSync } from '../src/services/routing.js';

test('USGS feed parser keeps only events near Chennai', () => {
  const items = parseUsgs(JSON.parse(fs.readFileSync(new URL('./fixtures/usgs_sample.json', import.meta.url))));
  assert.equal(items.length, 1);
  assert.equal(items[0].magnitude, 5.8);
  assert.ok(items[0].distance_km > 1000 && items[0].distance_km < 2000);
});

test('GDACS RSS parser reads cyclone alerts for India', () => {
  const items = parseGdacs(fs.readFileSync(new URL('./fixtures/gdacs_sample.xml', import.meta.url), 'utf8'));
  assert.equal(items.length, 1);
  assert.equal(items[0].type, 'cyclone');
  assert.equal(items[0].alert_level, 'orange');
  assert.equal(items[0].country, 'India');
});

test('real OSM road network loads and routes Chennai Central → Velachery', () => {
  assert.ok(loadRoadGraph().nodeCount > 100000);
  const r = roadRoute({ lat: 13.081, lng: 80.277 }, { lat: 12.9805, lng: 80.2195 });
  assert.ok(r.distanceKm > 13 && r.distanceKm < 25, `distance ${r.distanceKm}`);
  assert.ok(r.path.length > 20);
});

test('road routing detours around a flooded zone', () => {
  const a = { lat: 13.081, lng: 80.277 };
  const b = { lat: 12.9805, lng: 80.2195 };
  const direct = routeSync(a, b, 'ambulance', []);
  const zone = { center: { lat: 13.035, lng: 80.245 }, radius_km: 2.5, risk_level: 'critical' };
  const detour = routeSync(a, b, 'ambulance', [zone]);
  assert.match(detour.engine, /OSM roads/);
  assert.ok(detour.distanceKm > direct.distanceKm);
  assert.ok(detour.hazardKm < 0.5, `still drives ${detour.hazardKm} km through the flood`);
});

test('street-level geocoding from OSM names (English and Tamil)', () => {
  assert.equal(streetInText('5 people trapped near Taramani Link Road')?.name, 'Taramani Link Road');
  assert.equal(streetInText('stuck on rajiv gandhi salai near sholinganallur')?.name, 'Rajiv Gandhi Salai');
  assert.ok(streetInText('முத்துசுவாமி சாலை அருகே சிக்கியுள்ளோம்'));
  assert.equal(streetInText('nothing useful here'), null);
});
