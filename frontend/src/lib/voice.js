// Voice helpers: record → 16 kHz WAV → offline speech-to-text on the control-room server,
// plus read-aloud (text-to-speech) using the device's built-in voices. No internet needed.
import { getToken } from './api';

/** Live microphone recording needs a secure page (https or localhost). */
export const canRecord = () =>
  typeof window !== 'undefined' && window.isSecureContext && Boolean(navigator.mediaDevices?.getUserMedia) && typeof window.MediaRecorder !== 'undefined';

/** Start recording from the microphone. Returns { stop(): Promise<Blob>, cancel(), level() }. */
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
  const rec = new MediaRecorder(stream);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  // simple input level meter
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Uint8Array(analyser.fftSize);
  const level = () => {
    analyser.getByteTimeDomainData(buf);
    let peak = 0;
    for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
    return peak / 128;
  };
  const release = () => {
    stream.getTracks().forEach((t) => t.stop());
    ctx.close().catch(() => {});
  };
  rec.start(250);
  return {
    level,
    stop: () =>
      new Promise((resolve) => {
        rec.onstop = () => {
          release();
          resolve(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
        };
        rec.stop();
      }),
    cancel: () => {
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
      release();
    },
  };
}

/** Decode any browser-playable audio (webm, ogg, m4a, mp3, wav) and re-encode as 16 kHz mono 16-bit WAV. */
export async function toWav16k(blob) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  let decoded;
  try {
    decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  } catch {
    throw new Error('This audio format could not be read on this device. Try recording again.');
  } finally {
    ctx.close().catch(() => {});
  }
  const rate = 16000;
  const frames = Math.max(1, Math.ceil(decoded.duration * rate));
  const off = new OfflineAudioContext(1, frames, rate);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const pcm = (await off.startRendering()).getChannelData(0);
  const out = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const str = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  out.setUint32(4, 36 + pcm.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, 1, true);
  out.setUint32(24, rate, true);
  out.setUint32(28, rate * 2, true);
  out.setUint16(32, 2, true);
  out.setUint16(34, 16, true);
  str(36, 'data');
  out.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
  return new Blob([out], { type: 'audio/wav' });
}

/** POST a WAV recording to an API path; returns parsed JSON. */
export async function postAudio(path, wav) {
  const headers = { 'content-type': 'audio/wav' };
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`/api${path}`, { method: 'POST', headers, body: wav });
  } catch {
    const err = new Error('No connection to the control-room server');
    err.offline = true;
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Voice request failed (${res.status})`), { status: res.status });
  return data;
}

export const transcribe = (wav, lang = 'en') => postAudio(`/voice/transcribe?lang=${lang}`, wav);

/** Read text aloud with the device's own (offline) voices. */
export function speak(text, lang = 'en') {
  if (typeof window === 'undefined' || !window.speechSynthesis || !text) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const want = lang === 'ta' ? 'ta' : 'en';
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find((x) => x.lang?.toLowerCase().startsWith(`${want}-in`)) || voices.find((x) => x.lang?.toLowerCase().startsWith(want));
    if (v) u.voice = v;
    u.lang = v?.lang || (want === 'ta' ? 'ta-IN' : 'en-IN');
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  } catch {
    /* speech not available */
  }
}

const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100 };
/** "six people" / "12 of us" / "20 families" → number of people (families × 4). */
export function peopleFromSpeech(text) {
  const t = text.toLowerCase();
  const m = t.match(/\b(\d{1,4}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundred)\s+(people|persons|of us|members|children|kids|families|family|students|patients|workers)\b/);
  if (!m) return null;
  const n = Number(m[1]) || NUM[m[1]];
  return /famil/.test(m[2]) ? n * 4 : n;
}

/** Severity 1–5 spoken as "severity four" / "level 3". */
export function severityFromSpeech(text) {
  const m = text.toLowerCase().match(/\b(?:severity|level)\s+(\d|one|two|three|four|five)\b/);
  if (!m) return null;
  const n = Number(m[1]) || NUM[m[1]];
  return n >= 1 && n <= 5 ? n : null;
}

/** First number in a sentence, as digits or words ("forty", "12"). */
export function numberIn(text) {
  const m = text.toLowerCase().match(/\b(\d{1,5}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundred)(\s+hundred)?\b/);
  if (!m) return null;
  const n = Number(m[1]) || NUM[m[1]];
  return m[2] && m[1] !== 'hundred' ? n * 100 : n;
}

const ITEM_WORDS = { food: 'food packets', packet: 'food packets', water: 'drinking water', milk: 'milk powder', medicine: 'medicine kits', medical: 'medicine kits', ors: 'ors sachets', blanket: 'blankets', tarpaulin: 'tarpaulins', sheet: 'tarpaulins', rice: 'rice' };

/**
 * Camp voice command → action, e.g.
 *  "distributed 40 food packets" → { kind: 'stock', item: 'Food packets', delta: -40 }
 *  "received 200 litres of water" → { kind: 'stock', item: 'Drinking water', delta: 200 }
 *  "checked in 12 people" → { kind: 'occupancy', delta: 12 }
 *  "we need resupply" → { kind: 'resupply' }
 */
export function parseCampCommand(text, inventory = []) {
  const t = text.toLowerCase();
  const n = numberIn(t);
  if (/\b(resupply|running (out|low)|need more (stock|supplies))\b/.test(t)) return { kind: 'resupply' };
  if (/\b(check(ed)?[ -]?in|admitted|arrived at (the )?camp|new arrivals?)\b/.test(t) && n) return { kind: 'occupancy', delta: n };
  if (/\b(check(ed)?[ -]?out|left the camp|went home|discharged)\b/.test(t) && n) return { kind: 'occupancy', delta: -n };
  let item = inventory.find((i) => t.includes(i.item.toLowerCase()));
  if (!item) {
    const key = Object.keys(ITEM_WORDS).find((w) => t.includes(w));
    if (key) item = inventory.find((i) => i.item.toLowerCase() === ITEM_WORDS[key]);
  }
  if (item && n) {
    if (/\b(distribut\w*|gave|given|handed|served|used|issued)\b/.test(t)) return { kind: 'stock', item: item.item, unit: item.unit, delta: -n };
    if (/\b(receiv\w*|restock\w*|donat\w*|got|delivered|arrived|added)\b/.test(t)) return { kind: 'stock', item: item.item, unit: item.unit, delta: n };
  }
  return null;
}
