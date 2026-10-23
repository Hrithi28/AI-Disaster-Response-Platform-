// Offline voice: WAV parsing, place-name correction, and a full spoken SOS through the gateway.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';
process.env.MONGO_URL = '';
process.env.ML_URL = 'http://127.0.0.1:1';

const { start } = await import('../src/server.js');
const { correctPlaceNames, wavToFloat32, voiceInfo } = await import('../src/services/voice.js');
const wav = readFileSync(new URL('./fixtures/voice_sos.wav', import.meta.url));
let srv;
let base;
before(async () => {
  srv = await start({ port: 0, loops: false });
  base = `http://127.0.0.1:${srv.server.address().port}/api`;
});
after(() => srv.close());

test('WAV is decoded to 16 kHz mono samples', () => {
  const a = wavToFloat32(wav);
  assert.ok(a.length > 16000 * 5 && a.length < 16000 * 10);
  assert.throws(() => wavToFloat32(Buffer.from('not audio at all, definitely not a wav file header')), /WAV/);
});

test('misheard Chennai place names are corrected', () => {
  assert.equal(correctPlaceNames('trapped in Velocere water rising').text, 'trapped in Velachery water rising');
  assert.equal(correctPlaceNames('near tambram station and adiyar bridge').text, 'near Tambaram station and Adyar bridge');
  assert.equal(correctPlaceNames('my father is injured in Saidapet').text, 'my father is injured in Saidapet');
  assert.equal(correctPlaceNames('the water is rising').fixes.length, 0);
});

test('voice endpoints reject bad input', async () => {
  const r = await fetch(`${base}/voice/transcribe`, { method: 'POST', headers: { 'content-type': 'audio/wav' }, body: Buffer.from('RIFF0000WAVEjunk') });
  assert.equal(r.status, 400);
  const g = await fetch(`${base}/gateway/voice`, { method: 'POST', headers: { 'content-type': 'audio/wav' }, body: wav });
  assert.equal(g.status, 400);
});

test('a spoken 2G voice call becomes a located, AI-triaged incident with an SMS reply (offline)', { skip: !voiceInfo().installed && 'voice model not installed' }, async () => {
  const res = await fetch(`${base}/gateway/voice?from=%2B919845001122&channel=voice&lang=en`, { method: 'POST', headers: { 'content-type': 'audio/wav' }, body: wav });
  const body = await res.json();
  assert.equal(res.status, 201, JSON.stringify(body));
  assert.match(body.transcript.text, /trapped/i);
  assert.match(body.transcript.text, /Velachery/);
  assert.equal(body.report.nlp.category, 'rescue');
  assert.equal(body.incident.locality, 'Velachery');
  assert.equal(body.reply.channel, 'sms'); // voice callers are answered by SMS
});
