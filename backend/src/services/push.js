// Web Push (VAPID) — the same push channel Firebase Cloud Messaging uses in
// Chrome. Responders get a phone notification for new assignments, admins for
// critical alerts. Needs internet (push goes via the browser vendor's server);
// on a LAN-only network the Socket.IO + SMS channels cover the gap.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import webpush from 'web-push';
import { config } from '../config.js';
import { json, query } from '../db/postgres.js';
import { internetAvailable } from './connectivity.js';
import { bus, EVENTS } from './events.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let keys = null;

export function initPush() {
  if (config.vapidPublic && config.vapidPrivate) keys = { publicKey: config.vapidPublic, privateKey: config.vapidPrivate };
  else {
    const file = path.resolve(__dirname, '../../.vapid.json');
    try {
      keys = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      keys = webpush.generateVAPIDKeys();
      try {
        fs.writeFileSync(file, JSON.stringify(keys));
      } catch {
        /* read-only FS: keys live in memory */
      }
    }
  }
  webpush.setVapidDetails(config.vapidSubject, keys.publicKey, keys.privateKey);
}

export const publicKey = () => keys?.publicKey;

export async function subscribe(user, sub) {
  await query(
    `INSERT INTO push_subscriptions (user_id, role, endpoint, keys) VALUES ($1,$2,$3,$4)
     ON CONFLICT (endpoint) DO UPDATE SET user_id=EXCLUDED.user_id, role=EXCLUDED.role, keys=EXCLUDED.keys`,
    [user?.id || null, user?.role || 'citizen', sub.endpoint, json(sub.keys)],
  );
}

export async function sendTo(where, params, payload) {
  if (!internetAvailable()) return { sent: 0, skipped: 'offline' };
  const subs = await query(`SELECT * FROM push_subscriptions WHERE ${where}`, params);
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload), { TTL: 3600 });
      sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) await query(`DELETE FROM push_subscriptions WHERE id=$1`, [s.id]);
    }
  }
  return { sent };
}

export function registerPushObservers() {
  bus.on(EVENTS.DISPATCH_CREATED, async (d) => {
    const users = await query(`SELECT id FROM users WHERE resource_id=$1`, [d.resource_id]);
    for (const u of users)
      await sendTo('user_id=$1', [u.id], { title: '🚨 New assignment', body: `${d.incident_title} · ETA ${Math.round(d.eta_min)} min`, url: '/field' });
  });
  bus.on(EVENTS.ALERT_CREATED, async (a) => {
    if (a.level === 'critical') await sendTo(`role='admin'`, [], { title: `⚠️ ${a.title}`, body: a.message, url: '/' });
  });
}
