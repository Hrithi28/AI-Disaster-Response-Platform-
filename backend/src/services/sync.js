// Store-and-forward cloud sync. Each control room ("edge node") keeps working
// on its own; every important change is written to sync_outbox. When the
// internet is available, batches are pushed to the state-level cloud server
// (CLOUD_SYNC_URL), which upserts them by (node, entity, id). Nothing is lost
// during an outage — it simply waits in the outbox.
import { config } from '../config.js';
import { json, one, query } from '../db/postgres.js';
import { connectivity } from './connectivity.js';
import { bus, EVENTS } from './events.js';
import { emit } from './realtime.js';

export const syncState = { lastPushAt: null, lastError: null, pushed: 0, running: false };

async function enqueue(entity, entityId, op, payload) {
  const slim = { ...payload };
  delete slim.route; // keep payloads small
  await query(`INSERT INTO sync_outbox (entity, entity_id, op, payload) VALUES ($1,$2,$3,$4)`, [entity, String(entityId), op, json(slim)]);
}

export function registerSyncObservers() {
  bus.on(EVENTS.INCIDENT_CREATED, (i) => enqueue('incident', i.id, 'create', i));
  bus.on(EVENTS.INCIDENT_UPDATED, (i) => enqueue('incident', i.id, 'update', i));
  bus.on(EVENTS.INCIDENT_RESOLVED, (i) => enqueue('incident', i.id, 'resolve', i));
  bus.on(EVENTS.DISPATCH_CREATED, (d) => enqueue('dispatch', d.id, 'create', d));
  bus.on(EVENTS.DISPATCH_UPDATED, (d) => enqueue('dispatch', d.id, 'update', d));
  bus.on(EVENTS.CAMP_UPDATED, (c) => enqueue('camp', c.id, 'update', { ...c, transactions: undefined }));
  bus.on(EVENTS.ALERT_CREATED, (a) => a.level !== 'info' && enqueue('alert', a.id, 'create', a));
}

export async function pendingCount() {
  return (await one(`SELECT COUNT(*)::int AS n FROM sync_outbox WHERE synced_at IS NULL`)).n;
}

export async function pushOnce() {
  if (!config.cloudSyncUrl || config.nodeRole === 'cloud') return { skipped: 'no CLOUD_SYNC_URL' };
  // The cloud may be on the internet or on a satellite/LAN link, so we simply try;
  // failures leave everything queued. The outage drill pauses sync explicitly.
  if (connectivity.forcedOffline) return { skipped: 'offline drill – queued' };
  if (syncState.running) return { skipped: 'busy' };
  syncState.running = true;
  try {
    const batch = await query(`SELECT * FROM sync_outbox WHERE synced_at IS NULL ORDER BY id LIMIT 200`);
    if (!batch.length) return { pushed: 0 };
    const res = await fetch(`${config.cloudSyncUrl.replace(/\/$/, '')}/api/sync/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-sync-key': config.syncKey },
      body: JSON.stringify({ node_id: config.nodeId, records: batch.map((b) => ({ entity: b.entity, entity_id: b.entity_id, op: b.op, payload: b.payload, created_at: b.created_at })) }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`cloud responded ${res.status}`);
    const maxId = batch[batch.length - 1].id;
    await query(`UPDATE sync_outbox SET synced_at=now() WHERE id <= $1 AND synced_at IS NULL`, [maxId]);
    syncState.lastPushAt = new Date().toISOString();
    syncState.lastError = null;
    syncState.pushed += batch.length;
    emit('sync:update', await status());
    return { pushed: batch.length };
  } catch (e) {
    syncState.lastError = e.name === 'TimeoutError' || e.cause ? 'cloud unreachable – changes stay queued' : e.message;
    emit('sync:update', await status());
    return { error: e.message };
  } finally {
    syncState.running = false;
  }
}

/** Cloud side: receive a batch from an edge node. Later records win. */
export async function ingest(nodeId, records) {
  let n = 0;
  for (const r of records) {
    await query(
      `INSERT INTO synced_records (node_id, entity, entity_id, op, payload) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (node_id, entity, entity_id) DO UPDATE SET op=EXCLUDED.op, payload=EXCLUDED.payload, received_at=now()`,
      [nodeId, r.entity, String(r.entity_id), r.op, json(r.payload)],
    );
    n++;
  }
  emit('sync:ingested', { node_id: nodeId, count: n });
  return n;
}

export async function cloudSummary() {
  const rows = await query(`SELECT node_id, entity, op, received_at, payload FROM synced_records`);
  const nodes = {};
  for (const r of rows) {
    const n = (nodes[r.node_id] ||= { node_id: r.node_id, records: 0, incidents: 0, active_incidents: 0, dispatches: 0, camps: 0, last_received: null });
    n.records++;
    if (r.entity === 'incident') {
      n.incidents++;
      if (r.payload?.status !== 'resolved') n.active_incidents++;
    }
    if (r.entity === 'dispatch') n.dispatches++;
    if (r.entity === 'camp') n.camps++;
    if (!n.last_received || r.received_at > n.last_received) n.last_received = r.received_at;
  }
  return Object.values(nodes);
}

export async function status() {
  return {
    node_id: config.nodeId,
    role: config.nodeRole,
    cloud_url: config.cloudSyncUrl || null,
    pending: await pendingCount(),
    ...syncState,
  };
}
