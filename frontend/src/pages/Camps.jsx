import { Loader2, Route, Siren, Tent } from 'lucide-react';
import { useState } from 'react';
import CampDetail from '../components/CampDetail';
import MapView from '../components/MapView';
import { Bar, ErrorText } from '../components/ui';
import { useLive } from '../context/LiveData';
import { api, post } from '../lib/api';

export default function Camps() {
  const { camps, zones, incidents, connectivity } = useLive();
  const [selected, setSelected] = useState(null);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  const runPlan = async () => {
    setBusy(true);
    setError(null);
    try {
      setPlan(await api('/evacuation/plan'));
      setDone(null);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const execute = async () => {
    if (!window.confirm('Issue the evacuation order? Camp capacity will be reserved and camps notified by SMS.')) return;
    setBusy(true);
    try {
      const r = await post('/evacuation/execute');
      setDone(r.moved);
      setPlan(await api('/evacuation/plan'));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const totalCap = camps.reduce((s, c) => s + c.capacity, 0);
  const totalOcc = camps.reduce((s, c) => s + c.occupancy, 0);

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <h1 className="text-xl font-bold text-white">Relief Camps & Evacuation</h1>
            <p className="text-sm text-slate-400">
              {camps.length} camps · {totalOcc.toLocaleString('en-IN')}/{totalCap.toLocaleString('en-IN')} people sheltered · stock is consumed per person per day, with automatic low-stock alerts.
            </p>
          </div>
          <button className="btn-primary" onClick={runPlan} disabled={busy}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Route size={15} />} Plan evacuation
          </button>
        </div>
        <ErrorText error={error} />

        {plan && (
          <section className="panel mt-4 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="mr-auto flex items-center gap-2 text-sm font-semibold text-white">
                <Siren size={16} className="text-rose-400" /> Evacuation plan · {plan.total_to_evacuate} people from {plan.zones.length} risk zone(s)
              </h3>
              {plan.total_unplaced > 0 && <span className="chip bg-rose-500/15 text-rose-300">{plan.total_unplaced} without a place – open more camps</span>}
              <span className="chip bg-ink-700 text-slate-300">{plan.camps_free_capacity} beds free</span>
              <button className="btn-primary !py-1 text-xs" disabled={busy || !plan.total_to_evacuate} onClick={execute}>
                Issue evacuation order
              </button>
            </div>
            {done != null && <div className="mt-2 rounded bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">Order issued: {done} people assigned to camps; camps notified by SMS.</div>}
            {!plan.zones.length && <p className="mt-2 text-sm text-slate-400">No high or critical risk zones right now. Trigger a scenario on the Command page to see the planner work.</p>}
            <div className="mt-3 space-y-3">
              {plan.zones.map((z) => (
                <div key={z.zone_id} className="rounded-lg border border-ink-700 p-3">
                  <div className="text-sm text-white">
                    <span className={`chip mr-2 ${z.risk_level === 'critical' ? 'bg-rose-500/20 text-rose-300' : 'bg-orange-500/20 text-orange-300'}`}>{z.risk_level}</span>
                    Zone {z.zone_id} · {z.affected.toLocaleString('en-IN')} affected → evacuate <b>{z.to_evacuate}</b>
                  </div>
                  <table className="mt-2 w-full text-left text-xs">
                    <tbody>
                      {z.allocations.map((a) => (
                        <tr key={a.camp_id} className="border-t border-ink-700">
                          <td className="py-1">⛺ {a.camp_name}</td>
                          <td className="py-1 text-right font-mono">{a.people} people</td>
                          <td className="py-1 text-right font-mono">{a.distance_km} km</td>
                          <td className="py-1 text-right text-slate-500">{a.engine}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
          {camps.map((c) => {
            const pct = c.capacity ? c.occupancy / c.capacity : 0;
            return (
              <button key={c.id} onClick={() => setSelected(c.id)} className={`panel p-3 text-left transition hover:border-ink-600 ${selected === c.id ? 'border-rose-500/60' : ''}`}>
                <div className="flex items-start gap-2">
                  <Tent size={16} className="mt-0.5 shrink-0 text-emerald-400" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-white">{c.name}</div>
                    <div className="text-[11px] text-slate-500">
                      {c.locality} · {c.status}
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className="font-mono text-slate-200">
                    {c.occupancy}/{c.capacity}
                  </span>
                  <Bar value={c.occupancy} max={c.capacity} color={pct >= 0.95 ? '#e11d48' : pct >= 0.75 ? '#f59e0b' : '#22c55e'} />
                </div>
                {c.low_stock?.length > 0 && <div className="mt-1 truncate text-[11px] text-orange-300">Low: {c.low_stock.join(', ')}</div>}
              </button>
            );
          })}
        </div>

        {selected && (
          <section className="panel mt-4 p-4">
            <CampDetail campId={selected} canAdmin />
          </section>
        )}
      </div>
      <div className="h-80 shrink-0 border-t border-ink-700 lg:h-auto lg:w-[42%] lg:border-l lg:border-t-0">
        <MapView
          camps={camps}
          zones={zones}
          incidents={incidents}
          evacuation={plan}
          onSelectCamp={(c) => setSelected(c.id)}
          forceOffline={connectivity?.forcedOffline}
          layers={{ incidents: true, resources: false, zones: true, routes: false, sensors: false, camps: true, resolved: false }}
        />
      </div>
    </div>
  );
}
