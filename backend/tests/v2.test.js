// Integration tests for resilience, auth and relief features (in-memory DBs, ML offline).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';
process.env.MONGO_URL = '';
process.env.ML_URL = 'http://127.0.0.1:1';
process.env.SYNC_KEY = 'test-key';

const { start } = await import('../src/server.js');
let srv;
let base;
const tokens = {};

const req = async (path, { method = 'GET', body, as = 'admin', headers = {} } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(as && tokens[as] ? { authorization: `Bearer ${tokens[as]}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, body: data, headers: res.headers };
};
const login = async (email, password) => (await req('/auth/login', { method: 'POST', as: null, body: { email, password } })).body;

before(async () => {
  srv = await start({ port: 0, loops: false });
  base = `http://127.0.0.1:${srv.server.address().port}/api`;
  tokens.admin = (await login('admin@drp.in', 'admin123')).token;
  tokens.responder = (await login('responder@drp.in', 'field123')).token;
  tokens.volunteer = (await login('volunteer@drp.in', 'volunteer123')).token;
});
after(() => srv.close());

test('refresh tokens rotate and a reused token is rejected', async () => {
  const s = await login('admin@drp.in', 'admin123');
  const r1 = await req('/auth/refresh', { method: 'POST', as: null, body: { refresh_token: s.refresh_token } });
  assert.equal(r1.status, 200);
  assert.ok(r1.body.token && r1.body.refresh_token !== s.refresh_token);
  const r2 = await req('/auth/refresh', { method: 'POST', as: null, body: { refresh_token: s.refresh_token } });
  assert.equal(r2.status, 401);
});

test('password reset flow', async () => {
  const f = await req('/auth/forgot-password', { method: 'POST', as: null, body: { email: 'citizen@drp.in' } });
  const token = new URL(f.body.dev_reset_link).searchParams.get('token');
  assert.equal((await req('/auth/reset-password', { method: 'POST', as: null, body: { token, password: 'brandnew1' } })).status, 200);
  assert.ok((await login('citizen@drp.in', 'brandnew1')).token);
  assert.equal((await req('/auth/reset-password', { method: 'POST', as: null, body: { token, password: 'again123' } })).status, 400);
});

test('pending volunteers cannot log in until approved', async () => {
  const reg = await req('/auth/register-volunteer', { method: 'POST', as: null, body: { name: 'Test Vol', email: 'tv@ngo.org', password: 'secret12', phone: '+919811100000', organization: 'NGO' } });
  assert.equal(reg.status, 201);
  assert.equal((await req('/auth/login', { method: 'POST', as: null, body: { email: 'tv@ngo.org', password: 'secret12' } })).status, 403);
  await req(`/users/${reg.body.user.id}`, { method: 'PATCH', body: { volunteer_status: 'approved', camp_id: 2 } });
  assert.ok((await login('tv@ngo.org', 'secret12')).token);
});

test('SMS SOS is classified, linked to an incident and answered; responder replies by SMS', async () => {
  const r = await req('/gateway/sms', { method: 'POST', as: null, body: { from: '+919800000001', body: 'SOS Velachery 6 people trapped water rising' } });
  assert.equal(r.status, 201);
  assert.equal(r.body.report.nlp.category, 'rescue');
  assert.ok(r.body.incident.id);
  assert.match(r.body.reply.body, /SOS received/);

  const boats = (await req('/resources?type=rescue_boat')).body;
  const d = await req('/allocation/dispatch', { method: 'POST', body: { incident_id: r.body.incident.id, resource_id: boats[0].id } });
  assert.equal(d.status, 201);
  await new Promise((res) => setTimeout(res, 200));
  const toCitizen = (await req(`/gateway/messages?phone=${encodeURIComponent('+919800000001')}`)).body;
  assert.ok(toCitizen.some((m) => m.direction === 'out' && /Help is on the way/.test(m.body)));

  const arrived = await req('/gateway/sms', { method: 'POST', as: null, body: { from: '+919000000001', body: 'ARRIVED' } });
  assert.equal(arrived.body.command.action, 'on_scene');
  const done = await req('/gateway/sms', { method: 'POST', as: null, body: { from: '+919000000001', body: 'DONE 4' } });
  assert.equal(done.body.command.severity, 4);
  const disp = (await req(`/incidents/${r.body.incident.id}`)).body.dispatches.find((x) => x.id === d.body.id);
  assert.equal(disp.status, 'completed');
});

test('SMS without a location asks for the area, then uses the follow-up', async () => {
  const a = await req('/gateway/sms', { method: 'POST', as: null, body: { from: '+919800000002', body: 'my father injured need ambulance' } });
  assert.equal(a.body.needsLocation, true);
  const b = await req('/gateway/sms', { method: 'POST', as: null, body: { from: '+919800000002', body: 'Saidapet' } });
  assert.equal(b.body.report.nlp.category, 'medical');
  assert.ok(b.body.incident);
});

test('LoRa mesh message with GPS creates or merges an incident', async () => {
  const r = await req('/gateway/mesh', { method: 'POST', as: null, body: { from: 'lora-7', text: '12 people on rooftop near lake need boat', channel: 'lora', lat: 12.976, lng: 80.223 } });
  assert.equal(r.status, 201);
  assert.equal(r.body.report.channel, 'lora');
});

test('offline field app replay is idempotent (x-op-id)', async () => {
  const inc = (await req('/incidents?active=true')).body.find((i) => i.status === 'open');
  const unit = (await req('/resources')).body.find((x) => x.status === 'available' && x.type === 'ambulance');
  const d = (await req('/allocation/dispatch', { method: 'POST', body: { incident_id: inc.id, resource_id: unit.id } })).body;
  const first = await req(`/allocation/dispatches/${d.id}`, { method: 'PATCH', body: { status: 'on_scene' }, headers: { 'x-op-id': 'op-abc' } });
  const replay = await req(`/allocation/dispatches/${d.id}`, { method: 'PATCH', body: { status: 'on_scene' }, headers: { 'x-op-id': 'op-abc' } });
  assert.equal(first.status, 200);
  assert.equal(replay.headers.get('x-idempotent-replay'), 'true');
  assert.deepEqual(replay.body, first.body);
});

test('camp inventory: distribution, low-stock alert and volunteer scoping', async () => {
  const camp = (await req('/camps')).body[0];
  const water = camp.inventory.find((i) => i.item === 'Drinking water');
  const r = await req(`/camps/${camp.id}/stock`, { method: 'POST', body: { item: 'Drinking water', delta: -(water.quantity - 10), reason: 'test distribution' } });
  assert.equal(r.status, 200);
  const alerts = (await req('/alerts')).body;
  assert.ok(alerts.some((a) => /Low stock/.test(a.title)));
  assert.equal((await req(`/camps/${camp.id}/stock`, { method: 'POST', body: { item: 'Drinking water', delta: -999999, reason: 'too much' } })).status, 409);
  // volunteer is assigned to camp 1 only
  assert.equal((await req('/camps/1/occupancy', { method: 'POST', as: 'volunteer', body: { delta: 5 } })).status, 200);
  assert.equal((await req('/camps/3/occupancy', { method: 'POST', as: 'volunteer', body: { delta: 5 } })).status, 403);
});

test('evacuation plan respects camp capacity', async () => {
  const plan = (await req('/evacuation/plan')).body;
  const camps = (await req('/camps')).body;
  for (const z of plan.zones)
    for (const a of z.allocations) {
      const c = camps.find((x) => x.id === a.camp_id);
      assert.ok(a.people <= c.capacity - c.occupancy);
    }
});

test('connectivity can be forced offline for drills', async () => {
  const r = await req('/resilience/connectivity', { method: 'POST', body: { forcedOffline: true } });
  assert.equal(r.body.mode, 'lan-only');
  const lan = (await req('/resilience/lan')).body;
  assert.match(lan.qr_svg, /<svg/);
});

test('cloud sync ingest (state HQ side) requires the key and upserts', async () => {
  assert.equal((await req('/sync/ingest', { method: 'POST', as: null, body: { node_id: 'x', records: [] } })).status, 401);
  const rec = { entity: 'incident', entity_id: '1', op: 'create', payload: { status: 'open' } };
  const ok = await req('/sync/ingest', { method: 'POST', as: null, headers: { 'x-sync-key': 'test-key' }, body: { node_id: 'tambaram-camp', records: [rec, { ...rec, op: 'update' }] } });
  assert.equal(ok.body.accepted, 2);
  const nodes = (await req('/sync/nodes')).body;
  assert.equal(nodes.find((n) => n.node_id === 'tambaram-camp').incidents, 1);
  assert.ok((await req('/sync/status')).body.pending > 0); // edge outbox keeps changes while offline
});

test('audit trail records actions and exports work', async () => {
  const audit = (await req('/audit?limit=50')).body;
  assert.ok(audit.some((a) => a.action === 'dispatch.create' && a.user_email === 'admin@drp.in'));
  assert.ok(audit.every((a) => !JSON.stringify(a.details || {}).includes('admin123')));
  const csv = await req('/exports/incidents.csv');
  assert.match(csv.body, /^\uFEFF?id,title,disaster_type/);
  const pdf = await fetch(`${base}/exports/sitrep.pdf`, { headers: { authorization: `Bearer ${tokens.admin}` } });
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.equal((await req('/exports/incidents.csv', { as: 'responder' })).status, 403);
});

test('OpenAPI docs are served', async () => {
  const spec = (await req('/openapi.json')).body;
  assert.equal(spec.openapi, '3.0.3');
  assert.ok(Object.keys(spec.paths).length > 40);
});
