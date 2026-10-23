import { CheckCircle2, MapPin, Navigation, Send, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, post } from '../lib/api';
import { DISASTER, RESOURCE, SEV, fmt, timeAgo } from '../lib/constants';
import { Bar, ErrorText, SeverityBadge, StatusChip } from './ui';

const FEATURE_LABELS = {
  rainfall_mm: ['Rainfall', 'mm'],
  wind_kmph: ['Wind', 'km/h'],
  magnitude: ['Magnitude', 'M'],
  water_level_m: ['Water level', 'm'],
  population_density: ['Pop. density', '/km²'],
  affected_people: ['Affected', ''],
  injured: ['Injured', ''],
  infrastructure_damage: ['Infra damage', ''],
  report_count: ['Reports', ''],
};

export default function IncidentDetail({ incident, onClose }) {
  const [detail, setDetail] = useState(null);
  const [nearest, setNearest] = useState([]);
  const [explain, setExplain] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actual, setActual] = useState(incident.severity);

  const load = () =>
    Promise.all([api(`/incidents/${incident.id}`), api(`/allocation/nearest/${incident.id}`), api(`/incidents/${incident.id}/explain`).catch(() => null)])
      .then(([d, n, e]) => {
        setDetail(d);
        setNearest(n);
        setExplain(e);
      })
      .catch(setError);

  useEffect(() => {
    load();
    setActual(incident.severity);
  }, [incident.id, incident.updated_at, incident.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const dispatch = async (resourceId) => {
    setBusy(true);
    setError(null);
    try {
      await post('/allocation/dispatch', { incident_id: incident.id, resource_id: resourceId });
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const resolve = async () => {
    setBusy(true);
    try {
      await post(`/incidents/${incident.id}/resolve`, { actual_severity: Number(actual) });
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const d = detail || incident;
  const probs = d.probabilities ? Object.entries(d.probabilities) : [];
  const outstanding = detail?.outstanding || {};
  const neededTypes = Object.keys(outstanding);
  const suggestions = nearest.filter((r) => !neededTypes.length || neededTypes.includes(r.type)).slice(0, 6);

  return (
    <div className="panel !bg-ink-900 flex h-full w-full flex-col overflow-hidden shadow-2xl">
      <div className="flex items-start gap-3 border-b border-ink-700 p-4">
        <div className="text-2xl">{DISASTER[d.disaster_type]?.icon}</div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Incident #{d.id} · {d.source} · {timeAgo(d.created_at)}
          </div>
          <h2 className="font-semibold leading-snug text-white">{d.title}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <SeverityBadge level={d.severity} score={d.severity_score} size="lg" />
            <StatusChip status={d.status} />
            <span className="chip bg-ink-700 text-slate-300">
              <MapPin size={11} /> {d.locality}
            </span>
          </div>
        </div>
        <button className="btn-ghost !p-1" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4 text-sm">
        {d.description && <p className="rounded-lg bg-ink-850 p-3 text-slate-300">“{d.description}”</p>}

        <section>
          <h4 className="label">AI severity assessment</h4>
          <div className="flex items-center gap-4">
            <Gauge score={d.severity_score} color={SEV[d.severity]?.color} />
            <div className="flex-1 space-y-1.5">
              {probs.length ? (
                probs.map(([label, p]) => (
                  <div key={label} className="flex items-center gap-2 text-xs">
                    <span className="w-16 text-slate-400">{label}</span>
                    <Bar value={p} color={Object.values(SEV).find((s) => s.label === label)?.color} />
                    <span className="w-10 text-right font-mono text-slate-300">{Math.round(p * 100)}%</span>
                  </div>
                ))
              ) : (
                <div className="text-xs text-amber-300">Rule-based fallback score (AI engine offline)</div>
              )}
              <div className="pt-1 text-[11px] text-slate-500">
                Gradient-boosting model v{d.model_version ?? '—'} · confidence {d.confidence ? `${Math.round(d.confidence * 100)}%` : '—'}
                {d.actual_severity && <> · field-confirmed: <b className="text-slate-300">{d.actual_severity}</b></>}
              </div>
            </div>
          </div>
        </section>

        {explain?.contributions?.length > 0 && (
          <section>
            <h4 className="label">Why this score? (explainable AI)</h4>
            <div className="space-y-1">
              {explain.contributions.slice(0, 5).map((c) => (
                <div key={c.feature} className="flex items-center gap-2 text-xs">
                  <span className="w-28 truncate text-slate-400">{c.label || c.feature.replace(/_/g, ' ')}</span>
                  <div className="relative h-1.5 flex-1 rounded-full bg-ink-700">
                    <div className="absolute h-full rounded-full" style={{ width: `${Math.min(100, Math.abs(c.contribution) * 2.5)}%`, background: c.contribution >= 0 ? '#f97316' : '#22c55e' }} />
                  </div>
                  <span className="w-12 text-right font-mono text-slate-300">{c.contribution > 0 ? '+' : ''}{c.contribution}</span>
                </div>
              ))}
            </div>
            <div className="mt-1 text-[10px] text-slate-500">Points each factor adds to the 0–100 score ({explain.method}).</div>
          </section>
        )}

        <section>
          <h4 className="label">Model inputs</h4>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(FEATURE_LABELS)
              .filter(([k]) => d.features?.[k] !== undefined && !(d.features[k] === 0 && ['magnitude', 'wind_kmph', 'water_level_m'].includes(k)))
              .map(([k, [label, unit]]) => (
                <div key={k} className="rounded-lg bg-ink-850 px-2.5 py-1.5">
                  <div className="text-[10px] uppercase text-slate-500">{label}</div>
                  <div className="font-mono text-sm text-slate-100">
                    {k === 'infrastructure_damage' ? `${Math.round(d.features[k] * 100)}%` : fmt(d.features[k])}
                    <span className="text-[10px] text-slate-500"> {unit}</span>
                  </div>
                </div>
              ))}
          </div>
          {d.needs?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="text-xs text-slate-500">NLP-detected needs:</span>
              {d.needs.map((n) => (
                <span key={n} className="chip bg-sky-500/15 text-sky-300">{n.replace('_', ' ')}</span>
              ))}
            </div>
          )}
        </section>

        {detail?.requirements && (
          <section>
            <h4 className="label">Resource requirement</h4>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(detail.requirements).map(([t, n]) => {
                const missing = outstanding[t] || 0;
                return (
                  <span key={t} className={`chip ${missing ? 'bg-rose-500/15 text-rose-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
                    {RESOURCE[t]?.icon} {n - missing}/{n} {RESOURCE[t]?.label}
                  </span>
                );
              })}
              {!Object.keys(detail.requirements).length && <span className="text-xs text-slate-500">No units required</span>}
            </div>
          </section>
        )}

        {detail?.dispatches?.length > 0 && (
          <section>
            <h4 className="label">Dispatched units</h4>
            <div className="space-y-1.5">
              {detail.dispatches.map((x) => (
                <div key={x.id} className="flex items-center gap-2 rounded-lg bg-ink-850 px-3 py-2">
                  <span>{RESOURCE[x.resource_type]?.icon}</span>
                  <span className="flex-1 truncate">{x.resource_name}</span>
                  <span className="font-mono text-xs text-slate-400" title={x.route_engine || ''}>{x.distance_km} km · ETA {Math.round(x.eta_min)}m</span>
                  <span className="chip bg-ink-700 text-slate-300">{x.status.replace('_', ' ')}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {d.status !== 'resolved' && (
          <section>
            <h4 className="label flex items-center gap-1">
              <Navigation size={12} /> Nearest available units {neededTypes.length ? '(matching needs)' : ''}
            </h4>
            <div className="space-y-1.5">
              {suggestions.map((r) => (
                <div key={r.id} className="flex items-center gap-2 rounded-lg border border-ink-700 px-3 py-2">
                  <span>{RESOURCE[r.type]?.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{r.name}</div>
                    <div className="truncate text-[11px] text-slate-500">{r.base_name}</div>
                  </div>
                  <span className="font-mono text-xs text-slate-300">{r.etaMin}m</span>
                  <button className="btn-secondary !px-2 !py-1 text-xs" disabled={busy} onClick={() => dispatch(r.id)}>
                    <Send size={12} /> Send
                  </button>
                </div>
              ))}
              {!suggestions.length && <div className="text-xs text-slate-500">No matching units available right now.</div>}
            </div>
          </section>
        )}
        <ErrorText error={error} />
      </div>

      {d.status !== 'resolved' && (
        <div className="flex items-center gap-2 border-t border-ink-700 p-3">
          <Users size={14} className="text-slate-500" />
          <span className="text-xs text-slate-400">Field-confirmed severity</span>
          <select className="input !w-20 !py-1" value={actual} onChange={(e) => setActual(e.target.value)}>
            {[1, 2, 3, 4, 5].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button className="btn-success ml-auto" disabled={busy} onClick={resolve}>
            <CheckCircle2 size={16} /> Resolve
          </button>
        </div>
      )}
    </div>
  );
}

function Gauge({ score = 0, color = '#f59e0b' }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <svg width="78" height="78" viewBox="0 0 78 78" className="shrink-0">
      <circle cx="39" cy="39" r={r} stroke="#1e293b" strokeWidth="8" fill="none" />
      <circle cx="39" cy="39" r={r} stroke={color} strokeWidth="8" fill="none" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 39 39)" />
      <text x="39" y="44" textAnchor="middle" className="fill-white font-mono text-[18px] font-bold">
        {Math.round(score)}
      </text>
    </svg>
  );
}
