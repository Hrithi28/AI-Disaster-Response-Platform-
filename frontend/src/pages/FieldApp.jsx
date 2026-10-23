import { ArrowLeft, Bell, CheckCircle2, Clock, CloudUpload, Loader2, LogOut, MapPin, Navigation, Radio, Send, SignalZero, Users, Volume2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import MapView from '../components/MapView';
import VoiceButton from '../components/VoiceButton';
import { CategoryChip, ErrorText, SeverityBadge, StatusChip } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useLive } from '../context/LiveData';
import { api } from '../lib/api';
import { flush, isOffline, send, setForcedOffline, startAutoFlush, subscribe } from '../lib/outbox';
import { enablePush, pushSupported } from '../lib/push';
import { DISASTER, RESOURCE, timeAgo } from '../lib/constants';
import { getSocket } from '../lib/socket';
import { peopleFromSpeech, severityFromSpeech, speak } from '../lib/voice';

/** Field Team Mobile App — designed for a phone held by a responder. */
export default function FieldApp() {
  const { user, logout } = useAuth();
  const { resources, dispatches, zones } = useLive();
  const isAdmin = user.role === 'admin';
  const [resourceId, setResourceId] = useState(user.resource_id || null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actual, setActual] = useState(3);
  const [note, setNote] = useState('');
  const [people, setPeople] = useState('');
  const [lastReport, setLastReport] = useState(null);
  const [queue, setQueue] = useState([]);
  const [noSignal, setNoSignal] = useState(false);
  const [toast, setToast] = useState(null);
  const [voiceLog, setVoiceLog] = useState(null);

  useEffect(() => subscribe(setQueue), []);
  useEffect(() => startAutoFlush(), []);
  const toggleSignal = () => {
    setNoSignal((v) => {
      setForcedOffline(!v);
      return !v;
    });
  };
  const syncNow = async () => {
    const r = await flush();
    if (r.sent) {
      setToast(`Synced ${r.sent} queued update(s) ✓`);
      setTimeout(() => setToast(null), 4000);
    }
  };

  useEffect(() => {
    if (isAdmin && !resourceId && resources.length) setResourceId(resources.find((r) => r.type === 'rescue_boat')?.id || resources[0].id);
  }, [isAdmin, resourceId, resources]);

  const load = useCallback(() => {
    if (!resourceId) return;
    const cacheKey = `drp_field_cache_${resourceId}`;
    if (isOffline()) {
      // no signal: show the last known assignment saved on the phone
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
        if (cached) setData((d) => d || cached);
      } catch {
        /* ignore */
      }
      return;
    }
    api(`/field/assignment${isAdmin ? `?resource_id=${resourceId}` : ''}`)
      .then((d) => {
        if (d?.offline) return;
        setData(d);
        if (d.current) setActual(d.current.severity);
        try {
          localStorage.setItem(cacheKey, JSON.stringify(d));
        } catch {
          /* ignore */
        }
      })
      .catch((e) => (e.offline ? null : setError(e)));
  }, [resourceId, isAdmin]);

  useEffect(load, [load]);
  // refresh when anything about this unit's dispatches changes
  const sig = dispatches.filter((d) => d.resource_id === resourceId).map((d) => `${d.id}:${d.status}`).join(',');
  useEffect(load, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const s = getSocket();
    const fn = (a) => {
      load();
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      const title = a?.title || a?.incident_title;
      speak(title ? `New assignment. ${title}.` : 'New assignment received. Check the field app.');
    };
    s.on('assignment', fn);
    return () => s.off('assignment', fn);
  }, [load]);

  const unit = resources.find((r) => r.id === resourceId) || data?.resource;
  const queuedFor = (status) => data?.current && queue.some((q) => q.path === `/allocation/dispatches/${data.current.id}` && q.body?.status === status);
  // apply queued (not yet synced) updates on top of the cached assignment
  const cur = queuedFor('completed') ? null : data?.current && queuedFor('on_scene') ? { ...data.current, status: 'on_scene' } : data?.current;

  const setStatus = async (status, sev = actual) => {
    setBusy(true);
    setError(null);
    try {
      const r = await send({
        method: 'PATCH',
        path: `/allocation/dispatches/${cur.id}`,
        body: { status, ...(status === 'completed' ? { actual_severity: Number(sev) } : {}) },
        label: status === 'on_scene' ? `Arrived at ${cur.locality}` : `Mission complete (severity ${sev})`,
      });
      if (r.queued) {
        // optimistic update: the responder keeps working, the server catches up later
        setData((d) => (status === 'on_scene' ? { ...d, current: { ...d.current, status: 'on_scene' } } : { ...d, current: null }));
        setToast('No signal — update saved on this phone and will sync automatically');
        setTimeout(() => setToast(null), 4000);
      } else load();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const sendReport = async (e, override) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    const text = override?.text ?? note;
    const ppl = override ? override.people : people;
    try {
      const at = cur ? { lat: cur.incident_lat, lng: cur.incident_lng } : { lat: unit.lat, lng: unit.lng };
      const r = await send({ method: 'POST', path: '/reports/field', body: { text, ...at, people: ppl ? Number(ppl) : undefined }, label: `Field report: ${text.slice(0, 40)}` });
      setLastReport(r.queued ? { queued: true } : r.data);
      setNote('');
      setPeople('');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  /** Hands-free: act on what the responder says. */
  const onVoice = async (t, lang) => {
    const text = (t.text || '').trim();
    if (text.length < 2) return setVoiceLog({ text: '(nothing heard)', action: 'Please try again' });
    const low = text.toLowerCase();
    const sev = severityFromSpeech(text);
    let action;
    if (cur && cur.status === 'en_route' && /\b(arrived|reached|on (the )?scene|at the (location|site|spot))\b|வந்துவிட்டோம்|வந்தோம்|அடைந்தோம்/.test(low)) {
      action = 'Marked: arrived on scene';
      await setStatus('on_scene');
    } else if (cur && /\b(mission (is )?(complete|completed|done|over)|task (complete|done)|all (clear|done)|(job|work) (is )?(done|finished)|we are done|completed)\b|முடிந்தது|முடித்தோம்/.test(low)) {
      const s2 = sev || actual;
      if (sev) setActual(sev);
      action = `Marked: mission complete (severity ${s2})`;
      await setStatus('completed', s2);
    } else {
      action = 'Sent as a field report to the control room';
      await sendReport(null, { text, people: peopleFromSpeech(text) });
    }
    setVoiceLog({ text, action, fixes: t.fixes });
    speak(lang === 'ta' ? 'சரி. பதிவு செய்யப்பட்டது.' : `${action}.`, lang);
  };

  const readAloud = () =>
    cur &&
    speak(
      `${cur.status === 'on_scene' ? 'On scene at' : 'Assignment:'} ${cur.title}, ${cur.locality}. ${cur.distance_km} kilometres, about ${Math.round(cur.eta_min)} minutes. ${cur.affected_people || 0} people affected.`,
    );

  const route = cur ? dispatches.filter((d) => d.id === cur.id).map((d) => ({ ...d, route: d.route || cur.route })) : [];
  const incidentPin = cur ? [{ id: cur.incident_id, lat: cur.incident_lat, lng: cur.incident_lng, severity: cur.severity, severity_score: cur.severity_score, status: cur.incident_status, title: cur.title, disaster_type: cur.disaster_type }] : [];

  return (
    <div className="min-h-screen bg-ink-950">
      <div className="mx-auto flex min-h-screen max-w-md flex-col border-x border-ink-800">
        <header className="sticky top-0 z-[1200] flex items-center gap-3 border-b border-ink-700 bg-ink-900 px-4 py-3">
          {isAdmin && (
            <Link to="/" className="btn-ghost !p-1">
              <ArrowLeft size={18} />
            </Link>
          )}
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-sky-600 text-lg">{RESOURCE[unit?.type]?.icon || <Radio size={18} />}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold text-white">{unit?.name || 'Field unit'}</div>
            <div className="truncate text-[11px] text-slate-400">{unit?.base_name}</div>
          </div>
          {unit && <StatusChip status={unit.status} kind="resource" />}
          {!isAdmin && (
            <button className="btn-ghost !p-1" onClick={logout} title="Log out">
              <LogOut size={16} />
            </button>
          )}
        </header>

        {isAdmin && (
          <div className="border-b border-ink-700 bg-amber-500/10 px-4 py-2 text-xs text-amber-200">
            Previewing as control room — pick a unit:
            <select className="input mt-1 !py-1" value={resourceId || ''} onChange={(e) => setResourceId(Number(e.target.value))}>
              {resources.map((r) => (
                <option key={r.id} value={r.id}>
                  {RESOURCE[r.type]?.icon} {r.name} · {r.status}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className={`flex items-center gap-2 border-b px-4 py-2 text-xs ${isOffline() || noSignal ? 'border-rose-500/40 bg-rose-500/10 text-rose-200' : 'border-ink-700 bg-ink-900/60 text-slate-400'}`}>
          {isOffline() || noSignal ? <SignalZero size={14} /> : <Radio size={14} className="text-emerald-400" />}
          <span className="mr-auto">{isOffline() || noSignal ? 'No signal – working offline' : 'Connected to control room'}</span>
          {queue.length > 0 && (
            <button className="chip cursor-pointer bg-amber-500/20 text-amber-200" onClick={syncNow} title="Send queued updates now">
              <CloudUpload size={11} /> {queue.length} queued
            </button>
          )}
          <button onClick={toggleSignal} className={`chip cursor-pointer ${noSignal ? 'bg-emerald-600 text-white' : 'bg-ink-700 text-slate-300'}`} title="Demo: pretend the phone has no signal">
            {noSignal ? 'Restore signal' : 'Simulate no signal'}
          </button>
          {pushSupported() && (
            <button className="btn-ghost !p-1" title="Enable push notifications" onClick={() => enablePush().then(() => setToast('Notifications enabled ✓')).catch((e) => setError(e))}>
              <Bell size={14} />
            </button>
          )}
        </div>
        {toast && <div className="mx-4 mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">{toast}</div>}
        {queue.length > 0 && (
          <div className="mx-4 mt-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
            <div className="mb-1 font-semibold text-amber-200">Waiting to sync (stored on this phone)</div>
            {queue.map((q) => (
              <div key={q.id} className="flex justify-between text-slate-300">
                <span className="truncate">{q.label || `${q.method} ${q.path}`}</span>
                <span className="text-slate-500">{timeAgo(q.createdAt)}</span>
              </div>
            ))}
          </div>
        )}

        <main className="flex-1 space-y-4 p-4">
          {cur ? (
            <section className="panel overflow-hidden">
              <div className={`px-4 py-2 text-xs font-bold uppercase tracking-wider ${cur.status === 'on_scene' ? 'bg-amber-500/20 text-amber-200' : 'bg-sky-500/20 text-sky-200'}`}>
                {cur.status === 'on_scene' ? '● On scene' : '● Active assignment — en route'}
              </div>
              <div className="h-52">
                <MapView
                  incidents={incidentPin}
                  resources={unit ? [unit] : []}
                  dispatches={route}
                  zones={zones}
                  center={[cur.incident_lat, cur.incident_lng]}
                  zoom={12}
                  layers={{ incidents: true, resources: true, zones: true, routes: true, sensors: false, resolved: true }}
                />
              </div>
              <div className="space-y-3 p-4">
                <div>
                  <div className="text-lg font-bold leading-snug text-white">
                    {DISASTER[cur.disaster_type]?.icon} {cur.title}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <SeverityBadge level={cur.severity} score={cur.severity_score} />
                    <span className="chip bg-ink-700 text-slate-300">
                      <MapPin size={11} /> {cur.locality}
                    </span>
                  </div>
                </div>
                {cur.description && <p className="text-sm text-slate-400">“{cur.description}”</p>}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Info icon={Navigation} label="Distance" value={`${cur.distance_km} km`} />
                  <Info icon={Clock} label="ETA" value={`${Math.round(cur.eta_min)} min`} />
                  <Info icon={Users} label="Affected" value={cur.affected_people} />
                </div>
                {cur.needs?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {cur.needs.map((n) => (
                      <span key={n} className="chip bg-sky-500/15 text-sky-300">{n.replace('_', ' ')}</span>
                    ))}
                  </div>
                )}
                <button type="button" className="btn-ghost w-full !py-1.5 text-xs" onClick={readAloud}>
                  <Volume2 size={14} /> Read assignment aloud
                </button>
                <a
                  className="btn-secondary w-full"
                  target="_blank"
                  rel="noreferrer"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${cur.incident_lat},${cur.incident_lng}`}
                >
                  <Navigation size={15} /> Open turn-by-turn navigation
                </a>
                {cur.status === 'en_route' ? (
                  <button className="btn-primary w-full !py-3 text-base" disabled={busy} onClick={() => setStatus('on_scene')}>
                    <MapPin size={18} /> Arrived on scene
                  </button>
                ) : (
                  <div className="space-y-2 rounded-lg border border-ink-700 p-3">
                    <label className="label">Field-confirmed severity (trains the AI)</label>
                    <div className="grid grid-cols-5 gap-1">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <button key={s} onClick={() => setActual(s)} className={`rounded-md py-2 font-mono font-bold ${Number(actual) === s ? 'bg-rose-600 text-white' : 'bg-ink-700 text-slate-300'}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                    <button className="btn-success w-full !py-3 text-base" disabled={busy} onClick={() => setStatus('completed')}>
                      <CheckCircle2 size={18} /> Mission complete
                    </button>
                  </div>
                )}
              </div>
            </section>
          ) : (
            <section className="panel p-6 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-500/15 text-emerald-300">
                <Radio size={26} />
              </div>
              <div className="mt-3 font-semibold text-white">Standing by</div>
              <p className="mt-1 text-sm text-slate-400">No active assignment. You'll be alerted here the moment the control room dispatches this unit.</p>
            </section>
          )}

          <section className="panel p-4">
            <h3 className="mb-1 text-sm font-semibold text-white">Voice command (hands-free)</h3>
            <p className="mb-2 text-xs text-slate-400">
              Say <b>“arrived”</b>, <b>“mission complete, severity 4”</b>, or describe the situation (“12 more people trapped in the next street, two injured”) to send a report.
            </p>
            <VoiceButton label="Tap to talk" compact onTranscript={onVoice} disabled={busy || !unit} />
            {voiceLog && (
              <div className="mt-2 rounded-lg bg-ink-850 p-2 text-xs">
                <div className="text-slate-300">Heard: “{voiceLog.text}”</div>
                <div className="mt-0.5 font-semibold text-emerald-300">→ {voiceLog.action}</div>
              </div>
            )}
          </section>

          <section className="panel p-4">
            <h3 className="mb-2 text-sm font-semibold text-white">Send field report</h3>
            <form className="space-y-2" onSubmit={sendReport}>
              <textarea className="input min-h-[80px]" placeholder="e.g. 12 more people trapped in the next street, two injured" value={note} onChange={(e) => setNote(e.target.value)} required minLength={5} />
              <div className="flex gap-2">
                <input className="input" type="number" min="1" placeholder="People (optional)" value={people} onChange={(e) => setPeople(e.target.value)} />
                <button className="btn-primary shrink-0" disabled={busy || !unit}>
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send
                </button>
              </div>
            </form>
            {lastReport?.queued && <div className="mt-3 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-200">Saved on this phone — it will be sent and analysed by the AI when signal returns.</div>}
            {lastReport && !lastReport.queued && (
              <div className="mt-3 rounded-lg bg-ink-850 p-3 text-xs">
                AI tagged as <CategoryChip category={lastReport.report.nlp.category} /> urgency <b>{lastReport.report.nlp.urgency_label}</b>
                {lastReport.incident && <> · {lastReport.merged ? 'merged into' : 'opened'} incident #{lastReport.incident.id}</>}
              </div>
            )}
          </section>
          <ErrorText error={error} />

          {data?.history?.length > 0 && (
            <section>
              <h3 className="label">Recent missions</h3>
              <div className="space-y-1.5">
                {data.history.map((h) => (
                  <div key={h.id} className="flex items-center gap-2 rounded-lg bg-ink-900 px-3 py-2 text-sm">
                    <span className="flex-1 truncate">{h.title}</span>
                    <span className="text-[11px] text-slate-500">{timeAgo(h.created_at)}</span>
                    <span className="chip bg-ink-700 text-slate-300">{h.status.replace('_', ' ')}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

const Info = ({ icon: Icon, label, value }) => (
  <div className="rounded-lg bg-ink-850 px-2 py-2">
    <Icon size={14} className="mx-auto text-slate-500" />
    <div className="mt-1 font-mono text-sm font-bold text-white">{value}</div>
    <div className="text-[10px] uppercase text-slate-500">{label}</div>
  </div>
);
