// Store-and-forward outbox for the field app.
// When there is no signal, updates ("arrived", "completed", field reports)
// are saved on the phone and sent automatically when the connection returns.
// Each operation carries a unique x-op-id so the server never applies it twice.
import { api } from './api';

const KEY = 'drp_outbox';
const listeners = new Set();
let forcedOffline = false; // "simulate no signal" switch for demos
let flushing = false;

const read = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
};
const write = (items) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage full / unavailable: keep in memory */
    memory = items;
  }
  listeners.forEach((fn) => fn(items));
};
let memory = null;
export const pending = () => memory || read();

export const subscribe = (fn) => {
  listeners.add(fn);
  fn(pending());
  return () => listeners.delete(fn);
};

export const setForcedOffline = (v) => {
  forcedOffline = v;
  listeners.forEach((fn) => fn(pending()));
  if (!v) flush();
};
export const isForcedOffline = () => forcedOffline;
// Only the demo switch forces offline mode. navigator.onLine is NOT used: with Wi-Fi switched off the
// browser reports "offline" even though the control-room server on this laptop (localhost / LAN) is
// reachable. Real unreachability is detected by the request itself failing (e.offline) and queued then.
export const isOffline = () => forcedOffline;

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `op-${Date.now()}-${Math.random().toString(16).slice(2)}`);

/**
 * Send now if possible, otherwise queue. Resolves with
 * { queued: true } or { queued: false, data }.
 */
export async function send({ method, path, body, label }) {
  const op = { id: newId(), method, path, body, label, createdAt: new Date().toISOString(), attempts: 0 };
  if (isOffline()) {
    write([...pending(), op]);
    return { queued: true, op };
  }
  try {
    const data = await api(path, { method, body, headers: { 'x-op-id': op.id } });
    return { queued: false, data };
  } catch (e) {
    if (!e.offline) throw e;
    write([...pending(), op]);
    return { queued: true, op };
  }
}

/** Replay queued operations in order. Stops at the first network failure. */
export async function flush() {
  if (flushing || isOffline()) return { sent: 0 };
  flushing = true;
  let sent = 0;
  const failed = [];
  try {
    for (const op of pending()) {
      try {
        await api(op.path, { method: op.method, body: op.body, headers: { 'x-op-id': op.id } });
        sent++;
        write(pending().filter((x) => x.id !== op.id));
      } catch (e) {
        if (e.offline) break; // still no signal: keep the rest
        failed.push({ ...op, error: e.message }); // rejected by server: drop but report
        write(pending().filter((x) => x.id !== op.id));
      }
    }
  } finally {
    flushing = false;
  }
  return { sent, failed };
}

export function startAutoFlush() {
  const tryFlush = () => flush().catch(() => {});
  window.addEventListener('online', tryFlush);
  const t = setInterval(tryFlush, 8000);
  return () => {
    window.removeEventListener('online', tryFlush);
    clearInterval(t);
  };
}
