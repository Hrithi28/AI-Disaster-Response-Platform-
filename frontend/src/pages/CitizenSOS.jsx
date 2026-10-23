import { CheckCircle2, Loader2, LocateFixed, Phone, Siren, Truck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import MapView from '../components/MapView';
import VoiceButton from '../components/VoiceButton';
import { CategoryChip, ErrorText } from '../components/ui';
import { api, post } from '../lib/api';
import { DISASTER, LOCALITIES } from '../lib/constants';
import { peopleFromSpeech, speak } from '../lib/voice';

const STEPS = { open: 1, assigned: 2, in_progress: 3, resolved: 4 };

/** Public Citizen SOS page — works without an account. */
export default function CitizenSOS() {
  const [form, setForm] = useState({ name: '', phone: '', text: '', people: 1, disaster_type: 'flood' });
  const [loc, setLoc] = useState({ lat: LOCALITIES[0].lat, lng: LOCALITIES[0].lng, label: LOCALITIES[0].name });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [track, setTrack] = useState(null);
  const [heard, setHeard] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const locate = () => {
    if (!navigator.geolocation) return setError(new Error('Geolocation not supported on this device'));
    navigator.geolocation.getCurrentPosition(
      (p) => setLoc({ lat: +p.coords.latitude.toFixed(5), lng: +p.coords.longitude.toFixed(5), label: 'My current location' }),
      () => setError(new Error('Location permission denied — choose your area or tap the map instead')),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const submit = async (e, override = {}) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    const f = { ...form, ...override };
    try {
      const r = await post('/reports/sos', {
        text: f.text,
        lat: override.lat ?? loc.lat,
        lng: override.lng ?? loc.lng,
        people: Number(f.people) || 1,
        name: form.name || undefined,
        phone: form.phone || undefined,
        disaster_type: form.disaster_type,
      });
      setResult(r);
      if (override.voiceLang) {
        // answer a spoken SOS out loud as well
        const cat = String(r.report?.nlp?.category || 'help').replace('_', ' ');
        speak(
          override.voiceLang === 'ta'
            ? 'உங்கள் அவசர செய்தி பெறப்பட்டது. உதவி அனுப்பப்படுகிறது.'
            : `Your SOS has been received. Category ${cat}. ${r.incident ? 'A rescue team is being assigned.' : 'A coordinator will review it.'} Stay where you are and stay safe.`,
          override.voiceLang,
        );
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const incidentId = result?.incident?.id;
  useEffect(() => {
    if (!incidentId) return;
    const poll = () => api(`/reports/track/${incidentId}`).then(setTrack).catch(() => {});
    poll();
    const t = setInterval(poll, 4000);
    return () => clearInterval(t);
  }, [incidentId]);

  return (
    <div className="min-h-full bg-gradient-to-b from-rose-950/60 to-ink-950">
      <div className="mx-auto max-w-xl p-4 sm:p-6">
        <header className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-rose-600 text-white">
            <Siren size={22} />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-extrabold text-white">Emergency SOS</h1>
            <p className="text-xs text-rose-200/70">Chennai disaster response · no login required</p>
          </div>
          <Link to="/login" className="text-xs text-slate-400 hover:text-white">
            Staff login →
          </Link>
        </header>

        <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          <Phone size={14} className="shrink-0" />
          <span>
            In immediate danger to life, also call <b>112</b> (national emergency) or <b>1070</b> (TN disaster helpline).
          </span>
        </div>

        {!result ? (
          <form onSubmit={submit} className="panel mt-4 space-y-4 p-5">
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
              <div className="mb-2 text-sm font-semibold text-white">Can't type? Just speak.</div>
              <VoiceButton
                label="Speak your emergency"
                hint="Say what is happening, how many people, and your area. It is sent automatically — no internet needed."
                onTranscript={(t, lang) => {
                  if (!t.text || t.text.length < 3) return setError(new Error('Nothing was heard — please try again, a little louder.'));
                  const ppl = peopleFromSpeech(t.text);
                  const override = { text: t.text, ...(ppl ? { people: ppl } : {}), voiceLang: lang };
                  // an area named in the message wins over the default pick (not over GPS / a map pin)
                  const said = LOCALITIES.find((l) => t.text.toLowerCase().includes(l.name.toLowerCase()) || (l.ta && t.text.includes(l.ta.slice(0, -1))));
                  if (said && LOCALITIES.some((l) => l.name === loc.label)) {
                    Object.assign(override, { lat: said.lat, lng: said.lng });
                    setLoc({ lat: said.lat, lng: said.lng, label: said.name });
                  }
                  setForm((f) => ({ ...f, text: t.text, ...(ppl ? { people: ppl } : {}) }));
                  setHeard(t);
                  submit(null, override);
                }}
              />
              {heard && (
                <div className="mt-2 text-xs text-slate-300">
                  Heard: “{heard.text}”
                  {heard.fixes?.length > 0 && <span className="text-slate-500"> (place: {heard.fixes.map((f) => f.place).join(', ')})</span>}
                </div>
              )}
            </div>
            <div>
              <label className="label">What is happening?</label>
              <textarea
                className="input min-h-[110px] text-base"
                value={form.text}
                onChange={set('text')}
                required
                minLength={5}
                placeholder="e.g. 6 of us including 2 children are stuck on the first floor, water is rising"
              />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {['We are trapped, water rising fast', 'Someone is injured and needs an ambulance', 'No food or drinking water for 2 days', 'Our house is damaged, need shelter'].map((t) => (
                  <button type="button" key={t} className="chip cursor-pointer bg-ink-700 text-slate-300 hover:bg-ink-600" onClick={() => setForm((f) => ({ ...f, text: t }))}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">People with you</label>
                <input type="number" min="1" className="input" value={form.people} onChange={set('people')} />
              </div>
              <div>
                <label className="label">Type</label>
                <select className="input" value={form.disaster_type} onChange={set('disaster_type')}>
                  {Object.entries(DISASTER).map(([k, v]) => (
                    <option key={k} value={k}>{v.icon} {v.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Name (optional)</label>
                <input className="input" value={form.name} onChange={set('name')} />
              </div>
              <div>
                <label className="label">Phone (optional)</label>
                <input className="input" value={form.phone} onChange={set('phone')} inputMode="tel" />
              </div>
            </div>
            <div>
              <label className="label">Your location — {loc.label}</label>
              <div className="flex gap-2">
                <select
                  className="input"
                  value={LOCALITIES.some((l) => l.name === loc.label) ? loc.label : ''}
                  onChange={(e) => {
                    const l = LOCALITIES.find((x) => x.name === e.target.value);
                    if (l) setLoc({ lat: l.lat, lng: l.lng, label: l.name });
                  }}
                >
                  <option value="" disabled>
                    Custom point
                  </option>
                  {LOCALITIES.map((l) => (
                    <option key={l.name}>{l.name}</option>
                  ))}
                </select>
                <button type="button" className="btn-secondary shrink-0" onClick={locate}>
                  <LocateFixed size={15} /> GPS
                </button>
              </div>
              <div className="mt-2 h-44 overflow-hidden rounded-lg border border-ink-700">
                <MapView key={`${loc.lat}-${loc.lng}`} center={[loc.lat, loc.lng]} zoom={13} pick={loc} onMapClick={(p) => setLoc({ ...p, label: 'Pinned on map' })} layers={{}} />
              </div>
              <div className="mt-1 text-[11px] text-slate-500">Tap the map to pin your exact spot.</div>
            </div>
            <ErrorText error={error} />
            <button className="btn w-full bg-rose-600 !py-4 text-lg font-extrabold text-white hover:bg-rose-500" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Siren />} SEND SOS
            </button>
          </form>
        ) : (
          <div className="panel mt-4 space-y-4 p-5">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="text-emerald-400" size={28} />
              <div>
                <div className="text-lg font-bold text-white">SOS received</div>
                <div className="text-xs text-slate-400">Reference #{result.report.id.slice(-6).toUpperCase()}</div>
              </div>
            </div>
            {heard && (
              <div className="rounded-lg border border-ink-700 p-3 text-sm text-slate-300">
                <div className="label">Your voice message</div>“{heard.text}”
              </div>
            )}
            <div className="rounded-lg bg-ink-850 p-3 text-sm">
              <div className="label">AI triage</div>
              <div className="flex flex-wrap items-center gap-2">
                <CategoryChip category={result.report.nlp.category} />
                <span className="chip bg-rose-500/15 text-rose-300">urgency {result.report.nlp.urgency_label}</span>
                {result.incident && <span className="text-slate-400">{result.merged ? 'Linked to an existing incident' : 'New incident opened'} #{result.incident.id}</span>}
              </div>
            </div>
            {track && (
              <div>
                <div className="label">Live status</div>
                <ol className="mt-2 space-y-2">
                  {[
                    ['Reported to control room', 1],
                    [`Rescue units assigned${track.units_assigned ? ` (${track.units_assigned} en route / on scene)` : ''}`, 2],
                    ['Responders on scene', 3],
                    ['Resolved', 4],
                  ].map(([label, step]) => {
                    const done = STEPS[track.status] >= step;
                    return (
                      <li key={step} className={`flex items-center gap-3 text-sm ${done ? 'text-white' : 'text-slate-500'}`}>
                        <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${done ? 'bg-emerald-500 text-white' : 'bg-ink-700'}`}>{done ? '✓' : step}</span>
                        {label}
                      </li>
                    );
                  })}
                </ol>
                {track.best_eta_min != null && track.status === 'assigned' && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg bg-sky-500/10 px-3 py-2 text-sm text-sky-200">
                    <Truck size={16} /> Nearest unit planned ETA ≈ {Math.round(track.best_eta_min)} min (simulated time)
                  </div>
                )}
              </div>
            )}
            {!result.incident && <p className="text-sm text-slate-400">Your message was logged. A coordinator will review it.</p>}
            <button className="btn-secondary w-full" onClick={() => { setResult(null); setTrack(null); setHeard(null); setForm((f) => ({ ...f, text: '' })); }}>
              Send another SOS
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
