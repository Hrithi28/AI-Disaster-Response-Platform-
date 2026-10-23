import { Antenna, Bell, Cloud, CloudOff, Loader2, MessageSquareText, Radio, RefreshCw, Satellite, Server, Wifi } from 'lucide-react';
import { useEffect, useState } from 'react';
import ConnectivityBadge from '../components/ConnectivityBadge';
import { ErrorText } from '../components/ui';
import { connectionLevel, useLive } from '../context/LiveData';
import { api, post } from '../lib/api';
import { enablePush, pushSupported } from '../lib/push';

const LADDER = [
  { key: 'internet', icon: Cloud, title: 'Internet available', how: 'Full mode: plus live weather (Open-Meteo), live USGS / GDACS disaster feeds, Twilio SMS, push notifications and cloud sync to state HQ.' },
  { key: 'lan', icon: Wifi, title: 'No internet, local Wi-Fi / LAN works', how: 'Control-room server, both databases and the AI engine run on one machine. Field phones join the local Wi-Fi; Socket.IO live updates continue. Full OpenStreetMap street map and road routing are stored on the server.' },
  { key: 'sms', icon: MessageSquareText, title: 'Only 2G / SMS works', how: 'Citizens text the helpline; an Android phone or GSM modem on the LAN feeds SMS into the same AI pipeline. Replies and unit assignments go out by SMS; responders answer ARRIVED / DONE.' },
  { key: 'mesh', icon: Antenna, title: 'No mobile network at all', how: 'LoRa mesh radios on boats and in camps relay short messages over 5–10 km; police / ham radio operators type reports into the console. Field apps queue updates on the phone (store-and-forward).' },
  { key: 'sat', icon: Satellite, title: 'Everything down locally', how: 'A satellite terminal at the control room links it to state HQ. Every edge node keeps an outbox and syncs automatically once any link returns.' },
];

const MATRIX = [
  ['Incident intake (web SOS, field app)', true, true],
  ['SMS & LoRa intake with AI triage', true, true],
  ['AI severity, NLP, anomaly detection', true, true],
  ['Priority queue & Hungarian optimiser', true, true],
  ['Live dashboard & field sync (Socket.IO)', true, true],
  ['Relief camps, inventory, evacuation planner', true, true],
  ['Road routing on the real street network', true, true],
  ['Full street map (OpenStreetMap)', true, true],
  ['Street-name location from SMS', true, true],
  ['Weather feed (Open-Meteo)', 'Live', 'Last cached / scenario'],
  ['Global disaster feeds (USGS, GDACS)', 'Live', 'Last cached'],
  ['Push notifications', true, 'SMS instead'],
  ['Sync to state HQ cloud', true, 'Queued, auto-sent later'],
];

export default function Resilience() {
  const live = useLive();
  const { connectivity, health, sms } = live;
  const level = connectionLevel(live);
  const [lan, setLan] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [mapInfo, setMapInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    api('/resilience/lan?path=/field').then(setLan).catch(() => {});
    api('/sync/nodes').then(setNodes).catch(() => {});
    api('/map/info').then(setMapInfo).catch(() => {});
  }, []);

  const drill = async (on) => {
    setBusy(true);
    setError(null);
    try {
      await post('/resilience/connectivity', { forcedOffline: on });
      setMsg(on ? 'Internet outage simulated: cloud features paused, everything else keeps running on the LAN.' : 'Internet restored: queued sync and SMS are being sent.');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const pushNow = async () => {
    setBusy(true);
    try {
      const r = await post('/sync/push');
      setMsg(r.pushed != null ? `Pushed ${r.pushed} record(s) to the cloud.` : `Sync: ${r.skipped || r.error}`);
      setNodes(await api('/sync/nodes'));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const push = async () => {
    try {
      await enablePush();
      await post('/push/test');
      setMsg('Push notifications enabled on this device (test sent; arrives only when the server has internet).');
    } catch (e) {
      setError(e);
    }
  };

  const recent = (ch) => sms.filter((m) => m.channel === ch && m.direction === 'in').length;
  const active = level === 'online' ? 'internet' : level === 'lan' ? 'lan' : 'mesh';
  const sync = connectivity?.sync;

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto max-w-3xl">
          <h1 className="text-xl font-bold text-white">Offline & Resilience</h1>
          <p className="text-sm text-slate-400">
            Disasters knock out the internet first. DRP is <b className="text-slate-200">local-first</b>: it runs on a laptop or small server in the control room and degrades step by step instead of
            failing. Use the drill switch to show this live.
          </p>
        </div>
        <ConnectivityBadge />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <section className={`panel p-5 xl:col-span-2 ${connectivity?.forcedOffline ? 'border-amber-500/60' : ''}`}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-amber-500/15 text-amber-300">{connectivity?.forcedOffline ? <CloudOff /> : <Cloud />}</div>
            <div className="mr-auto">
              <div className="font-semibold text-white">Internet outage drill</div>
              <div className="text-xs text-slate-400">
                Server internet: <b>{connectivity?.internet ? 'reachable' : 'not reachable'}</b>
                {connectivity?.latencyMs ? ` (${connectivity.latencyMs} ms)` : ''} · mode <b className="font-mono">{connectivity?.mode}</b>
              </div>
            </div>
            {connectivity?.forcedOffline ? (
              <button className="btn-success" disabled={busy} onClick={() => drill(false)}>
                <Cloud size={15} /> Restore internet
              </button>
            ) : (
              <button className="btn-primary" disabled={busy} onClick={() => drill(true)}>
                <CloudOff size={15} /> Simulate internet outage
              </button>
            )}
          </div>
          {msg && <div className="mt-3 rounded-lg bg-ink-850 px-3 py-2 text-sm text-slate-200">{msg}</div>}
          <div className="mt-3">
            <ErrorText error={error} />
          </div>

          <h3 className="label mt-5">Connectivity fallback ladder</h3>
          <div className="space-y-2">
            {LADDER.map((l) => {
              const on = l.key === active;
              return (
                <div key={l.key} className={`flex gap-3 rounded-lg border p-3 ${on ? 'border-emerald-500/60 bg-emerald-500/5' : 'border-ink-700'}`}>
                  <l.icon size={20} className={on ? 'text-emerald-300' : 'text-slate-500'} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-sm font-semibold text-white">
                      {l.title}
                      {on && <span className="chip bg-emerald-500/20 text-emerald-300">current</span>}
                      {l.key === 'sms' && <span className="chip bg-ink-700 text-slate-300">{recent('sms')} SMS received</span>}
                      {l.key === 'mesh' && <span className="chip bg-ink-700 text-slate-300">{recent('lora') + recent('radio')} relayed</span>}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-400">{l.how}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="space-y-4">
          <section className="panel p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Server size={16} className="text-sky-400" /> Join field devices over local Wi-Fi
            </h3>
            <p className="mt-1 text-xs text-slate-400">Phones on the control-room Wi-Fi scan this to open the field app. No internet needed.</p>
            {lan ? (
              <>
                <div className="mx-auto mt-3 w-44 rounded-lg bg-white p-2" dangerouslySetInnerHTML={{ __html: lan.qr_svg }} />
                <div className="mt-2 break-all text-center font-mono text-xs text-sky-300">{lan.target}</div>
                <div className="mt-1 text-center text-[11px] text-slate-500">{health?.clients ?? 0} device(s) connected live</div>
              </>
            ) : (
              <Loader2 className="mx-auto mt-4 animate-spin text-slate-500" />
            )}
          </section>

          {mapInfo?.road_graph && (
            <section className="panel p-5">
              <h3 className="text-sm font-semibold text-white">🗺️ Offline street map & routing</h3>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <Mini label="Intersections" value={(mapInfo.road_graph.nodes / 1000).toFixed(0) + 'k'} />
                <Mini label="Road links" value={(mapInfo.road_graph.directed_edges / 1000).toFixed(0) + 'k'} />
                <Mini label="Street names" value={(mapInfo.street_names / 1000).toFixed(1) + 'k'} />
              </div>
              <p className="mt-2 text-xs text-slate-400">Real Chennai roads from OpenStreetMap, stored on this server: map tiles, A* routing that avoids flood zones, and street-name lookup for SMS. {mapInfo.attribution}</p>
            </section>
          )}

          <section className="panel p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <RefreshCw size={16} className="text-violet-400" /> Store-and-forward cloud sync
            </h3>
            <div className="mt-2 grid grid-cols-2 gap-2 text-center">
              <Mini label="Queued changes" value={sync?.pending ?? '—'} />
              <Mini label="Sent so far" value={sync?.pushed ?? 0} />
            </div>
            <div className="mt-2 text-xs text-slate-400">
              Node <b className="text-slate-200">{sync?.node_id}</b> ({sync?.role}) → {sync?.cloud_url || <i>no cloud configured (set CLOUD_SYNC_URL)</i>}
              <br />
              Last push: {sync?.lastPushAt ? new Date(sync.lastPushAt).toLocaleTimeString() : 'never'}
              {sync?.lastError && <span className="text-amber-300"> · {sync.lastError}</span>}
            </div>
            <button className="btn-secondary mt-3 w-full" onClick={pushNow} disabled={busy}>
              <RefreshCw size={14} /> Sync now
            </button>
            {nodes.length > 0 && (
              <div className="mt-3 space-y-1 text-xs">
                <div className="label">Nodes reporting to this server (state HQ view)</div>
                {nodes.map((n) => (
                  <div key={n.node_id} className="flex justify-between rounded bg-ink-850 px-2 py-1">
                    <span className="font-mono">{n.node_id}</span>
                    <span>
                      {n.active_incidents} active · {n.dispatches} dispatches
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Bell size={16} className="text-rose-400" /> This device
            </h3>
            <ul className="mt-2 space-y-1 text-xs text-slate-400">
              <li>• Installable app (PWA) that opens without network once loaded</li>
              <li>• Viewed map tiles are cached for offline use</li>
              <li>• Field updates queue on the phone and sync later</li>
            </ul>
            <button className="btn-secondary mt-3 w-full" onClick={push} disabled={!pushSupported()}>
              <Radio size={14} /> Enable push notifications
            </button>
          </section>
        </div>
      </div>

      <section className="panel mt-4 overflow-x-auto p-5">
        <h3 className="mb-2 text-sm font-semibold text-white">What keeps working without internet</h3>
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-[11px] uppercase text-slate-500">
            <tr>
              <th className="py-1">Capability</th>
              <th className="py-1">With internet</th>
              <th className="py-1">LAN-only / offline</th>
            </tr>
          </thead>
          <tbody>
            {MATRIX.map(([cap, a, b]) => (
              <tr key={cap} className="border-t border-ink-700">
                <td className="py-1.5 text-slate-200">{cap}</td>
                <td className="py-1.5">{cellv(a)}</td>
                <td className="py-1.5">{cellv(b)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

const cellv = (v) => (v === true ? <span className="text-emerald-300">✓ Works</span> : <span className="text-amber-200">{v}</span>);
const Mini = ({ label, value }) => (
  <div className="rounded-lg bg-ink-850 px-2 py-2">
    <div className="font-mono text-lg font-bold text-white">{value}</div>
    <div className="text-[10px] uppercase text-slate-500">{label}</div>
  </div>
);
