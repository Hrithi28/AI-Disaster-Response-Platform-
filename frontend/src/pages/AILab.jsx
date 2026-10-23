import { Activity, BrainCircuit, Loader2, MessageSquareText, Radar } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Bar, CategoryChip, ErrorText, SeverityBadge } from '../components/ui';
import { api, post } from '../lib/api';
import { CATEGORY, DISASTER, SEV } from '../lib/constants';

const SLIDERS = [
  ['rainfall_mm', 'Rainfall (mm/24h)', 0, 400, 5],
  ['water_level_m', 'Water level (m)', 0, 5, 0.1],
  ['wind_kmph', 'Wind speed (km/h)', 0, 250, 5],
  ['magnitude', 'Quake magnitude', 0, 9, 0.1],
  ['population_density', 'Population density (/km²)', 500, 30000, 500],
  ['affected_people', 'People affected', 0, 20000, 50],
  ['injured', 'Injured', 0, 500, 1],
  ['infrastructure_damage', 'Infrastructure damage (0–1)', 0, 1, 0.05],
  ['report_count', 'Independent reports', 1, 200, 1],
];

const EXAMPLES = [
  'URGENT 15 people trapped on rooftop in Velachery, water rising fast!!',
  'no drinking water for 2 days in Mudichur, 40 families need food',
  'huge tree fallen blocking the road at Adyar',
  'old man with chest pain stranded in Saidapet, need ambulance',
  'water level at Kotturpuram has started receding',
  'வேளச்சேரியில் 10 பேர் வெள்ளத்தில் சிக்கியுள்ளோம், உடனே உதவி தேவை',
  'சைதாப்பேட்டையில் 4 பேர் காயமடைந்துள்ளனர், ஆம்புலன்ஸ் தேவை',
];

/** Interactive playground for the three AI/ML models — useful for the viva. */
export default function AILab() {
  const [f, setF] = useState({ disaster_type: 'flood', rainfall_mm: 180, water_level_m: 1.8, wind_kmph: 20, magnitude: 0, population_density: 18000, affected_people: 800, injured: 6, infrastructure_damage: 0.4, report_count: 10 });
  const [pred, setPred] = useState(null);
  const [text, setText] = useState(EXAMPLES[0]);
  const [cls, setCls] = useState(null);
  const [sensor, setSensor] = useState({ sensor_type: 'water_level', value: 3.8, previous: 1.2 });
  const [anom, setAnom] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef();

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => post('/ml/predict', f).then(setPred).catch(setError), 150);
  }, [f]);

  const classify = async () => {
    setLoading(true);
    try {
      setCls(await post('/ml/classify', { text }));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    classify();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6">
      <h1 className="text-xl font-bold text-white">AI Lab</h1>
      <p className="text-sm text-slate-400">Try the models behind the platform. Every number here comes from the live Python ML engine (FastAPI + scikit-learn).</p>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {/* Severity predictor */}
        <section className="panel p-5">
          <h2 className="flex items-center gap-2 font-semibold text-white">
            <BrainCircuit size={18} className="text-rose-400" /> Disaster severity prediction
          </h2>
          <p className="mt-1 text-xs text-slate-400">Gradient-boosting classifier over 10 features → severity level 1–5, class probabilities and a 0–100 priority score.</p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {Object.entries(DISASTER).map(([k, v]) => (
              <button key={k} onClick={() => setF((x) => ({ ...x, disaster_type: k }))} className={`chip cursor-pointer !px-3 !py-1 ${f.disaster_type === k ? 'bg-rose-600 text-white' : 'bg-ink-700 text-slate-300'}`}>
                {v.icon} {v.label}
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {SLIDERS.map(([k, label, min, max, step]) => (
              <div key={k}>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">{label}</span>
                  <span className="font-mono text-slate-200">{f[k]}</span>
                </div>
                <input type="range" min={min} max={max} step={step} value={f[k]} className="w-full accent-rose-500" onChange={(e) => setF((x) => ({ ...x, [k]: Number(e.target.value) }))} />
              </div>
            ))}
          </div>
          {pred && (
            <div className="mt-4 rounded-xl border border-ink-700 bg-ink-850 p-4">
              <div className="flex items-center gap-3">
                <div className="font-mono text-4xl font-bold" style={{ color: SEV[pred.severity].color }}>
                  {pred.score}
                </div>
                <div>
                  <SeverityBadge level={pred.severity} size="lg" />
                  <div className="mt-1 text-xs text-slate-500">
                    {pred.fallback ? 'rule-based fallback (ML offline)' : `model v${pred.model_version} · confidence ${Math.round(pred.confidence * 100)}%`}
                  </div>
                </div>
              </div>
              {pred.explanation?.length > 0 && (
                <div className="mt-3 border-t border-ink-700 pt-3">
                  <div className="label">Why? Top drivers (explainable AI)</div>
                  {pred.explanation.map((c) => (
                    <div key={c.feature} className="flex items-center gap-2 text-xs">
                      <span className="w-36 truncate text-slate-400">{c.label}</span>
                      <Bar value={Math.max(0, c.contribution)} max={40} color="#f97316" />
                      <span className="w-12 text-right font-mono">{c.contribution > 0 ? '+' : ''}{c.contribution}</span>
                    </div>
                  ))}
                </div>
              )}
              {pred.probabilities && (
                <div className="mt-3 space-y-1">
                  {Object.entries(pred.probabilities).map(([l, p]) => (
                    <div key={l} className="flex items-center gap-2 text-xs">
                      <span className="w-16 text-slate-400">{l}</span>
                      <Bar value={p} color={Object.values(SEV).find((s) => s.label === l)?.color} />
                      <span className="w-10 text-right font-mono">{Math.round(p * 100)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <div className="space-y-4">
          {/* NLP classifier */}
          <section className="panel p-5">
            <h2 className="flex items-center gap-2 font-semibold text-white">
              <MessageSquareText size={18} className="text-sky-400" /> NLP report classification
            </h2>
            <p className="mt-1 text-xs text-slate-400">TF-IDF (word + character n-grams) + logistic regression → need category, urgency score, people count and location entities.</p>
            <textarea className="input mt-3 min-h-[80px]" value={text} onChange={(e) => setText(e.target.value)} />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {EXAMPLES.map((e) => (
                <button key={e} className="chip cursor-pointer bg-ink-700 text-slate-300 hover:bg-ink-600" onClick={() => setText(e)}>
                  {e.slice(0, 28)}…
                </button>
              ))}
            </div>
            <button className="btn-primary mt-3" onClick={classify} disabled={loading}>
              {loading && <Loader2 size={14} className="animate-spin" />} Classify
            </button>
            {cls && (
              <div className="mt-3 grid gap-3 rounded-xl border border-ink-700 bg-ink-850 p-4 text-sm sm:grid-cols-2">
                <div>
                  <div className="label">Top categories</div>
                  {cls.top3.map((t) => (
                    <div key={t.category} className="mb-1 flex items-center gap-2 text-xs">
                      <span className="w-24"><CategoryChip category={t.category} /></span>
                      <Bar value={t.p || 0} color={CATEGORY[t.category]?.color} />
                      <span className="w-10 text-right font-mono">{t.p != null ? `${Math.round(t.p * 100)}%` : ''}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-1 text-xs">
                  <div className="label">Extracted signals</div>
                  <div>Urgency: <b className={cls.urgency_label === 'high' ? 'text-rose-300' : 'text-amber-300'}>{cls.urgency_label}</b> <span className="font-mono text-slate-500">({cls.urgency})</span></div>
                  <div>People: <b>{cls.entities.people_count ?? '—'}</b></div>
                  <div>Locations: <b>{cls.entities.locations.join(', ') || '—'}</b></div>
                  <div>Urgent terms: <span className="text-slate-400">{cls.urgent_terms.join(', ') || '—'}</span></div>
                  <div>Language: <b>{cls.language === 'ta' ? 'Tamil' : 'English'}</b>{cls.translation && <span className="text-slate-500"> · offline gloss: “{cls.translation}”</span>}</div>
                  <div>Actionable: <b>{cls.actionable ? 'yes → creates/updates incident' : 'no (informational)'}</b></div>
                </div>
              </div>
            )}
          </section>

          <SensorLab sensor={sensor} setSensor={setSensor} anom={anom} setAnom={setAnom} setError={setError} />
        </div>
      </div>
      <div className="mt-4">
        <ErrorText error={error} />
      </div>
      <ModelComparison />
    </div>
  );
}

const SENSOR_DEFAULTS = { water_level: [3.8, 1.2, 'm'], rain_gauge: [38, 8, 'mm/hr'], wind: [95, 20, 'km/h'], seismic: [0.06, 0.01, 'g'] };

function SensorLab({ sensor, setSensor, anom, setAnom, setError }) {
  const run = async () => {
    try {
      setAnom(await post('/ml/anomaly', sensor));
    } catch (e) {
      setError(e);
    }
  };
  return (
    <section className="panel p-5">
      <h2 className="flex items-center gap-2 font-semibold text-white">
        <Radar size={18} className="text-amber-400" /> IoT sensor anomaly detection
      </h2>
      <p className="mt-1 text-xs text-slate-400">Isolation Forest per sensor type on (value, rate-of-change) — flags dangerous spikes in live feeds.</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <select
          className="input"
          value={sensor.sensor_type}
          onChange={(e) => {
            const [v, p] = SENSOR_DEFAULTS[e.target.value];
            setSensor({ sensor_type: e.target.value, value: v, previous: p });
          }}
        >
          {Object.keys(SENSOR_DEFAULTS).map((k) => (
            <option key={k} value={k}>{k.replace('_', ' ')}</option>
          ))}
        </select>
        <input className="input" type="number" step="any" value={sensor.value} onChange={(e) => setSensor((s) => ({ ...s, value: Number(e.target.value) }))} title="Current reading" />
        <input className="input" type="number" step="any" value={sensor.previous} onChange={(e) => setSensor((s) => ({ ...s, previous: Number(e.target.value) }))} title="Previous reading" />
      </div>
      <button className="btn-secondary mt-3" onClick={run}>
        <Activity size={14} /> Analyse reading
      </button>
      {anom && (
        <div className={`mt-3 rounded-lg border p-3 text-sm ${anom.anomaly ? 'border-rose-500/50 bg-rose-500/10 text-rose-200' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'}`}>
          <b>{anom.anomaly ? '⚠️ Anomaly detected' : '✓ Normal'}</b> — {anom.reason}
          {anom.z_score != null && <span className="ml-2 font-mono text-xs opacity-80">z={anom.z_score} · score={anom.anomaly_score}</span>}
        </div>
      )}
    </section>
  );
}

/** Evaluation table + confusion matrices comparing alternative models. */
function ModelComparison() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [which, setWhich] = useState('severity');
  const [sel, setSel] = useState(0);
  useEffect(() => {
    api('/ml/comparison').then(setData).catch(setErr);
  }, []);
  if (err) return <div className="mt-4 text-sm text-amber-300">Model comparison unavailable: {err.message}</div>;
  if (!data) return <div className="panel mt-4 flex items-center gap-2 p-5 text-sm text-slate-400"><Loader2 size={15} className="animate-spin" /> Training comparison models…</div>;
  const block = which === 'severity' ? data.severity : data.report_classifier;
  const labels = which === 'severity' ? block.labels : block.classes.map((c) => CATEGORY[c]?.label || c);
  const m = block.models[sel] || block.models[0];
  const cm = m.confusion_matrix;
  const rowMax = cm.map((r) => Math.max(1, r.reduce((a, b) => a + b, 0)));
  return (
    <section className="panel mt-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto font-semibold text-white">Model comparison</h2>
        {[['severity', 'Severity prediction'], ['nlp', 'Report classification']].map(([k, l]) => (
          <button key={k} onClick={() => { setWhich(k); setSel(0); }} className={`chip cursor-pointer !px-3 !py-1 ${which === k ? 'bg-rose-600 text-white' : 'bg-ink-700 text-slate-300'}`}>{l}</button>
        ))}
      </div>
      <p className="mt-1 text-xs text-slate-400">
        Same training/test split for every model · evaluated on <b className="text-slate-200">{block.dataset?.evaluated_on || `${block.test_samples} test samples`}</b>
        {which === 'nlp' && block.dataset?.real_dataset ? ` · trained on ${block.dataset.real_dataset} + ${block.dataset.synthetic_samples} English/Tamil examples` : ''}
      </p>
      <div className="mt-3 grid gap-4 xl:grid-cols-2">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] uppercase text-slate-500">
              <tr><th className="py-1">Model</th><th className="py-1 text-right">Accuracy</th><th className="py-1 text-right">Macro F1</th>{which === 'severity' && <th className="py-1 text-right">±1 level</th>}<th className="py-1 text-right">Train</th><th className="py-1 text-right">Latency</th></tr>
            </thead>
            <tbody>
              {block.models.map((x, i) => (
                <tr key={x.model} onClick={() => setSel(i)} className={`cursor-pointer border-t border-ink-700 ${i === sel ? 'bg-ink-800' : 'hover:bg-ink-850'}`}>
                  <td className="py-1.5">{x.model}</td>
                  <td className="py-1.5 text-right font-mono">{(x.accuracy * 100).toFixed(1)}%</td>
                  <td className="py-1.5 text-right font-mono">{(x.macro_f1 * 100).toFixed(1)}%</td>
                  {which === 'severity' && <td className="py-1.5 text-right font-mono">{(x.within_one_level * 100).toFixed(1)}%</td>}
                  <td className="py-1.5 text-right font-mono text-slate-400">{x.train_ms > 1000 ? `${(x.train_ms / 1000).toFixed(1)}s` : `${Math.round(x.train_ms)}ms`}</td>
                  <td className="py-1.5 text-right font-mono text-slate-400">{x.latency_ms.toFixed(2)}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-slate-500">Click a row to see its confusion matrix. {data.note}</p>
        </div>
        <div className="overflow-x-auto">
          <div className="label">Confusion matrix · {m.model} (rows = actual, columns = predicted)</div>
          <table className="text-center text-[11px]">
            <thead>
              <tr><th />{labels.map((l) => <th key={l} className="px-1 pb-1 font-medium text-slate-400">{l}</th>)}</tr>
            </thead>
            <tbody>
              {cm.map((row, i) => (
                <tr key={labels[i]}>
                  <th className="pr-2 text-right font-medium text-slate-400">{labels[i]}</th>
                  {row.map((v, j) => {
                    const a = v / rowMax[i];
                    return (
                      <td key={j} className="h-8 w-12 border border-ink-900 font-mono" style={{ background: i === j ? `rgba(57,135,229,${0.15 + a * 0.85})` : v ? `rgba(217,89,38,${0.15 + a * 0.85})` : '#0f172a', color: a > 0.5 ? '#fff' : '#cbd5e1' }} title={`${labels[i]} → ${labels[j]}: ${v}`}>
                        {v}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-1 text-[10px] text-slate-500">Blue diagonal = correct; orange = confusions.</div>
        </div>
      </div>
    </section>
  );
}
