import { adjustStock, createCamp, getCamp, listCamps, setCampStatus, updateOccupancy, upsertItem } from '../services/camps.js';
import { planEvacuation } from '../services/evacuation.js';
import { createAlert } from '../services/notifier.js';
import { sendSms } from '../services/sms.js';
import { one, query } from '../db/postgres.js';

export const list = async (_req, res) => res.json(await listCamps());

export async function get(req, res) {
  const c = await getCamp(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Camp not found' });
  res.json(c);
}

export const create = async (req, res) => res.status(201).json(await createCamp(req.body));

function ensureCampAccess(req) {
  if (req.user.role === 'volunteer' && req.user.camp_id !== Number(req.params.id))
    throw Object.assign(new Error('Volunteers can only manage their assigned camp'), { status: 403 });
}

export async function occupancy(req, res) {
  ensureCampAccess(req);
  res.json(await updateOccupancy(Number(req.params.id), req.body.delta, req.user.id));
}

export const status = async (req, res) => res.json(await setCampStatus(Number(req.params.id), req.body.status));

export async function stock(req, res) {
  ensureCampAccess(req);
  res.locals.audit = { action: `inventory.${req.body.delta > 0 ? 'restock' : 'distribute'}`, entity: 'camp', entity_id: req.params.id, details: req.body };
  res.json(await adjustStock(Number(req.params.id), req.body.item, req.body.delta, req.body.reason, req.user.id));
}

export async function item(req, res) {
  await upsertItem(Number(req.params.id), req.body);
  res.json(await getCamp(Number(req.params.id)));
}

export async function requestResupply(req, res) {
  ensureCampAccess(req);
  const camp = await one('SELECT * FROM camps WHERE id=$1', [Number(req.params.id)]);
  if (!camp) return res.status(404).json({ error: 'Camp not found' });
  const low = await query('SELECT item, quantity, unit, min_level FROM inventory WHERE camp_id=$1 AND quantity < min_level', [camp.id]);
  const list = low.map((i) => `${i.item} (${Math.round(i.quantity)}/${i.min_level} ${i.unit})`).join(', ') || 'general supplies';
  const alert = await createAlert({ level: 'warning', title: `Resupply requested · ${camp.name}`, message: `Needs: ${list}. Requested by ${req.user.name}.` });
  res.json({ ok: true, alert });
}

export const evacuationPlan = async (_req, res) => res.json(await planEvacuation());

/** Approve the plan: reserve camp capacity and notify camps (SMS to camp contacts). */
export async function evacuationExecute(_req, res) {
  const plan = await planEvacuation({ withRoutes: false });
  let moved = 0;
  for (const z of plan.zones)
    for (const a of z.allocations) {
      await updateOccupancy(a.camp_id, a.people);
      moved += a.people;
      const camp = await one('SELECT contact, name FROM camps WHERE id=$1', [a.camp_id]);
      if (camp?.contact) await sendSms({ phone: camp.contact, body: `DRP EVACUATION: expect ${a.people} evacuees from risk zone ${z.zone_id} (${z.risk_level}). Prepare ${camp.name}.` });
    }
  await createAlert({ level: 'critical', title: 'Evacuation order issued', message: `${moved} people being moved to relief camps from ${plan.zones.length} risk zone(s). ${plan.total_unplaced} still need placement.` });
  res.json({ moved, plan });
}
