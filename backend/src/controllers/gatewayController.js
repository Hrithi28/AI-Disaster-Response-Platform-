import { config } from '../config.js';
import { gatewayInfo, listMessages, receiveMessage } from '../services/sms.js';

const twiml = (msg) => `<?xml version="1.0" encoding="UTF-8"?><Response>${msg ? `<Message>${msg.replace(/[<&>]/g, '')}</Message>` : ''}</Response>`;

/**
 * Inbound SMS webhook. Accepts:
 *  - Twilio (form-encoded From/Body) → replies with TwiML
 *  - Android SMS-gateway apps / generic JSON { from, body } or { phone, message }
 */
export async function smsInbound(req, res) {
  const b = req.body || {};
  const from = b.From || b.from || b.phone || b.sender;
  const body = b.Body || b.body || b.message || b.text;
  if (!from || !body) return res.status(400).json({ error: 'from and body are required' });
  const out = await receiveMessage({ from: String(from), body: String(body), channel: 'sms', meta: { provider: b.From ? 'twilio' : 'gateway' } });
  if (b.From && config.smsProvider === 'twilio') return res.type('text/xml').send(twiml(null)); // reply already sent via API
  res.status(201).json(out);
}

/** LoRa / Meshtastic bridge or radio-relay operator. GPS is used when present. */
export async function meshInbound(req, res) {
  const b = req.body;
  res.status(201).json(await receiveMessage({ from: b.from, body: b.text, channel: b.channel || 'lora', lat: b.lat ?? null, lng: b.lng ?? null, meta: { node: b.node, snr: b.snr, hops: b.hops } }));
}

export async function messages(req, res) {
  res.json(await listMessages({ phone: req.query.phone, channel: req.query.channel, limit: Number(req.query.limit) || 100 }));
}

export const info = (_req, res) => res.json(gatewayInfo());
