// Central real-time store. Loads initial state over REST, then applies
// Socket.IO events so every page reflects the live situation instantly.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';

const LiveCtx = createContext(null);

const upsert = (list, item, max = 1000) => {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [item, ...list].slice(0, max);
  const copy = list.slice();
  copy[i] = { ...copy[i], ...item };
  return copy;
};

const EVENTS = [
  'connect', 'disconnect', 'incident:new', 'incident:update', 'resource:update', 'resource:move', 'dispatch:new', 'dispatch:update',
  'alert:new', 'report:new', 'zones:update', 'sensor:reading', 'simulation:update', 'scenario:update', 'optimizer:run',
  'sms:new', 'sms:update', 'camp:update', 'camps:tick', 'connectivity:update', 'weather:update', 'sync:update', 'feeds:update',
];

export function LiveDataProvider({ children, admin = true }) {
  const [incidents, setIncidents] = useState([]);
  const [resources, setResources] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [reports, setReports] = useState([]);
  const [zones, setZones] = useState([]);
  const [sensors, setSensors] = useState([]);
  const [camps, setCamps] = useState([]);
  const [sms, setSms] = useState([]);
  const [weather, setWeather] = useState(null);
  const [feeds, setFeeds] = useState(null);
  const [connectivity, setConnectivity] = useState(null);
  const [sim, setSim] = useState(null);
  const [health, setHealth] = useState(null);
  const [connected, setConnected] = useState(false);
  const [browserOnline, setBrowserOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [flash, setFlash] = useState(null);
  const loaded = useRef(false);

  const reload = useCallback(async () => {
    const safe = (p) => api(p).catch(() => null);
    const [inc, res, dis, al, rep, zo, se, si, he, ca, we, co, sm, fe] = await Promise.all([
      safe('/incidents'), safe('/resources'), safe('/allocation/dispatches'), safe('/alerts'), safe('/reports?limit=80'), safe('/zones'),
      safe('/sensors'), safe('/simulation'), safe('/health'), safe('/camps'), safe('/weather'), safe('/resilience/connectivity'),
      admin ? safe('/gateway/messages?limit=150') : null,
      safe('/feeds'),
    ]);
    if (Array.isArray(inc)) setIncidents(inc);
    if (Array.isArray(res)) setResources(res);
    if (Array.isArray(dis)) setDispatches(dis);
    if (Array.isArray(al)) setAlerts(al);
    if (Array.isArray(rep)) setReports(rep);
    if (Array.isArray(zo)) setZones(zo);
    if (Array.isArray(se)) setSensors(se);
    if (si) setSim(si);
    if (he) setHealth(he);
    if (Array.isArray(ca)) setCamps(ca);
    if (we) setWeather(we);
    if (fe) setFeeds(fe);
    if (co) setConnectivity(co);
    if (Array.isArray(sm)) setSms(sm);
    loaded.current = true;
  }, [admin]);

  useEffect(() => {
    reload().catch(console.error);
    const s = getSocket();
    const on = (ev, fn) => s.on(ev, fn);
    on('connect', () => {
      setConnected(true);
      if (loaded.current) reload().catch(() => {});
    });
    on('disconnect', () => setConnected(false));
    on('incident:new', (i) => setIncidents((l) => upsert(l, i)));
    on('incident:update', (i) => setIncidents((l) => upsert(l, i)));
    on('resource:update', (r) => setResources((l) => upsert(l, r)));
    on('resource:move', (r) => setResources((l) => l.map((x) => (x.id === r.id ? { ...x, lat: r.lat, lng: r.lng, progress: r.progress } : x))));
    on('dispatch:new', (d) => setDispatches((l) => upsert(l, d, 400)));
    on('dispatch:update', (d) => setDispatches((l) => upsert(l, d, 400)));
    on('alert:new', (a) => {
      setAlerts((l) => [a, ...l].slice(0, 200));
      if (a.level === 'critical') setFlash(a);
    });
    on('report:new', (r) => setReports((l) => [r, ...l].slice(0, 150)));
    on('zones:update', (z) => Array.isArray(z) && setZones(z));
    on('sensor:reading', (sr) => setSensors((l) => l.map((x) => (x.code === sr.code ? { ...x, ...sr } : x))));
    on('simulation:update', (x) => setSim((p) => ({ ...p, ...x })));
    on('scenario:update', (sc) => setSim((p) => ({ ...p, scenario: sc })));
    on('optimizer:run', (o) => setSim((p) => ({ ...p, lastOptimisation: o })));
    on('sms:new', (m) => setSms((l) => upsert(l, m, 300)));
    on('sms:update', (m) => setSms((l) => upsert(l, m, 300)));
    on('camp:update', (c) => setCamps((l) => upsert(l, { ...c, low_stock: (c.inventory || []).filter((i) => i.quantity < i.min_level).map((i) => i.item) })));
    on('camps:tick', () => api('/camps').then((c) => Array.isArray(c) && setCamps(c)).catch(() => {}));
    on('connectivity:update', (c) => setConnectivity((p) => ({ ...p, ...c })));
    on('weather:update', setWeather);
    on('feeds:update', setFeeds);
    on('sync:update', (st) => setConnectivity((p) => (p ? { ...p, sync: st } : p)));
    const t = setInterval(() => {
      api('/health').then(setHealth).catch(() => setHealth(null));
      api('/resilience/connectivity').then(setConnectivity).catch(() => {});
    }, 10000);
    const online = () => setBrowserOnline(true);
    const offline = () => setBrowserOnline(false);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      clearInterval(t);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      EVENTS.forEach((e) => s.off(e));
    };
  }, [reload]);

  const value = useMemo(
    () => ({ incidents, resources, dispatches, alerts, reports, zones, sensors, camps, sms, weather, feeds, connectivity, sim, setSim, health, connected, browserOnline, flash, setFlash, reload }),
    [incidents, resources, dispatches, alerts, reports, zones, sensors, camps, sms, weather, feeds, connectivity, sim, health, connected, browserOnline, flash, reload],
  );
  return <LiveCtx.Provider value={value}>{children}</LiveCtx.Provider>;
}

export const useLive = () => useContext(LiveCtx);

/**
 * Overall connectivity level for the badge:
 *  online   – server reachable and server has internet
 *  lan      – server reachable over LAN, no internet (core features keep working)
 *  offline  – this device cannot reach the server (outbox queues updates)
 * The live socket to the server is the source of truth. The browser's own online/offline flag is ignored,
 * because it says "offline" whenever Wi-Fi is off, even when the server is on this machine.
 */
export function connectionLevel({ connected, connectivity }) {
  if (!connected) return 'offline';
  if (connectivity && !connectivity.internetAvailable) return 'lan';
  return 'online';
}
