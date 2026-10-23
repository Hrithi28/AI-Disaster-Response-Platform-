import { Antenna, Loader2, MessageSquareText, Phone, Radio, Send, Smartphone } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import VoiceButton from '../components/VoiceButton';
import { ErrorText } from '../components/ui';
import { useLive } from '../context/LiveData';
import { api, post } from '../lib/api';
import { CHANNEL, LOCALITIES, timeAgo } from '../lib/constants';
import { postAudio, speak } from '../lib/voice';

const QUICK = [
  'SOS Velachery 6 people trapped water rising',
  'SOS 6 people trapped near Taramani Link Road',
  'help Saidapet old man injured need ambulance',
  'Mudichur no food no water 20 families',
  'வேளச்சேரியில் 10 பேர் வெள்ளத்தில் சிக்கியுள்ளோம், உதவி',
  'தாம்பரத்தில் குடிநீர் இல்லை, 30 குடும்பங்களுக்கு உணவு தேவை',
  'my mother is injured need help',
];
const RESPONDER_PHONE = '+919000000001';
const randomPhone = () => `+9198${Math.floor(10000000 + Math.random() * 89999999)}`;

/** SMS & mesh gateway console: the "no mobile data" channel. */
export default function Gateway() {
  const { sms } = useLive();
  const [info, setInfo] = useState(null);
  const [phone, setPhone] = useState(randomPhone);
  const [text, setText] = useState(QUICK[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('');
  const [mesh, setMesh] = useState({ from: 'lora-boat-07', channel: 'lora', text: '12 people on rooftop near the lake, need boat', locality: 'Velachery' });

  useEffect(() => {
    api('/gateway/info').then(setInfo).catch(() => {});
  }, []);

  const thread = useMemo(() => sms.filter((m) => m.phone === phone).sort((a, b) => a.id - b.id), [sms, phone]);
  const log = useMemo(() => sms.filter((m) => !filter || m.channel === filter).sort((a, b) => b.id - a.id), [sms, filter]);

  const sendSms = async (e) => {
    e?.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await post('/gateway/sms', { from: phone, body: text });
      setText('');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  // 2G voice call / voice note to the helpline: transcribed offline, then handled like an SMS
  const sendVoice = (channel, from) => async (wav, lang) => {
    setError(null);
    const r = await postAudio(`/gateway/voice?from=${encodeURIComponent(from)}&channel=${channel}&lang=${lang}`, wav);
    if (r.reply?.body) speak(r.reply.body.replace(/^DRP( Chennai)?:\s*/, ''), 'en');
  };

  const sendMesh = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const l = LOCALITIES.find((x) => x.name === mesh.locality);
      await post('/gateway/mesh', { from: mesh.from, channel: mesh.channel, text: mesh.text, ...(l ? { lat: l.lat + (Math.random() - 0.5) * 0.004, lng: l.lng + (Math.random() - 0.5) * 0.004 } : {}) });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-xl font-bold text-white">SMS & Mesh Gateway</h1>
          <p className="max-w-3xl text-sm text-slate-400">
            When mobile data fails, people can still send an <b>SMS on 2G</b>. Boats and relief camps can relay messages over <b>LoRa mesh radios</b> with no network at all. Every
            message goes through the same AI pipeline (classify → merge → prioritise → dispatch), and replies go back by SMS.
          </p>
        </div>
        {info && (
          <div className="panel px-4 py-2 text-xs">
            <div className="text-slate-400">Helpline</div>
            <div className="font-mono text-lg font-bold text-white">{info.helpline}</div>
            <div className="text-slate-500">
              Provider: <b className="text-slate-300">{info.provider}</b> {info.needsInternet ? '(needs internet)' : '(works without internet)'}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[380px_1fr]">
        {/* Phone simulator */}
        <div className="space-y-4">
          <section className="mx-auto w-full max-w-[380px] rounded-[2rem] border-4 border-ink-600 bg-ink-950 p-3 shadow-2xl">
            <div className="mb-2 flex items-center justify-between px-2 text-[10px] text-slate-500">
              <span>2G ▂▄▁ · no data</span>
              <span className="flex items-center gap-1">
                <Smartphone size={11} /> feature phone
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-ink-850 px-3 py-2">
              <Phone size={14} className="text-slate-500" />
              <input className="w-full bg-transparent font-mono text-sm text-white outline-none" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="Sender phone number" />
              <button className="text-[10px] text-sky-400" onClick={() => setPhone(randomPhone())}>
                new
              </button>
              <button className="text-[10px] text-amber-400" onClick={() => setPhone(RESPONDER_PHONE)} title="Rescue Boat 01's responder phone – try ARRIVED / DONE 4">
                responder
              </button>
            </div>
            <div className="mt-2 h-80 space-y-2 overflow-y-auto rounded-xl bg-[#0d1424] p-3">
              <div className="text-center text-[10px] text-slate-500">To: {info?.helpline || 'DRP helpline'}</div>
              {thread.map((m) => (
                <div key={m.id} className={`flex ${m.direction === 'in' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.direction === 'in' ? 'rounded-br-sm bg-sky-600 text-white' : 'rounded-bl-sm bg-ink-700 text-slate-100'}`}>
                    {m.body}
                    <div className="mt-0.5 text-[9px] opacity-70">
                      {timeAgo(m.created_at)} · {m.status}
                    </div>
                  </div>
                </div>
              ))}
              {!thread.length && <div className="pt-16 text-center text-xs text-slate-500">Type an SMS below, as a citizen with only 2G would.</div>}
            </div>
            <form onSubmit={sendSms} className="mt-2 flex gap-2">
              <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type SMS…" />
              <button className="btn-primary !px-3" disabled={busy}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              </button>
            </form>
            <div className="mt-2 rounded-xl border border-pink-500/30 bg-pink-500/5 p-2">
              <div className="mb-1 text-[11px] text-pink-200">📞 Or call the helpline and speak (voice calls work on 2G, no data)</div>
              <VoiceButton label="Voice call" compact onAudio={sendVoice('voice', phone)} />
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {(phone === RESPONDER_PHONE ? ['ARRIVED', 'DONE 4'] : QUICK).map((q) => (
                <button key={q} className="chip cursor-pointer bg-ink-800 text-slate-300 hover:bg-ink-700" onClick={() => setText(q)}>
                  {q.length > 30 ? `${q.slice(0, 30)}…` : q}
                </button>
              ))}
            </div>
          </section>

          <form onSubmit={sendMesh} className="panel space-y-2 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Antenna size={16} className="text-violet-400" /> LoRa mesh / radio relay
            </h3>
            <p className="text-xs text-slate-400">LoRa radios (e.g. Meshtastic) carry text 5–10 km with no network. A radio operator can also type in what they hear on police/ham radio. This form simulates a radio; with real Meshtastic radios, run <code>tools/mesh/meshtastic_bridge.py</code> and messages arrive here automatically.</p>
            <div className="grid grid-cols-2 gap-2">
              <select className="input" value={mesh.channel} onChange={(e) => setMesh({ ...mesh, channel: e.target.value })}>
                <option value="lora">LoRa mesh</option>
                <option value="radio">Radio relay</option>
              </select>
              <input className="input" value={mesh.from} onChange={(e) => setMesh({ ...mesh, from: e.target.value })} placeholder="Node / callsign" />
            </div>
            <select className="input" value={mesh.locality} onChange={(e) => setMesh({ ...mesh, locality: e.target.value })}>
              <option value="">No GPS (locality from text)</option>
              {LOCALITIES.map((l) => (
                <option key={l.name} value={l.name}>
                  GPS near {l.name}
                </option>
              ))}
            </select>
            <textarea className="input min-h-[60px]" value={mesh.text} onChange={(e) => setMesh({ ...mesh, text: e.target.value })} />
            <button className="btn-secondary w-full" disabled={busy}>
              <Radio size={14} /> Relay to control room
            </button>
            <div className="border-t border-ink-700 pt-2">
              <div className="mb-1 text-[11px] text-slate-400">Radio operator: record what you hear instead of typing it</div>
              <VoiceButton label="Record radio message" compact onAudio={sendVoice('radio', mesh.from || 'radio-operator')} />
            </div>
          </form>
          <ErrorText error={error} />
        </div>

        {/* Message log */}
        <section className="panel flex min-h-[500px] flex-col overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-ink-700 px-4 py-3">
            <MessageSquareText size={16} className="text-sky-400" />
            <h3 className="mr-auto text-sm font-semibold text-white">Gateway log</h3>
            {['', 'sms', 'voice', 'lora', 'radio'].map((c) => (
              <button key={c || 'all'} onClick={() => setFilter(c)} className={`chip cursor-pointer ${filter === c ? 'bg-rose-600 text-white' : 'bg-ink-700 text-slate-300'}`}>
                {c ? CHANNEL[c].label : 'All'}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-ink-800 text-[11px] uppercase text-slate-400">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Dir</th>
                  <th className="px-3 py-2">Channel</th>
                  <th className="px-3 py-2">Number / node</th>
                  <th className="px-3 py-2">Message</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {log.map((m) => (
                  <tr key={m.id} className="cursor-pointer border-t border-ink-700 hover:bg-ink-800/60" onClick={() => setPhone(m.phone)}>
                    <td className="whitespace-nowrap px-3 py-1.5 text-xs text-slate-500">{timeAgo(m.created_at)}</td>
                    <td className="px-3 py-1.5">
                      <span className={`chip ${m.direction === 'in' ? 'bg-sky-500/15 text-sky-300' : 'bg-emerald-500/15 text-emerald-300'}`}>{m.direction === 'in' ? 'IN' : 'OUT'}</span>
                    </td>
                    <td className="px-3 py-1.5 text-xs" style={{ color: CHANNEL[m.channel]?.color }}>
                      {CHANNEL[m.channel]?.label || m.channel}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-xs">{m.phone}</td>
                    <td className="max-w-[420px] px-3 py-1.5 text-slate-200">
                      <div className="line-clamp-2">{m.body}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-xs text-slate-400">
                      {m.status}
                      {m.incident_id ? ` · #${m.incident_id}` : ''}
                    </td>
                  </tr>
                ))}
                {!log.length && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500">
                      No messages yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-ink-700 bg-ink-850 px-4 py-3 text-xs text-slate-400">
            <b className="text-slate-200">Real deployment, no internet needed:</b> an Android phone with a SIM runs an SMS-gateway app on the control-room Wi-Fi (<code>SMS_PROVIDER=android</code>), or a
            GSM modem is plugged into the server. Incoming SMS are posted to <code>/api/gateway/sms</code>; replies go out through the same SIM. With internet, Twilio works too.
          </div>
        </section>
      </div>
    </div>
  );
}
