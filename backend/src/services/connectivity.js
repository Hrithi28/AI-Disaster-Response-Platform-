// Connectivity monitor. The platform is "local-first": everything runs on the
// control-room server and keeps working on the LAN without internet. This
// service tells the rest of the system which cloud-dependent features
// (live weather, OSRM routing, Twilio, web push, cloud sync) can be used.
import os from 'node:os';
import { config } from '../config.js';
import { emit } from './realtime.js';

export const connectivity = {
  internet: false,
  forcedOffline: false, // "Simulate internet outage" switch for demos / drills
  lastChecked: null,
  latencyMs: null,
  checks: 0,
};

export const internetAvailable = () => connectivity.internet && !connectivity.forcedOffline;

export function mode() {
  return internetAvailable() ? 'online' : 'lan-only';
}

export async function checkInternet() {
  const started = Date.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 3500);
  const before = internetAvailable();
  try {
    const res = await fetch(config.connectivityUrl, { method: 'HEAD', signal: ctrl.signal });
    connectivity.internet = res.status < 500;
    connectivity.latencyMs = Date.now() - started;
  } catch {
    connectivity.internet = false;
    connectivity.latencyMs = null;
  } finally {
    clearTimeout(t);
  }
  connectivity.lastChecked = new Date().toISOString();
  connectivity.checks++;
  if (before !== internetAvailable()) emit('connectivity:update', status());
  return connectivity;
}

export function setForcedOffline(v) {
  connectivity.forcedOffline = Boolean(v);
  emit('connectivity:update', status());
  return status();
}

export function lanAddresses(port = config.port) {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) out.push({ interface: name, address: a.address, url: `http://${a.address}:${port}` });
    }
  }
  return out;
}

export function status() {
  return { ...connectivity, mode: mode(), internetAvailable: internetAvailable() };
}
