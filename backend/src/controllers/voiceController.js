// Voice input: offline speech-to-text, then the same pipelines as typed text.
import { receiveMessage } from '../services/sms.js';
import { transcribe, voiceInfo } from '../services/voice.js';

function audioFrom(req) {
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || !buf.length) throw Object.assign(new Error('Send the recording as audio/wav in the request body'), { status: 400 });
  req.body = { audio: `${buf.length} bytes`, lang: req.query.lang }; // keep the audit log small
  return buf;
}

async function run(res, fn) {
  try {
    await fn();
  } catch (e) {
    const status = e.status || (/Cannot find (module|package)/.test(e.message) ? 503 : 500);
    res.status(status).json({
      error: status === 503 ? 'Offline speech recognition is not installed on this server. Run npm install in backend once (needs internet).' : e.message,
    });
  }
}

export const info = (_req, res) => res.json(voiceInfo());

/** POST /voice/transcribe?lang=en|ta  (body: audio/wav) → { text, raw, fixes, seconds, ms } */
export const transcribeAudio = (req, res) =>
  run(res, async () => {
    const buf = audioFrom(req);
    res.json(await transcribe(buf, req.query.lang === 'ta' ? 'ta' : 'en'));
  });

/**
 * POST /gateway/voice?from=+91…&channel=voice|radio&lang=en|ta  (body: audio/wav)
 * A 2G voice call / voice note to the helpline, or a radio operator's recording.
 * Transcribed offline, then handled exactly like an SMS (AI triage, incident, SMS reply).
 */
export const gatewayVoice = (req, res) =>
  run(res, async () => {
    const from = String(req.query.from || '').trim();
    if (!from) throw Object.assign(new Error('from (caller number or radio callsign) is required'), { status: 400 });
    const buf = audioFrom(req);
    const tr = await transcribe(buf, req.query.lang === 'ta' ? 'ta' : 'en');
    if (tr.text.length < 2) throw Object.assign(new Error('Could not hear any words in the recording'), { status: 422 });
    const channel = req.query.channel === 'radio' ? 'radio' : 'voice';
    const out = await receiveMessage({ from, body: tr.text, channel, meta: { voice: { seconds: tr.seconds, raw: tr.raw, fixes: tr.fixes, model: tr.model } } });
    res.status(201).json({ transcript: tr, ...out });
  });
