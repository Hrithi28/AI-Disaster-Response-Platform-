// SMS & mesh gateway — the "no mobile data" lifeline.
//
// Inbound: citizens text the helpline (works on 2G); LoRa/Meshtastic nodes and
// radio operators relay short messages. Every message runs through the same
// NLP → fusion → severity → allocation pipeline as a web SOS.
// Outbound: automatic replies (received / unit assigned / resolved) and
// assignment texts to responders, who can answer "ARRIVED" or "DONE 4".
//
// Providers (SMS_PROVIDER):
//   simulated – log only (default, for demos)
//   android   – an Android phone running an SMS-gateway app on the LAN
//               (no internet needed; sends through the phone's SIM)
//   twilio    – cloud SMS (needs internet; queued and retried when offline)
import { config } from '../config.js';
import { findLocality, localityInText, nearestLocality, streetInText } from '../data/chennai.js';
import { json, one, query } from '../db/postgres.js';
import { internetAvailable } from './connectivity.js';
import { bus, EVENTS } from './events.js';
import { emit } from './realtime.js';

const SAFETY_TIP = {
  rescue: 'Move to the highest floor, keep your phone charged, wave a bright cloth.',
  medical: 'Keep the patient still and warm. Do not give food if unconscious.',
  fire: 'Leave the building, stay low under smoke, do not use lifts.',
  food_water: 'Boil or chlorinate water before drinking.',
  shelter: 'Nearest relief camp details will be sent shortly.',
  infrastructure: 'Stay away from fallen wires and flooded subways.',
  info: 'Thank you for the update.',
};

/** Extract location, people count and intent from a free-text SMS. */
export function parseSms(body) {
  const text = String(body || '').trim();
  const gps = text.match(/(-?\d{1,2}\.\d{3,})\s*[, ]\s*(-?\d{2,3}\.\d{3,})/);
  const street = streetInText(text);
  const loc = localityInText(text) || (street ? nearestLocality(street.lat, street.lng) : null);
  const people = text.match(/(\d{1,4})\s*(?:people|persons|ppl|members|family|families|of us|பேர்|நபர்)/i);
  const isSos = /\b(sos|help|urgent|trapped|rescue)\b/i.test(text) || /உதவி|காப்பாற்ற/.test(text);
  const cmd = text.match(/^\s*(arrived|reached|done|completed)\b\s*(\d)?/i);
  return {
    text,
    lat: gps ? Number(gps[1]) : street?.lat ?? loc?.lat ?? null,
    lng: gps ? Number(gps[2]) : street?.lng ?? loc?.lng ?? null,
    locality: loc?.name || null,
    street: street?.name || null,
    locationSource: gps ? 'gps' : street ? 'street (OSM)' : loc ? 'gazetteer' : null,
    people: people ? Number(people[1]) : null,
    isSos,
    language: /[஀-௿]/.test(text) ? 'ta' : 'en',
    command: cmd ? { action: /arrived|reached/i.test(cmd[1]) ? 'on_scene' : 'completed', severity: cmd[2] ? Number(cmd[2]) : null } : null,
  };
}

async function deliver(phone, body) {
  const p = config.smsProvider;
  if (p === 'android') {
    if (!config.smsGatewayUrl) return 'failed (SMS_GATEWAY_URL not set)';
    try {
      const res = await fetch(config.smsGatewayUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone, to: phone, message: body }),
        signal: AbortSignal.timeout(4000),
      });
      return res.ok ? 'sent (LAN SMS gateway)' : `failed (${res.status})`;
    } catch {
      return 'failed (gateway unreachable)';
    }
  }
  if (p === 'twilio' && config.twilio.sid) {
    if (!internetAvailable()) return 'queued (no internet)';
    const { sid, token, from } = config.twilio;
    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'), 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ From: from, To: phone, Body: body.slice(0, 640) }),
        signal: AbortSignal.timeout(6000),
      });
      return res.ok ? 'sent (twilio)' : 'queued (twilio error)';
    } catch {
      return 'queued (twilio unreachable)';
    }
  }
  return 'delivered (simulated GSM)';
}

export async function sendSms({ phone, body, incidentId = null, channel = 'sms', meta = null }) {
  if (channel === 'voice') channel = 'sms'; // voice callers are answered by SMS on the same phone
  const status = channel === 'sms' ? await deliver(phone, body) : `relayed (${channel})`;
  const row = await one(
    `INSERT INTO sms_messages (direction, channel, phone, body, status, incident_id, meta) VALUES ('out',$1,$2,$3,$4,$5,$6) RETURNING *`,
    [channel, phone, body, status, incidentId, json(meta)],
  );
  emit('sms:new', row);
  return row;
}

/** Retry SMS that were queued while the internet was down (Twilio provider). */
export async function retryQueued() {
  if (!internetAvailable()) return 0;
  const rows = await query(`SELECT * FROM sms_messages WHERE direction='out' AND status LIKE 'queued%' ORDER BY id LIMIT 20`);
  for (const r of rows) {
    const status = await deliver(r.phone, r.body);
    const upd = await one(`UPDATE sms_messages SET status=$2 WHERE id=$1 RETURNING *`, [r.id, status]);
    emit('sms:update', upd);
  }
  return rows.length;
}

/**
 * Handle an inbound message from any low-bandwidth channel.
 * channel: 'sms' | 'lora' | 'radio' | 'voice' (transcribed 2G voice call)
 */
export async function receiveMessage({ from, body, channel = 'sms', lat = null, lng = null, meta = null }) {
  const { processReport } = await import('./reports.js'); // lazy: avoids an import cycle
  const parsed = parseSms(body);
  const inbound = await one(
    `INSERT INTO sms_messages (direction, channel, phone, body, status, meta) VALUES ('in',$1,$2,$3,'received',$4) RETURNING *`,
    [channel, from, parsed.text, json({ ...meta, parsed })],
  );
  emit('sms:new', inbound);

  // 1) Responder command over SMS ("ARRIVED", "DONE 4") — works without data
  const responder = await one(`SELECT * FROM users WHERE phone=$1 AND role='responder' AND is_active=true`, [from]);
  if (responder && parsed.command) {
    const d = await one(`SELECT * FROM dispatches WHERE resource_id=$1 AND status IN ('en_route','on_scene') ORDER BY id DESC LIMIT 1`, [responder.resource_id]);
    if (!d) return { inbound, reply: await sendSms({ phone: from, body: 'DRP: No active assignment found for your unit.', channel }) };
    const { updateDispatchStatus } = await import('./allocation.js');
    await updateDispatchStatus(d.id, parsed.command.action, { actualSeverity: parsed.command.severity || undefined });
    const msg = parsed.command.action === 'on_scene' ? `DRP: Arrival logged for dispatch #${d.id}. Reply DONE <1-5> when finished.` : `DRP: Dispatch #${d.id} closed. Thank you.`;
    return { inbound, command: parsed.command, reply: await sendSms({ phone: from, body: msg, incidentId: d.incident_id, channel }) };
  }

  // 2) Location: explicit GPS from mesh device > GPS in text > locality name > earlier message from same phone
  let latV = lat ?? parsed.lat;
  let lngV = lng ?? parsed.lng;
  let text = parsed.text;
  // A previous message from this number that lacked a location ("my father is injured")
  // is combined with this one ("Saidapet") so the full context reaches the AI.
  const prev = await one(
    `SELECT * FROM sms_messages WHERE phone=$1 AND direction='in' AND status='needs_location' AND id<>$2 ORDER BY id DESC LIMIT 1`,
    [from, inbound.id],
  );
  if (prev && Date.now() - new Date(prev.created_at).getTime() < 60 * 60000) {
    text = `${prev.body}. ${text}`;
    await query(`UPDATE sms_messages SET status='combined' WHERE id=$1`, [prev.id]);
  }
  if (latV == null) {
    const st = streetInText(text);
    const loc = st || localityInText(text);
    if (loc) {
      latV = loc.lat;
      lngV = loc.lng;
    }
  }
  if (latV == null) {
    const reply = await sendSms({
      phone: from,
      channel,
      body: `DRP Chennai: Message received. We could not find your area. Reply with your area name, e.g. "SOS Velachery 5 people trapped".`,
    });
    await query(`UPDATE sms_messages SET status='needs_location' WHERE id=$1`, [inbound.id]);
    return { inbound, reply, needsLocation: true };
  }

  // 3) Same AI pipeline as every other channel
  const { report, incident, merged } = await processReport({
    channel,
    text,
    lat: latV + (Math.random() - 0.5) * 0.004,
    lng: lngV + (Math.random() - 0.5) * 0.004,
    author: `${channel.toUpperCase()} ${maskPhone(from)}`,
    phone: from,
    people: parsed.people || undefined,
  });
  await query(`UPDATE sms_messages SET status='processed', incident_id=$2, report_id=$3 WHERE id=$1`, [inbound.id, incident?.id || null, report.id]);
  const cat = report.nlp?.category || 'info';
  const replyText = incident
    ? `DRP Chennai: SOS received (ref #${incident.id}). Type ${cat.replace('_', ' ').toUpperCase()}, urgency ${String(report.nlp.urgency_label).toUpperCase()}. ${merged ? 'Linked to an active rescue in your area.' : 'Team being assigned.'} ${SAFETY_TIP[cat] || ''}`
    : `DRP Chennai: Message logged. ${SAFETY_TIP[cat] || ''} Text SOS with your area if you need help.`;
  const reply = await sendSms({ phone: from, body: replyText.trim(), incidentId: incident?.id, channel });
  return { inbound, report, incident, merged, reply, parsed };
}

const maskPhone = (p) => String(p).replace(/(\d{2})\d+(\d{3})$/, '$1•••••$2');

async function phonesForIncident(incidentId) {
  const rows = await query(`SELECT DISTINCT phone, channel FROM sms_messages WHERE incident_id=$1 AND direction='in'`, [incidentId]);
  return rows;
}

// ---- Observers: keep SMS citizens & responders informed ----
export function registerSmsObservers() {
  bus.on(EVENTS.DISPATCH_CREATED, async (d) => {
    const inc = await one(`SELECT id, title, locality FROM incidents WHERE id=$1`, [d.incident_id]);
    for (const p of await phonesForIncident(d.incident_id)) {
      await sendSms({ phone: p.phone, channel: p.channel, incidentId: d.incident_id, body: `DRP: Help is on the way to ref #${d.incident_id}. ${d.resource_name} assigned, ETA ~${Math.round(d.eta_min)} min.` });
    }
    const responder = await one(`SELECT phone FROM users WHERE resource_id=$1 AND role='responder' AND phone IS NOT NULL`, [d.resource_id]);
    if (responder?.phone) {
      await sendSms({
        phone: responder.phone,
        incidentId: d.incident_id,
        body: `DRP ASSIGNMENT #${d.id}: ${inc?.title} (${inc?.locality}). ${d.distance_km} km, ETA ${Math.round(d.eta_min)} min. Reply ARRIVED, then DONE <severity 1-5>.`,
        meta: { kind: 'responder-assignment' },
      });
    }
  });
  bus.on(EVENTS.INCIDENT_RESOLVED, async (inc) => {
    for (const p of await phonesForIncident(inc.id)) {
      await sendSms({ phone: p.phone, channel: p.channel, incidentId: inc.id, body: `DRP: Ref #${inc.id} has been marked resolved by the field team. If you still need help, text SOS with your area.` });
    }
  });
}

export async function listMessages({ phone, channel, limit = 100 } = {}) {
  const cond = [];
  const params = [];
  if (phone) cond.push(`phone=$${params.push(phone)}`);
  if (channel) cond.push(`channel=$${params.push(channel)}`);
  params.push(Math.min(500, limit));
  return query(`SELECT * FROM sms_messages ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY id DESC LIMIT $${params.length}`, params);
}

export const gatewayInfo = () => ({
  provider: config.smsProvider,
  helpline: config.helplineNumber,
  androidGateway: config.smsGatewayUrl || null,
  needsInternet: config.smsProvider === 'twilio',
});

export { findLocality };
