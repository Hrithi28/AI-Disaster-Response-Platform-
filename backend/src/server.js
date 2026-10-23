// AI-Powered Disaster Response & Resource Allocation Platform — server entry
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { config } from './config.js';
import { flushStore, initMongo } from './db/mongo.js';
import { closePostgres, initPostgres } from './db/postgres.js';
import { seed } from './db/seed.js';
import { checkInternet, lanAddresses, status as connStatus } from './services/connectivity.js';
import { checkMl } from './services/ml.js';
import { initPush, registerPushObservers } from './services/push.js';
import { initRealtime } from './services/realtime.js';
import { refreshZones, startLoops, stopLoops } from './services/simulator.js';
import { registerSmsObservers, retryQueued } from './services/sms.js';
import { pushOnce, registerSyncObservers } from './services/sync.js';
import { refreshWeather } from './services/weather.js';
import { refreshFeeds } from './services/feeds.js';
import { routeSync } from './services/routing.js';
import { preloadVoice } from './services/voice.js';

export { buildApp };

/** Save everything cleanly when the window is closed or Ctrl+C is pressed. */
export function installShutdown(srv) {
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    console.log('\nSaving data and shutting down…');
    flushStore();
    closePostgres().finally(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'].forEach((sig) => process.on(sig, stop));
  return srv;
}

const timers = [];
const every = (ms, fn) => {
  const t = setInterval(() => fn().catch((e) => console.error('[loop]', e.message)), ms);
  t.unref();
  timers.push(t);
};

export async function start({ port = config.port, loops = true } = {}) {
  await initPostgres();
  await initMongo();
  // Give the ML engine time to finish training on a cold start (~45 s on real data, instant afterwards)
  for (let i = 0; i < (loops ? 90 : 1); i++) {
    if ((await checkMl()).online) break;
    if (i === 0) console.log('[ml] waiting for AI/ML engine…');
    await new Promise((r) => setTimeout(r, 1000));
  }
  registerSmsObservers();
  registerSyncObservers();
  registerPushObservers();
  initPush();
  if (loops) await checkInternet();
  routeSync({ lat: 13.08, lng: 80.27 }, { lat: 13.0, lng: 80.22 }); // load the OSM road graph up front
  await seed();
  const app = buildApp();
  const server = http.createServer(app);
  initRealtime(server);
  await refreshZones();
  if (loops) {
    startLoops(config.simIntervalMs);
    every(15000, checkMl);
    every(30000, checkInternet);
    every(15000, pushOnce);
    every(30000, retryQueued);
    every(config.weatherIntervalMs, refreshWeather);
    every(10 * 60 * 1000, refreshFeeds);
    refreshWeather().catch(() => {});
    refreshFeeds().catch(() => {});
    preloadVoice(); // offline speech recognition model (~1 s)
  }
  await new Promise((resolve) => server.listen(port, '0.0.0.0', resolve));
  const p = server.address().port;
  console.log(`\n🚨 DRP ${config.nodeRole.toUpperCase()} node "${config.nodeId}" running`);
  console.log(`   Local:     http://localhost:${p}`);
  for (const a of lanAddresses(p)) console.log(`   LAN:       ${a.url}   ← field devices on the same Wi-Fi`);
  console.log(`   API docs:  http://localhost:${p}/api/docs`);
  console.log(`   ML engine: ${config.mlUrl} (${(await checkMl()).online ? 'online' : 'OFFLINE → rule-based fallback'})`);
  console.log(`   Internet:  ${connStatus().internet ? 'available' : 'not available → LAN-only mode'}`);
  if (config.cloudSyncUrl) console.log(`   Cloud sync → ${config.cloudSyncUrl}`);
  console.log('');
  return {
    app,
    server,
    close: () => {
      stopLoops();
      timers.forEach(clearInterval);
      flushStore();
      return new Promise((r) => server.close(r)).then(() => closePostgres());
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  start()
    .then(installShutdown)
    .catch((e) => {
      console.error('Failed to start:', e);
      process.exit(1);
    });
}
