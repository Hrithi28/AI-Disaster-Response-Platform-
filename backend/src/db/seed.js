// Seeds reference data (users, resources, sensors) and a few starting incidents.
import bcrypt from 'bcryptjs';
import { RESOURCE_BASES, SENSORS } from '../data/chennai.js';
import { DEFAULT_ITEMS } from '../services/camps.js';
import { createIncident } from '../services/incidents.js';
import { config } from '../config.js';
import { one, query } from './postgres.js';

const UNIT_LABEL = {
  ambulance: 'Ambulance',
  medical_team: 'Medical Team',
  fire_truck: 'Fire Tender',
  rescue_boat: 'Rescue Boat',
  ndrf_team: 'NDRF Team',
  relief_truck: 'Relief Truck',
};
const CAPACITY = { ambulance: 2, medical_team: 6, fire_truck: 6, rescue_boat: 8, ndrf_team: 20, relief_truck: 500 };

export async function seed() {
  if (config.nodeRole === 'cloud') return seedCloud();
  const existing = await one('SELECT COUNT(*)::int AS n FROM resources');
  if (existing.n > 0) return false;

  const counters = {};
  for (const b of RESOURCE_BASES) {
    for (const [type, n] of Object.entries(b.units)) {
      for (let i = 0; i < n; i++) {
        counters[type] = (counters[type] || 0) + 1;
        const code = String(counters[type]).padStart(2, '0');
        await query(
          `INSERT INTO resources (name, type, base_name, base_lat, base_lng, lat, lng, capacity) VALUES ($1,$2,$3,$4,$5,$4,$5,$6)`,
          [`${UNIT_LABEL[type]} ${code}`, type, b.base, b.lat, b.lng, CAPACITY[type]],
        );
      }
    }
  }
  for (const s of SENSORS) {
    await query(`INSERT INTO sensors (code, sensor_type, locality, lat, lng) VALUES ($1,$2,$3,$4,$5)`, [s.code, s.sensor_type, s.locality, s.lat, s.lng]);
  }

  const boat = await one(`SELECT id FROM resources WHERE type='rescue_boat' ORDER BY id LIMIT 1`);
  const campIds = await seedCamps();
  const users = [
    ['Control Room Admin', 'admin@drp.in', 'admin123', 'admin', null, '+919000000000', null, null],
    ['Field Responder (Boat 01)', 'responder@drp.in', 'field123', 'responder', boat.id, '+919000000001', null, null],
    ['Citizen User', 'citizen@drp.in', 'citizen123', 'citizen', null, '+919000000002', null, null],
    ['Kavya R (Red Cross volunteer)', 'volunteer@drp.in', 'volunteer123', 'volunteer', null, '+919000000003', campIds[0], 'approved'],
    ['Arjun M (pending volunteer)', 'arjun.ngo@drp.in', 'volunteer123', 'volunteer', null, '+919000000004', null, 'pending'],
  ];
  for (const [name, email, pw, role, rid, phone, campId, vstatus] of users) {
    await query(
      `INSERT INTO users (name, email, password_hash, role, resource_id, phone, camp_id, volunteer_status, organization) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [name, email, bcrypt.hashSync(pw, 8), role, rid, phone, campId, vstatus, role === 'volunteer' ? (vstatus === 'approved' ? 'Indian Red Cross Society' : 'Chennai Relief Collective') : null],
    );
  }

  const starters = [
    { title: 'Residential colony inundated – Velachery', disaster_type: 'flood', lat: 12.9805, lng: 80.2195, locality: 'Velachery', affected_people: 1800, injured: 6, source: 'field', needs: ['rescue'], features: { water_level_m: 2.6, rainfall_mm: 230, infrastructure_damage: 0.55, report_count: 14 } },
    { title: 'Families stranded near marsh – Pallikaranai', disaster_type: 'flood', lat: 12.9365, lng: 80.2152, locality: 'Pallikaranai', affected_people: 650, injured: 2, source: 'social', needs: ['rescue', 'food_water'], features: { water_level_m: 1.9, rainfall_mm: 190, report_count: 8 } },
    { title: 'Subway flooded – Saidapet', disaster_type: 'flood', lat: 13.0225, lng: 80.2245, locality: 'Saidapet', affected_people: 120, injured: 0, source: 'sensor', needs: ['infrastructure'], features: { water_level_m: 1.2, rainfall_mm: 150 } },
    { title: 'Relief camp short of supplies – Mudichur', disaster_type: 'flood', lat: 12.9102, lng: 80.0735, locality: 'Mudichur', affected_people: 900, injured: 0, source: 'sos', needs: ['food_water', 'shelter'], features: { water_level_m: 1.4, rainfall_mm: 170, report_count: 5 } },
    { title: 'Short-circuit fire in flooded complex – T Nagar', disaster_type: 'fire', lat: 13.0405, lng: 80.2335, locality: 'T Nagar', affected_people: 60, injured: 4, source: 'social', needs: ['firefighting', 'medical'], features: { infrastructure_damage: 0.45, report_count: 6 } },
    { title: 'Coastal hamlet cut off – Ennore', disaster_type: 'flood', lat: 13.2125, lng: 80.3185, locality: 'Ennore', affected_people: 400, injured: 1, source: 'field', needs: ['rescue'], features: { water_level_m: 2.1, rainfall_mm: 210, report_count: 4 } },
  ];
  for (const s of starters) await createIncident(s, { silent: true });
  console.log(`[seed] ${Object.values(counters).reduce((a, b) => a + b, 0)} resources, ${SENSORS.length} sensors, ${users.length} users, ${starters.length} incidents`);
  return true;
}

const CAMPS = [
  ['Govt. Higher Secondary School, Guindy', 'Guindy', 13.0102, 80.2142, 400, 180],
  ['Corporation Community Hall, T Nagar', 'T Nagar', 13.0402, 80.2385, 300, 120],
  ['Tower Park Relief Shelter, Anna Nagar', 'Anna Nagar', 13.0872, 80.2091, 500, 90],
  ['Kalyana Mandapam Shelter, Chromepet', 'Chromepet', 12.9531, 80.1418, 350, 210],
  ['Govt. School Shelter, Porur', 'Porur', 13.0362, 80.1582, 300, 60],
  ['SSN College Campus Shelter, Kalavakkam', 'Kalavakkam', 12.7512, 80.1961, 600, 40],
  ['Community Centre, Thiruvanmiyur', 'Thiruvanmiyur', 12.9851, 80.2593, 250, 140],
  ['Multi-purpose Cyclone Shelter, Royapuram', 'Royapuram', 13.1124, 80.2932, 400, 160],
];

async function seedCamps() {
  const ids = [];
  for (const [i, [name, locality, lat, lng, capacity, occupancy]] of CAMPS.entries()) {
    const c = await one(
      `INSERT INTO camps (name, locality, lat, lng, capacity, occupancy, contact) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [name, locality, lat, lng, capacity, occupancy, `+91900000${String(100 + i).padStart(4, '0')}`],
    );
    ids.push(c.id);
    for (const item of DEFAULT_ITEMS) {
      // camp #4 starts short of water & food packets so the low-stock flow is visible
      const factor = i === 3 && ['Drinking water', 'Food packets'].includes(item.item) ? 0.6 : 2 + ((i * 7 + item.item.length) % 5) * 0.4;
      await query(
        `INSERT INTO inventory (camp_id, item, category, unit, quantity, min_level, per_person_daily) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [c.id, item.item, item.category, item.unit, Math.round(item.min_level * factor), item.min_level, item.per_person_daily],
      );
    }
  }
  return ids;
}

/** State-HQ cloud node: only an admin account; data arrives from edge nodes via sync. */
async function seedCloud() {
  const existing = await one('SELECT COUNT(*)::int AS n FROM users');
  if (existing.n > 0) return false;
  await query(`INSERT INTO users (name, email, password_hash, role) VALUES ('State HQ Admin','admin@drp.in',$1,'admin')`, [bcrypt.hashSync('admin123', 8)]);
  console.log('[seed] cloud node: admin user only (data arrives via sync)');
  return true;
}
