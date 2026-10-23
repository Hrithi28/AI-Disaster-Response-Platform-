// Alerts & notifications. Every alert is persisted and pushed to dashboards
// over Socket.IO. Critical alerts are also sent by SMS through Twilio when
// credentials are configured; otherwise the SMS is simulated and logged.
import { config } from '../config.js';
import { json, one, query } from '../db/postgres.js';
import { internetAvailable } from './connectivity.js';
import { EVENTS, publish } from './events.js';
import { emit } from './realtime.js';

const twilioReady = () => Boolean(config.twilio.sid && config.twilio.token && config.twilio.from && config.twilio.to);

async function sendSms(body) {
  if (!twilioReady()) {
    console.log(`[sms:simulated] ${body}`);
    return 'sms (simulated)';
  }
  if (!internetAvailable()) return 'sms (queued – no internet)';
  const { sid, token, from, to } = config.twilio;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ From: from, To: to, Body: body.slice(0, 300) }),
  });
  return res.ok ? 'sms' : 'sms (failed)';
}

export async function createAlert({ level = 'info', title, message, incidentId = null }) {
  const channels = ['dashboard'];
  if (level === 'critical') {
    try {
      channels.push(await sendSms(`[DRP ${level.toUpperCase()}] ${title}: ${message}`));
    } catch {
      channels.push('sms (failed)');
    }
  }
  const alert = await one(
    `INSERT INTO alerts (level, title, message, incident_id, channels) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [level, title, message, incidentId, json(channels)],
  );
  emit('alert:new', alert);
  publish(EVENTS.ALERT_CREATED, alert);
  return alert;
}

export async function listAlerts(limit = 50) {
  return query(`SELECT * FROM alerts ORDER BY id DESC LIMIT $1`, [limit]);
}
