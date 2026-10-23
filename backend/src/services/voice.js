// Offline speech-to-text for emergency voice messages.
//
// Runs OpenAI's Whisper (multilingual "base" model, 8-bit quantised ONNX, ~80 MB) inside this
// Node process with transformers.js + ONNX Runtime. No cloud API and no internet: the model files
// ship in the `sts-whisper-base` npm package and are loaded from disk.
//
// The browser records the voice, converts it to 16 kHz mono 16-bit WAV and POSTs the raw bytes.
// The transcript then goes through exactly the same AI pipeline as typed text.
import { createRequire } from 'node:module';
import path from 'node:path';
import { LOCALITIES } from '../data/chennai.js';

const require = createRequire(import.meta.url);
const MODEL_PKG = process.env.VOICE_MODEL_PKG || 'sts-whisper-base'; // or sts-whisper-small (better Tamil, slower)
let asrPromise = null;
let modelName = null;
let lastError = null;

function modelDir() {
  const pkgJson = require.resolve(`${MODEL_PKG}/package.json`);
  return path.join(path.dirname(pkgJson), 'models');
}

async function loadAsr() {
  const { pipeline, env } = await import('@huggingface/transformers');
  env.allowRemoteModels = false; // never try to download anything
  env.localModelPath = `${modelDir()}${path.sep}`;
  const sub = (await import('node:fs')).readdirSync(path.join(modelDir(), 'Xenova'))[0];
  modelName = `Xenova/${sub}`;
  const t = Date.now();
  const asr = await pipeline('automatic-speech-recognition', modelName, { dtype: 'q8' });
  console.log(`[voice] offline speech recognition ready: ${modelName} (${Date.now() - t} ms)`);
  return asr;
}

export function getAsr() {
  if (!asrPromise) {
    asrPromise = loadAsr().catch((e) => {
      lastError = e.message;
      asrPromise = null;
      throw e;
    });
  }
  return asrPromise;
}

/** Load the model in the background so the first voice message is fast. */
export function preloadVoice() {
  getAsr().catch((e) => console.warn(`[voice] speech recognition unavailable: ${e.message.split('\n')[0]}`));
}

export function voiceInfo() {
  let installed = true;
  try {
    modelDir();
  } catch {
    installed = false;
  }
  return { installed, model: modelName || MODEL_PKG.replace('sts-', ''), ready: Boolean(modelName), languages: ['en', 'ta'], error: lastError };
}

/** Parse a PCM WAV buffer (8/16-bit, any rate, mono or stereo) into 16 kHz mono Float32. */
export function wavToFloat32(buf) {
  try {
    return decodeWav(buf);
  } catch (e) {
    throw Object.assign(e, { status: 400 });
  }
}

function decodeWav(buf) {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Audio must be a WAV file');
  let off = 12;
  let fmt = null;
  let data = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { format: buf.readUInt16LE(off + 8), channels: buf.readUInt16LE(off + 10), rate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    if (id === 'data') {
      data = buf.subarray(off + 8, Math.min(buf.length, off + 8 + size));
      break;
    }
    off += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error('WAV file has no audio data');
  if (fmt.format !== 1 || ![8, 16].includes(fmt.bits)) throw new Error('Only PCM 8/16-bit WAV is supported');
  const bytes = fmt.bits / 8;
  const frames = Math.floor(data.length / (bytes * fmt.channels));
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let s = 0;
    for (let c = 0; c < fmt.channels; c++) {
      const p = (i * fmt.channels + c) * bytes;
      s += fmt.bits === 16 ? data.readInt16LE(p) / 32768 : (data[p] - 128) / 128;
    }
    mono[i] = s / fmt.channels;
  }
  if (fmt.rate === 16000) return mono;
  // linear resample to 16 kHz
  const ratio = fmt.rate / 16000;
  const out = new Float32Array(Math.floor(frames / ratio));
  for (let i = 0; i < out.length; i++) {
    const x = i * ratio;
    const i0 = Math.floor(x);
    const i1 = Math.min(i0 + 1, frames - 1);
    out[i] = mono[i0] + (mono[i1] - mono[i0]) * (x - i0);
  }
  return out;
}

// ---- Place-name correction: speech models misspell local names ("Velocere" → Velachery) ----
const lev = (a, b) => {
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return m[a.length][b.length];
};
const sim = (a, b) => 1 - lev(a, b) / Math.max(a.length, b.length);
// consonant skeleton: Indian place names are often heard with different vowels / aspiration
const skeleton = (s) => s.replace(/h/g, '').replace(/[aeiouy]/g, '').replace(/(.)\1+/g, '$1').replace(/[td]/g, 't').replace(/[kgc]/g, 'k').replace(/[bp]/g, 'p');
const COMMON = new Set(['there', 'their', 'water', 'people', 'please', 'family', 'families', 'rescue', 'injured', 'trapped', 'house', 'rising', 'medical', 'children', 'number', 'shelter', 'nagar', 'about']);
const PLACES = LOCALITIES.map((l) => ({ name: l.name, key: l.name.toLowerCase().replace(/[^a-z]/g, '') }));

export function correctPlaceNames(text) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const out = [];
  const fixes = [];
  for (let k = 0; k < words.length; k++) {
    let done = false;
    if (PLACES.some((p) => p.key === words[k].toLowerCase().replace(/[^a-z]/g, ''))) {
      out.push(words[k]); // already a correct place name
      continue;
    }
    for (const n of [1, 2]) {
      if (k + n > words.length) continue;
      const raw = words.slice(k, k + n).join(' ');
      const core = raw.toLowerCase().replace(/[^a-z]/g, '');
      if (core.length < 4 || COMMON.has(core) || PLACES.some((p) => p.key === core)) continue;
      let best = null;
      for (const p of PLACES) {
        if (core[0] !== p.key[0]) continue;
        const r = sim(core, p.key);
        const sk = sim(skeleton(core), skeleton(p.key));
        const score = Math.max(r, (sk + r) / 2);
        if ((r >= 0.72 || (sk >= 0.75 && r >= 0.5)) && (!best || score > best.score)) best = { p, score };
      }
      if (best) {
        const lead = raw.match(/^[^A-Za-z]*/)[0];
        const trail = raw.match(/[^A-Za-z]*$/)[0];
        out.push(lead + best.p.name + trail);
        fixes.push({ heard: raw.replace(/[^A-Za-z ]/g, ''), place: best.p.name });
        k += n - 1;
        done = true;
        break;
      }
    }
    if (!done) out.push(words[k]);
  }
  return { text: out.join(' '), fixes };
}

/**
 * Transcribe a WAV buffer. lang: 'en' | 'ta'.
 * Returns { text, raw, fixes, language, seconds, ms, model }.
 */
export async function transcribe(buf, lang = 'en') {
  const audio = wavToFloat32(buf);
  const seconds = audio.length / 16000;
  if (seconds < 0.4) throw Object.assign(new Error('Recording is too short — hold the button and speak'), { status: 400 });
  if (seconds > 60) throw Object.assign(new Error('Recording is longer than 60 seconds'), { status: 400 });
  const asr = await getAsr();
  const t = Date.now();
  const language = lang === 'ta' ? 'tamil' : 'english';
  const out = await asr(audio, { language, task: 'transcribe', chunk_length_s: 30 });
  const raw = String(out.text || '').trim();
  const { text, fixes } = lang === 'ta' ? { text: raw, fixes: [] } : correctPlaceNames(raw);
  return { text, raw, fixes, language: lang, seconds: +seconds.toFixed(1), ms: Date.now() - t, model: modelName };
}
