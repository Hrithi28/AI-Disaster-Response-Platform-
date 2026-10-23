// Integration test: boots the real server on a random port with in-memory DBs.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';
process.env.MONGO_URL = '';
process.env.ML_URL = process.env.ML_URL_TEST || 'http://127.0.0.1:1'; // ML offline → exercises fallbacks

const { start } = await import('../src/server.js');
let srv;
let base;
let token;

const req = async (path, { method = 'GET', body, auth = true } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(auth && token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
};

before(async () => {
  srv = await start({ port: 0, loops: false });
  base = `http://127.0.0.1:${srv.server.address().port}/api`;
  token = (await req('/auth/login', { method: 'POST', body: { email: 'admin@drp.in', password: 'admin123' } })).body.token;
});
after(() => srv.close());

test('health reports database modes', async () => {
  const { body } = await req('/health');
  assert.equal(body.status, 'ok');
  assert.match(body.postgres, /PGlite|postgresql/i);
});

test('rejects bad login and protects admin routes', async () => {
  assert.equal((await req('/auth/login', { method: 'POST', body: { email: 'admin@drp.in', password: 'nope' }, auth: false })).status, 401);
  assert.equal((await req('/allocation/optimize', { method: 'POST', body: {}, auth: false })).status, 401);
});

test('validation errors are reported', async () => {
  const r = await req('/incidents', { method: 'POST', body: { disaster_type: 'meteor', lat: 13, lng: 80 } });
  assert.equal(r.status, 400);
});

test('create incident → scored → optimiser dispatches → resolve', async () => {
  const created = await req('/incidents', {
    method: 'POST',
    body: { disaster_type: 'fire', lat: 13.04, lng: 80.23, affected_people: 300, injured: 12, needs: ['firefighting', 'medical'], features: { infrastructure_damage: 0.7 } },
  });
  assert.equal(created.status, 201);
  const id = created.body.id;
  assert.ok(created.body.severity >= 1 && created.body.severity <= 5);

  const plan = await req('/allocation/optimize', { method: 'POST', body: { commit: true } });
  assert.ok(plan.body.summary.avg_eta_min <= plan.body.summary.baseline_avg_eta_min + 5);

  const detail = await req(`/incidents/${id}`);
  assert.equal(detail.body.status, 'assigned');
  assert.ok(detail.body.dispatches.length >= 2);
  // critical incidents may already be auto-dispatched; either way a fire tender must be assigned
  assert.ok(detail.body.dispatches.some((d) => d.resource_type === 'fire_truck'));
  assert.deepEqual(detail.body.outstanding, {});

  const resolved = await req(`/incidents/${id}/resolve`, { method: 'POST', body: { actual_severity: 4 } });
  assert.equal(resolved.body.status, 'resolved');
});

test('citizen SOS is classified and fused into an incident', async () => {
  const r = await req('/reports/sos', { method: 'POST', auth: false, body: { text: 'URGENT 10 people trapped on rooftop, water rising', lat: 12.98, lng: 80.22, people: 10 } });
  assert.equal(r.status, 201);
  assert.equal(r.body.report.nlp.category, 'rescue');
  assert.ok(r.body.incident);
});

test('analytics summary aggregates', async () => {
  const { body } = await req('/analytics/summary');
  assert.ok(body.totals.incidents >= 7);
  assert.ok(body.resources.total >= 30);
});
