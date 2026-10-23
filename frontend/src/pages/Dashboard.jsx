import { Activity, AlertTriangle, Clock, Cpu, Layers, Pause, Play, Plus, Siren, Truck, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import IncidentDetail from '../components/IncidentDetail';
import ConnectivityBadge from '../components/ConnectivityBadge';
import MapView from '../components/MapView';
import WeatherCard from '../components/WeatherCard';
import { NewIncidentModal, OptimizerModal } from '../components/Modals';
import { AlertsPanel, FeedPanel, GlobalFeedsPanel, QueuePanel } from '../components/SidePanels';
import { ErrorText, Stat } from '../components/ui';
import { useLive } from '../context/LiveData';
import { api, post } from '../lib/api';
import { DISASTER, RESOURCE, SEV, fmt } from '../lib/constants';

const TABS = [
  ['queue', 'Priority Queue'],
  ['feed', 'Live Reports'],
  ['alerts', 'Alerts'],
  ['global', 'Live feeds'],
];

export default function Dashboard() {
  const live = useLive();
  const { incidents, resources, dispatches, zones, sensors, reports, alerts, sim, setSim, camps, connectivity, feeds } = live;
  const [evacuation, setEvacuation] = useState(null);
  const [tileUrl, setTileUrl] = useState(null);
  useEffect(() => {
    api('/config').then((c) => setTileUrl(c.tileUrl)).catch(() => {});
  }, []);
  const toggleEvacuation = async () => {
    if (evacuation) return setEvacuation(null);
    try {
      setEvacuation(await api('/evacuation/plan'));
    } catch (e) {
      setError(e);
    }
  };
  const [tab, setTab] = useState('queue');
  const [selectedId, setSelectedId] = useState(null);
  const [showOpt, setShowOpt] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pick, setPick] = useState(null);
  const [error, setError] = useState(null);
  const [layers, setLayers] = useState({ incidents: true, resources: true, zones: true, routes: true, sensors: true, camps: true, resolved: false });
  const [showLayers, setShowLayers] = useState(false);
  const [basemap, setBasemap] = useState('streets');

  const selected = incidents.find((i) => i.id === selectedId);
  const active = useMemo(() => incidents.filter((i) => i.status !== 'resolved'), [incidents]);
  const critical = active.filter((i) => i.severity >= 4).length;
  const busy = resources.filter((r) => !['available', 'offline'].includes(r.status)).length;
  const enRoute = dispatches.filter((d) => d.status === 'en_route');
  const avgEta = enRoute.length ? (enRoute.reduce((s, d) => s + d.eta_min, 0) / enRoute.length).toFixed(1) : '—';
  const affected = active.reduce((s, i) => s + (i.affected_people || 0), 0);
  const unread = alerts.filter((a) => a.level !== 'info').slice(0, 99).length;

  const control = async (body) => {
    try {
      const r = await post('/simulation', body);
      setSim((p) => ({ ...p, ...r }));
    } catch (e) {
      setError(e);
    }
  };
  const scenario = async (type) => {
    if (!type) return;
    try {
      await post('/simulation/scenario', { type, intensity: 0.85 });
    } catch (e) {
      setError(e);
    }
  };
  const selectById = (id) => {
    setSelectedId(id);
  };

  return (
    <div className="flex h-full flex-col">
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-2 border-b border-ink-700 bg-ink-900/60 p-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Active incidents" value={active.length} sub={`${incidents.length - active.length} resolved`} icon={Activity} accent="#38bdf8" />
        <Stat label="Severe / critical" value={critical} sub="severity ≥ 4" icon={AlertTriangle} accent={SEV[5].color} />
        <Stat label="People affected" value={fmt(affected)} sub={`${fmt(active.reduce((s, i) => s + i.injured, 0))} injured`} icon={Users} accent="#c084fc" />
        <Stat label="Units deployed" value={`${busy}/${resources.length}`} sub={`${Math.round((busy / Math.max(1, resources.length)) * 100)}% utilisation`} icon={Truck} accent="#a3e635" />
        <Stat label="Avg ETA en route" value={avgEta === '—' ? '—' : `${avgEta}m`} sub={`${enRoute.length} units moving`} icon={Clock} accent="#f59e0b" />
        <Stat label="Risk zones" value={zones.length} sub={`${zones.filter((z) => z.risk_level === 'critical').length} critical`} icon={Siren} accent="#f97316" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-700 px-3 py-2">
        <div className="mr-2 min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Active scenario</div>
          <div className="truncate text-sm font-semibold text-white">
            {DISASTER[sim?.scenario?.type]?.icon} {sim?.scenario?.name}
            <span className="ml-2 font-mono text-xs text-slate-400">intensity {Math.round((sim?.scenario?.intensity || 0) * 100)}%</span>
          </div>
        </div>
        <ConnectivityBadge compact />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button className={evacuation ? 'btn-success' : 'btn-secondary'} onClick={toggleEvacuation} title="Show the evacuation plan: risk zones → nearest camps with free capacity">
            ⛺ {evacuation ? `Evacuation: ${evacuation.total_to_evacuate} people` : 'Evacuation plan'}
          </button>
          <button className="btn-primary" onClick={() => setShowOpt(true)}>
            <Cpu size={15} /> Run optimiser
          </button>
          <button className="btn-secondary" onClick={() => setShowNew(true)}>
            <Plus size={15} /> New incident
          </button>
          <select className="input !w-auto !py-2" value="" onChange={(e) => scenario(e.target.value)} title="Inject a scenario">
            <option value="">⚡ Trigger scenario…</option>
            <option value="cyclone">🌀 Cyclone landfall</option>
            <option value="flood">🌊 Flash flood</option>
            <option value="earthquake">🏚️ Earthquake</option>
            <option value="fire">🔥 Industrial fire</option>
            <option value="live">🌦️ Live weather (Open-Meteo)</option>
          </select>
          <button className="btn-secondary" onClick={() => control({ enabled: !sim?.enabled })} title="Pause / resume the live data simulator">
            {sim?.enabled ? <Pause size={15} /> : <Play size={15} />} {sim?.enabled ? 'Pause feeds' : 'Resume feeds'}
          </button>
          <select className="input !w-auto !py-2" value={sim?.speed || 30} onChange={(e) => control({ speed: Number(e.target.value) })} title="Simulation speed">
            {[10, 30, 60].map((s) => (
              <option key={s} value={s}>×{s} time</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-slate-400" title="Automatically dispatch units to severity ≥ 4 incidents">
            <input type="checkbox" className="accent-rose-500" checked={!!sim?.autoDispatch} onChange={(e) => control({ autoDispatch: e.target.checked })} />
            Auto-dispatch critical
          </label>
        </div>
      </div>
      {error && (
        <div className="px-3 pt-2" onClick={() => setError(null)}>
          <ErrorText error={error} />
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Map */}
        <div className="relative min-w-0 flex-1">
          <MapView
            incidents={incidents}
            resources={resources}
            zones={zones}
            dispatches={dispatches}
            sensors={sensors}
            selectedId={selectedId}
            onSelect={(i) => setSelectedId(i.id)}
            onMapClick={(p) => setPick(p)}
            pick={pick}
            layers={layers}
            flyTarget={selected}
            camps={camps}
            basemap={basemap}
            evacuation={evacuation}
            forceOffline={connectivity?.forcedOffline}
            tileUrl={tileUrl}
          />
          <div className="absolute bottom-3 left-3 z-[1000] flex flex-col items-start gap-2">
            <WeatherCard />
            {showLayers && (
              <div className="panel space-y-1 p-3 text-xs">
                <div className="label">Basemap</div>
                {[
                  ['streets', 'Offline street map (OSM, local)'],
                  ['live', 'Online tiles (needs internet)'],
                  ['schematic', 'Schematic (lightweight)'],
                ].map(([k, l]) => (
                  <label key={k} className="flex items-center gap-2">
                    <input type="radio" name="basemap" className="accent-rose-500" checked={basemap === k} onChange={() => setBasemap(k)} />
                    {l}
                  </label>
                ))}
                <div className="label pt-2">Layers</div>
                {Object.keys(layers).map((k) => (
                  <label key={k} className="flex items-center gap-2 capitalize">
                    <input type="checkbox" className="accent-rose-500" checked={layers[k]} onChange={(e) => setLayers((l) => ({ ...l, [k]: e.target.checked }))} />
                    {k === 'resolved' ? 'show resolved' : k}
                  </label>
                ))}
              </div>
            )}
            <div className="panel flex flex-wrap items-center gap-3 px-3 py-2 text-[11px] text-slate-300">
              <button className="btn-ghost !p-1" onClick={() => setShowLayers((s) => !s)} title="Layers">
                <Layers size={14} />
              </button>
              {[1, 2, 3, 4, 5].map((s) => (
                <span key={s} className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: SEV[s].color }} /> {SEV[s].label}
                </span>
              ))}
              <span className="hidden items-center gap-1 md:flex">
                {Object.values(RESOURCE).map((r) => r.icon).join(' ')} units
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rotate-45 bg-sky-500" /> sensor
              </span>
            </div>
          </div>
          {pick && (
            <div className="panel absolute left-3 top-3 z-[1000] flex items-center gap-2 px-3 py-2 text-xs">
              📍 <span className="font-mono">{pick.lat}, {pick.lng}</span>
              <button className="btn-secondary !px-2 !py-1 text-xs" onClick={() => setShowNew(true)}>
                Log incident here
              </button>
              <button className="text-slate-400 hover:text-white" onClick={() => setPick(null)}>
                ✕
              </button>
            </div>
          )}
          {selected && (
            <div className="absolute bottom-3 right-3 top-3 z-[1100] w-[min(420px,calc(100%-24px))]">
              <IncidentDetail incident={selected} onClose={() => setSelectedId(null)} />
            </div>
          )}
        </div>

        {/* Right panel */}
        <aside className="hidden w-[380px] shrink-0 flex-col border-l border-ink-700 bg-ink-900/70 lg:flex">
          <div className="flex border-b border-ink-700">
            {TABS.map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`flex-1 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide ${tab === k ? 'border-b-2 border-rose-500 text-white' : 'text-slate-500 hover:text-slate-300'}`}
              >
                {label}
                {k === 'alerts' && unread > 0 && <span className="ml-1 rounded-full bg-rose-600 px-1.5 text-[10px] text-white">{unread}</span>}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === 'queue' && <QueuePanel incidents={incidents} onSelect={(q) => setSelectedId(q.id)} selectedId={selectedId} />}
            {tab === 'feed' && <FeedPanel reports={reports} onSelectIncident={selectById} />}
            {tab === 'alerts' && <AlertsPanel alerts={alerts} onSelectIncident={selectById} />}
            {tab === 'global' && <GlobalFeedsPanel feeds={feeds} />}
          </div>
        </aside>
      </div>

      {showOpt && <OptimizerModal onClose={() => setShowOpt(false)} />}
      {showNew && (
        <NewIncidentModal
          pick={pick}
          onClose={() => setShowNew(false)}
          onCreated={(inc) => {
            setPick(null);
            setSelectedId(inc.id);
          }}
        />
      )}
    </div>
  );
}
