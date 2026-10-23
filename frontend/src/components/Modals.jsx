import { Cpu, Loader2, Plus, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { post } from '../lib/api';
import { DISASTER, LOCALITIES, RESOURCE } from '../lib/constants';
import { ErrorText, Modal, SeverityBadge } from './ui';

/** Optimisation Engine: preview (dry run) the Hungarian plan, then commit. */
export function OptimizerModal({ onClose }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const run = async (commit) => {
    setBusy(true);
    setError(null);
    try {
      const r = await post('/allocation/optimize', { commit });
      setResult(r);
      if (commit) setDone(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    run(false);
  }, []);

  const s = result?.summary;
  const gain = s && s.baseline_avg_eta_min ? Math.round(((s.baseline_avg_eta_min - s.avg_eta_min) / s.baseline_avg_eta_min) * 100) : null;

  return (
    <Modal title="Resource Optimisation Engine" onClose={onClose} wide>
      <p className="mb-4 text-sm text-slate-400">
        Builds a cost matrix of <b className="text-slate-200">priority-weighted ETA</b> for every (demand slot × available unit) pair per resource type and solves it
        with the <b className="text-slate-200">Hungarian algorithm</b>. When units are scarce, the least urgent slots are left waiting. Routes are planned with A* around
        other high-risk zones.
      </p>
      {busy && !result && (
        <div className="flex items-center gap-2 text-slate-400">
          <Loader2 className="animate-spin" size={16} /> Optimising…
        </div>
      )}
      {s && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Mini label="Incidents in queue" value={s.queue_size} />
            <Mini label="Assignments" value={s.assignments} />
            <Mini label="Unmet slots" value={s.unmet_slots} accent={s.unmet_slots ? '#f97316' : undefined} />
            <Mini label="Avg ETA (optimal)" value={`${s.avg_eta_min}m`} accent="#22c55e" />
            <Mini label="Avg ETA (FCFS nearest)" value={`${s.baseline_avg_eta_min}m`} sub={gain != null && gain > 0 ? `${gain}% faster with optimiser` : undefined} />
          </div>
          <div className="max-h-[40vh] overflow-auto rounded-lg border border-ink-700">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-ink-800 text-[11px] uppercase text-slate-400">
                <tr>
                  <th className="px-3 py-2">Incident</th>
                  <th className="px-3 py-2">Priority</th>
                  <th className="px-3 py-2">Unit</th>
                  <th className="px-3 py-2 text-right">Distance</th>
                  <th className="px-3 py-2 text-right">ETA</th>
                </tr>
              </thead>
              <tbody>
                {result.plan.map((p) => (
                  <tr key={`${p.incident_id}-${p.resource_id}`} className="border-t border-ink-700">
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <SeverityBadge level={p.severity} />
                        <span className="max-w-[260px] truncate">#{p.incident_id} {p.incident_title}</span>
                      </div>
                    </td>
                    <td className="px-3 py-1.5 font-mono">{p.priority.toFixed(0)}</td>
                    <td className="px-3 py-1.5">
                      {RESOURCE[p.resource_type]?.icon} {p.resource_name}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono">{p.distance_km} km{p.detour ? ' ↺' : ''}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{p.eta_min}m</td>
                  </tr>
                ))}
                {!result.plan.length && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                      Nothing to assign — every incident is covered or no matching units are free.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-[11px] text-slate-500">↺ = route detours around a hazard zone</div>
        </>
      )}
      <ErrorText error={error} />
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={() => run(false)} disabled={busy}>
          <Cpu size={15} /> Re-run preview
        </button>
        <button className="btn-primary" onClick={() => run(true)} disabled={busy || done || !result?.plan.length}>
          <Zap size={15} /> {done ? 'Dispatched ✓' : `Dispatch ${result?.plan.length || 0} units`}
        </button>
      </div>
    </Modal>
  );
}

const Mini = ({ label, value, sub, accent }) => (
  <div className="rounded-lg bg-ink-850 px-3 py-2">
    <div className="text-[10px] uppercase text-slate-500">{label}</div>
    <div className="font-mono text-lg font-bold" style={{ color: accent || '#fff' }}>
      {value}
    </div>
    {sub && <div className="text-[10px] text-emerald-400">{sub}</div>}
  </div>
);

/** Manual incident entry by the control room. Location can be clicked on the map. */
export function NewIncidentModal({ onClose, pick, onCreated }) {
  const [form, setForm] = useState({
    title: '',
    disaster_type: 'flood',
    locality: 'Velachery',
    affected_people: 150,
    injured: 3,
    water_level_m: 1.8,
    rainfall_mm: 180,
    infrastructure_damage: 0.4,
    needs: ['rescue'],
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'number' || e.target.type === 'range' ? Number(e.target.value) : e.target.value }));
  const loc = LOCALITIES.find((l) => l.name === form.locality);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const at = pick || loc;
      const inc = await post('/incidents', {
        title: form.title || undefined,
        disaster_type: form.disaster_type,
        lat: at.lat,
        lng: at.lng,
        locality: pick ? undefined : form.locality,
        affected_people: form.affected_people,
        injured: form.injured,
        needs: form.needs,
        features: { water_level_m: form.water_level_m, rainfall_mm: form.rainfall_mm, infrastructure_damage: form.infrastructure_damage },
      });
      onCreated?.(inc);
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const toggleNeed = (n) => setForm((f) => ({ ...f, needs: f.needs.includes(n) ? f.needs.filter((x) => x !== n) : [...f.needs, n] }));

  return (
    <Modal title="Log new incident" onClose={onClose}>
      <form className="space-y-3" onSubmit={submit}>
        <div>
          <label className="label">Title (optional)</label>
          <input className="input" value={form.title} onChange={set('title')} placeholder="Auto-generated if empty" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Disaster type</label>
            <select className="input" value={form.disaster_type} onChange={set('disaster_type')}>
              {Object.entries(DISASTER).map(([k, v]) => (
                <option key={k} value={k}>{v.icon} {v.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Location</label>
            {pick ? (
              <div className="input font-mono text-xs">📍 {pick.lat}, {pick.lng}</div>
            ) : (
              <select className="input" value={form.locality} onChange={set('locality')}>
                {LOCALITIES.map((l) => (
                  <option key={l.name}>{l.name}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="label">People affected</label>
            <input type="number" min="0" className="input" value={form.affected_people} onChange={set('affected_people')} />
          </div>
          <div>
            <label className="label">Injured</label>
            <input type="number" min="0" className="input" value={form.injured} onChange={set('injured')} />
          </div>
          <div>
            <label className="label">Water level (m)</label>
            <input type="number" step="0.1" min="0" className="input" value={form.water_level_m} onChange={set('water_level_m')} />
          </div>
          <div>
            <label className="label">Rainfall (mm)</label>
            <input type="number" min="0" className="input" value={form.rainfall_mm} onChange={set('rainfall_mm')} />
          </div>
        </div>
        <div>
          <label className="label">Infrastructure damage · {Math.round(form.infrastructure_damage * 100)}%</label>
          <input type="range" min="0" max="1" step="0.05" className="w-full accent-rose-500" value={form.infrastructure_damage} onChange={set('infrastructure_damage')} />
        </div>
        <div>
          <label className="label">Needs</label>
          <div className="flex flex-wrap gap-1.5">
            {['rescue', 'medical', 'firefighting', 'food_water', 'shelter'].map((n) => (
              <button type="button" key={n} onClick={() => toggleNeed(n)} className={`chip cursor-pointer ${form.needs.includes(n) ? 'bg-sky-500/25 text-sky-200' : 'bg-ink-700 text-slate-400'}`}>
                {n.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-slate-500">Tip: close this, click anywhere on the map, then press “New incident” to use that exact spot.</p>
        <ErrorText error={error} />
        <div className="flex justify-end">
          <button className="btn-primary" disabled={busy}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Create & score with AI
          </button>
        </div>
      </form>
    </Modal>
  );
}
