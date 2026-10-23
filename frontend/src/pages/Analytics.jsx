import { BrainCircuit, Clock, Gauge, Loader2, RefreshCw, Timer, TrendingDown, Truck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ErrorText, Stat } from '../components/ui';
import { api, post } from '../lib/api';
import { CATEGORY, CHANNEL, DISASTER, RESOURCE, SEV } from '../lib/constants';

// Categorical slots validated for the dark surface (CVD-safe, ≥3:1 contrast)
const C = { blue: '#3987e5', orange: '#d95926', aqua: '#199e70', muted: '#475569' };
const AXIS = { stroke: '#475569', fontSize: 11, tickLine: false };
const TIP = { contentStyle: { background: '#141d31', border: '1px solid #2a3650', borderRadius: 8, fontSize: 12 }, cursor: { fill: 'rgba(148,163,184,.08)' } };

export default function Analytics() {
  const [d, setD] = useState(null);
  const [models, setModels] = useState(null);
  const [retrain, setRetrain] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = () => Promise.all([api('/analytics/summary').then(setD), api('/ml/models').then(setModels)]).catch(setError);
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const doRetrain = async () => {
    setBusy(true);
    setError(null);
    try {
      setRetrain(await post('/ml/retrain'));
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  if (!d) return <div className="grid h-full place-items-center text-slate-400"><Loader2 className="animate-spin" /></div>;

  const timeline = d.timeline.map((b) => ({ ...b, label: new Date(b.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }));
  const byType = Object.entries(d.byType).map(([k, v]) => ({ name: `${DISASTER[k]?.icon} ${DISASTER[k]?.label}`, value: v }));
  const sev = d.severityDistribution.map((s) => ({ name: SEV[s.severity].label, value: s.all, active: s.active, sev: s.severity }));
  const res = d.resources.byType.map((r) => ({ name: `${RESOURCE[r.type]?.icon} ${RESOURCE[r.type]?.label}`, Deployed: r.busy, Available: r.available, Offline: r.offline }));
  const cats = Object.entries(d.reports.byCategory).map(([k, v]) => ({ name: CATEGORY[k]?.label || k, value: v })).sort((a, b) => b.value - a.value);
  const channels = Object.entries(d.reports.byChannel).map(([k, v]) => ({ name: CHANNEL[k]?.label || k, value: v })).sort((a, b) => b.value - a.value);
  const fi = models?.severity?.feature_importance?.map((f) => ({ name: f.feature.replace(/_/g, ' '), value: +(f.importance * 100).toFixed(1) })) || [];
  const opt = d.lastOptimisation;
  const gain = opt?.baseline_avg_eta_min ? Math.round(((opt.baseline_avg_eta_min - opt.avg_eta_min) / opt.baseline_avg_eta_min) * 100) : null;

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-white">Reporting & Analytics</h1>
          <p className="text-sm text-slate-400">Live operational metrics · times are simulated minutes (×{d.response.sim_speed})</p>
        </div>
        <button className="btn-secondary" onClick={load}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Total incidents" value={d.totals.incidents} sub={`${d.totals.active} active · ${d.totals.resolved} resolved`} icon={Gauge} accent={C.blue} />
        <Stat label="Dispatch delay" value={fmtMin(d.response.avg_dispatch_delay_min)} sub="report → first unit sent" icon={Timer} accent={C.orange} />
        <Stat label="Avg travel time" value={fmtMin(d.response.avg_travel_min)} sub="dispatch → on scene" icon={Clock} accent={C.aqua} />
        <Stat label="Avg resolution" value={fmtMin(d.response.avg_resolution_min)} sub="report → resolved" icon={Clock} accent={C.blue} />
        <Stat label="Fleet utilisation" value={`${d.resources.utilisation_pct}%`} sub={`${d.resources.busy}/${d.resources.total} units busy`} icon={Truck} accent={C.orange} />
        <Stat label="Optimiser vs FCFS" value={gain != null ? `${gain > 0 ? '−' : ''}${Math.abs(gain)}%` : '—'} sub={opt ? `ETA ${opt.avg_eta_min}m vs ${opt.baseline_avg_eta_min}m` : 'run the optimiser'} icon={TrendingDown} accent={C.aqua} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Activity — last 15 minutes (30 s buckets)" className="xl:col-span-2" table={timeline.slice(-8).map((t) => [t.label, t.reported, t.dispatched, t.resolved])} headers={['Time', 'Reported', 'Dispatched', 'Resolved']}>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={timeline} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
              <CartesianGrid stroke="#1e293b" vertical={false} />
              <XAxis dataKey="label" {...AXIS} interval={4} />
              <YAxis {...AXIS} allowDecimals={false} axisLine={false} />
              <Tooltip {...TIP} cursor={{ stroke: '#475569' }} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#cbd5e1' }} />
              <Line type="monotone" dataKey="reported" name="Incidents reported" stroke={C.blue} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="dispatched" name="Units dispatched" stroke={C.orange} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="resolved" name="Incidents resolved" stroke={C.aqua} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Severity distribution (AI-predicted)">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={sev} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="#1e293b" vertical={false} />
              <XAxis dataKey="name" {...AXIS} />
              <YAxis {...AXIS} allowDecimals={false} axisLine={false} />
              <Tooltip {...TIP} formatter={(v, _n, p) => [`${v} total · ${p.payload.active} active`, 'Incidents']} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={36}>
                {sev.map((s) => <Cell key={s.sev} fill={SEV[s.sev].color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Resource deployment by type" className="xl:col-span-2">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={res} layout="vertical" margin={{ top: 4, right: 16, left: 30, bottom: 0 }} barCategoryGap={6}>
              <CartesianGrid stroke="#1e293b" horizontal={false} />
              <XAxis type="number" {...AXIS} allowDecimals={false} />
              <YAxis type="category" dataKey="name" {...AXIS} width={140} axisLine={false} />
              <Tooltip {...TIP} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Deployed" stackId="a" fill={C.orange} stroke="#0b1120" strokeWidth={2} />
              <Bar dataKey="Available" stackId="a" fill={C.aqua} stroke="#0b1120" strokeWidth={2} />
              <Bar dataKey="Offline" stackId="a" fill={C.muted} stroke="#0b1120" strokeWidth={2} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Incidents by disaster type">
          <HBar data={byType} color={C.blue} />
        </Card>

        <Card title="Reports by NLP category (MongoDB)">
          <HBar data={cats} color={C.blue} />
          <div className="mt-2 text-xs text-slate-500">
            {d.reports.total} reports · {Object.entries(d.reports.byChannel).map(([k, v]) => `${v} ${k}`).join(' · ')}
          </div>
        </Card>

        <Card title="Intake by channel (incl. no-internet channels)">
          <HBar data={channels} color={C.blue} />
          <div className="mt-2 text-xs text-slate-500">
            SMS in/out: {d.totals.sms_in}/{d.totals.sms_out} · camps sheltering {d.totals.camp_occupancy.toLocaleString('en-IN')} of {d.totals.camp_capacity.toLocaleString('en-IN')}
          </div>
        </Card>

        <Card title="Severity model — feature importance">
          <HBar data={fi} color={C.blue} unit="%" />
        </Card>

        <div className="panel p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <BrainCircuit size={16} className="text-rose-400" /> AI feedback loop
          </div>
          <p className="mt-1 text-xs text-slate-400">
            When responders close an incident they confirm the real severity. Those outcomes are sent to the ML engine and weighted 5× when the model is retrained.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-center">
            <Mini label="Model version" value={models?.online ? `v${models.severity.version}` : 'offline'} />
            <Mini label="Feedback samples" value={models?.feedback_samples ?? '—'} />
            <Mini label="Hold-out accuracy" value={models?.severity ? `${Math.round(models.severity.metrics.accuracy * 100)}%` : '—'} />
            <Mini label="Within ±1 level" value={models?.severity ? `${Math.round(models.severity.metrics.within_one_level * 100)}%` : '—'} />
            <Mini label="Field agreement" value={d.modelValidation.exact_pct != null ? `${d.modelValidation.exact_pct}%` : '—'} />
            <Mini label="NLP accuracy" value={models?.report_classifier ? `${Math.round(models.report_classifier.accuracy * 100)}%` : '—'} />
          </div>
          <button className="btn-primary mt-3 w-full" onClick={doRetrain} disabled={busy || !models?.online}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Retrain with field feedback
          </button>
          {retrain && (
            <div className="mt-2 rounded-lg bg-ink-850 p-2 text-xs text-slate-300">
              Model v{retrain.model_version}: accuracy {pct(retrain.before.accuracy)} → <b>{pct(retrain.after.accuracy)}</b>, trained with {retrain.after.feedback_samples} field outcomes.
            </div>
          )}
          <ErrorText error={error} />
        </div>
      </div>
    </div>
  );
}

const fmtMin = (v) => (v == null ? '—' : `${v}m`);
const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);
const Mini = ({ label, value }) => (
  <div className="rounded-lg bg-ink-850 px-2 py-2">
    <div className="font-mono text-base font-bold text-white">{value}</div>
    <div className="text-[10px] uppercase text-slate-500">{label}</div>
  </div>
);

function HBar({ data, color, unit = '' }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(90, data.length * 30 + 20)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" {...AXIS} width={120} axisLine={false} />
        <Tooltip {...TIP} formatter={(v) => [`${v}${unit}`, '']} />
        <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} maxBarSize={18} label={{ position: 'right', fill: '#94a3b8', fontSize: 11, formatter: (v) => `${v}${unit}` }} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function Card({ title, children, className = '', table, headers }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <div className={`panel p-4 ${className}`}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {table && (
          <button className="text-[11px] text-slate-400 hover:text-white" onClick={() => setShowTable((s) => !s)}>
            {showTable ? 'Chart' : 'Table'}
          </button>
        )}
      </div>
      {showTable ? (
        <table className="w-full text-left text-xs">
          <thead className="text-slate-500">
            <tr>{headers.map((h) => <th key={h} className="py-1">{h}</th>)}</tr>
          </thead>
          <tbody>
            {table.map((r) => (
              <tr key={r[0]} className="border-t border-ink-700">{r.map((c, i) => <td key={i} className="py-1 font-mono">{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      ) : (
        children
      )}
    </div>
  );
}
