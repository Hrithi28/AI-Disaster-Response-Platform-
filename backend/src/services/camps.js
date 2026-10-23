// Relief camps & inventory. Stock is consumed per person per day; when an item
// drops below its minimum level a low-stock alert is raised (once per item
// until it is restocked).
import { json, one, query } from '../db/postgres.js';
import { EVENTS, publish } from './events.js';
import { createAlert } from './notifier.js';
import { emit } from './realtime.js';

const lowAlerted = new Set();

export async function listCamps() {
  const camps = await query(`SELECT * FROM camps ORDER BY id`);
  const inv = await query(`SELECT * FROM inventory ORDER BY camp_id, category, item`);
  return camps.map((c) => {
    const items = inv.filter((i) => i.camp_id === c.id);
    return { ...c, inventory: items, low_stock: items.filter((i) => i.quantity < i.min_level).map((i) => i.item) };
  });
}

export async function getCamp(id) {
  const c = await one(`SELECT * FROM camps WHERE id=$1`, [id]);
  if (!c) return null;
  c.inventory = await query(`SELECT * FROM inventory WHERE camp_id=$1 ORDER BY category, item`, [id]);
  c.transactions = await query(`SELECT * FROM inventory_tx WHERE camp_id=$1 ORDER BY id DESC LIMIT 30`, [id]);
  c.volunteers = await query(`SELECT id, name, phone, organization, skills FROM users WHERE camp_id=$1 AND role='volunteer'`, [id]);
  return c;
}

export async function createCamp(b) {
  const c = await one(
    `INSERT INTO camps (name, locality, lat, lng, capacity, contact) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [b.name, b.locality || null, b.lat, b.lng, b.capacity, b.contact || null],
  );
  for (const item of DEFAULT_ITEMS) await upsertItem(c.id, { ...item, quantity: Math.round(item.min_level * 3) });
  return changed(c.id);
}

export async function updateOccupancy(campId, delta, userId) {
  const c = await one(`SELECT * FROM camps WHERE id=$1`, [campId]);
  if (!c) throw Object.assign(new Error('Camp not found'), { status: 404 });
  const occ = Math.max(0, c.occupancy + delta);
  if (occ > c.capacity) throw Object.assign(new Error(`Camp capacity ${c.capacity} exceeded`), { status: 409 });
  const status = c.status === 'closed' ? 'closed' : occ >= c.capacity ? 'full' : 'open';
  await query(`UPDATE camps SET occupancy=$2, status=$3, updated_at=now() WHERE id=$1`, [campId, occ, status]);
  await query(`INSERT INTO inventory_tx (camp_id, item, delta, reason, user_id) VALUES ($1,'people',$2,$3,$4)`, [campId, delta, delta > 0 ? 'check-in' : 'check-out', userId || null]);
  return changed(campId);
}

export async function setCampStatus(campId, status) {
  await query(`UPDATE camps SET status=$2, updated_at=now() WHERE id=$1`, [campId, status]);
  return changed(campId);
}

export async function upsertItem(campId, { item, category, unit, quantity = 0, min_level = 0, per_person_daily = 0 }) {
  return one(
    `INSERT INTO inventory (camp_id, item, category, unit, quantity, min_level, per_person_daily) VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (camp_id, item) DO UPDATE SET quantity=EXCLUDED.quantity, min_level=EXCLUDED.min_level, unit=EXCLUDED.unit,
       category=EXCLUDED.category, per_person_daily=EXCLUDED.per_person_daily, updated_at=now() RETURNING *`,
    [campId, item, category, unit, quantity, min_level, per_person_daily],
  );
}

/** delta > 0: restock / donation received; delta < 0: distribution. */
export async function adjustStock(campId, item, delta, reason, userId) {
  const row = await one(`SELECT * FROM inventory WHERE camp_id=$1 AND item=$2`, [campId, item]);
  if (!row) throw Object.assign(new Error('Item not found'), { status: 404 });
  if (row.quantity + delta < 0) throw Object.assign(new Error(`Only ${row.quantity} ${row.unit} of ${item} in stock`), { status: 409 });
  await query(`UPDATE inventory SET quantity=quantity+$3, updated_at=now() WHERE camp_id=$1 AND item=$2`, [campId, item, delta]);
  await query(`INSERT INTO inventory_tx (camp_id, item, delta, reason, user_id) VALUES ($1,$2,$3,$4,$5)`, [campId, item, delta, reason, userId || null]);
  if (delta > 0) lowAlerted.delete(`${campId}:${item}`);
  await checkLowStock(campId);
  return changed(campId);
}

async function checkLowStock(campId) {
  const low = await query(`SELECT i.*, c.name AS camp_name FROM inventory i JOIN camps c ON c.id=i.camp_id WHERE i.camp_id=$1 AND i.quantity < i.min_level`, [campId]);
  for (const i of low) {
    const key = `${campId}:${i.item}`;
    if (lowAlerted.has(key)) continue;
    lowAlerted.add(key);
    await createAlert({ level: 'warning', title: `Low stock · ${i.camp_name}`, message: `${i.item}: ${Math.round(i.quantity)} ${i.unit} left (minimum ${i.min_level}). Request resupply.` });
  }
}

/** Simulated consumption: called every simulator tick. */
export async function consumeTick(simMinutes) {
  const camps = await query(`SELECT * FROM camps WHERE occupancy > 0`);
  for (const c of camps) {
    await query(
      `UPDATE inventory SET quantity = GREATEST(0, quantity - per_person_daily * $2 * $3 / 1440.0), updated_at=now() WHERE camp_id=$1 AND per_person_daily > 0`,
      [c.id, c.occupancy, simMinutes],
    );
    await checkLowStock(c.id);
  }
  if (camps.length) emit('camps:tick', { at: new Date().toISOString() });
}

async function changed(campId) {
  const c = await getCamp(campId);
  emit('camp:update', c);
  publish(EVENTS.CAMP_UPDATED, c);
  return c;
}

export const DEFAULT_ITEMS = [
  { item: 'Drinking water', category: 'water', unit: 'L', min_level: 1500, per_person_daily: 4 },
  { item: 'Rice', category: 'food', unit: 'kg', min_level: 300, per_person_daily: 0.4 },
  { item: 'Food packets', category: 'food', unit: 'packets', min_level: 400, per_person_daily: 2 },
  { item: 'Milk powder', category: 'food', unit: 'kg', min_level: 25, per_person_daily: 0.02 },
  { item: 'Medicine kits', category: 'medical', unit: 'kits', min_level: 40, per_person_daily: 0.05 },
  { item: 'ORS sachets', category: 'medical', unit: 'sachets', min_level: 200, per_person_daily: 0.3 },
  { item: 'Blankets', category: 'shelter', unit: 'pcs', min_level: 150, per_person_daily: 0 },
  { item: 'Tarpaulins', category: 'shelter', unit: 'pcs', min_level: 60, per_person_daily: 0 },
];

export { json };
