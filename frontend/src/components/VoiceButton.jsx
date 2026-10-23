import { FileAudio, Loader2, Mic, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { canRecord, startRecording, toWav16k, transcribe } from '../lib/voice';

/**
 * Push-to-talk voice input. Records, converts to WAV and sends it for offline speech-to-text.
 * - onTranscript(result, lang): called with { text, raw, fixes, seconds, ms } (default flow), or
 * - onAudio(wav, lang): called with the WAV blob instead, when the caller posts it somewhere else.
 * When the page is not on https/localhost (e.g. a phone on the LAN), the browser blocks the
 * microphone, so a "record with phone" file picker is offered instead.
 */
export default function VoiceButton({ onTranscript, onAudio, label = 'Speak', hint, compact = false, defaultLang = 'en', disabled = false, className = '' }) {
  const [lang, setLang] = useState(defaultLang);
  const [state, setState] = useState('idle'); // idle | recording | working
  const [secs, setSecs] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState(null);
  const rec = useRef(null);
  const timer = useRef(null);
  const live = canRecord();

  useEffect(() => () => {
    clearInterval(timer.current);
    rec.current?.cancel();
  }, []);

  const handle = async (blob) => {
    setState('working');
    try {
      const wav = await toWav16k(blob);
      if (onAudio) await onAudio(wav, lang);
      else onTranscript?.(await transcribe(wav, lang), lang);
    } catch (e) {
      setError(e.message);
    } finally {
      setState('idle');
    }
  };

  const start = async () => {
    setError(null);
    try {
      rec.current = await startRecording();
      setState('recording');
      setSecs(0);
      const t0 = Date.now();
      timer.current = setInterval(() => {
        const s = (Date.now() - t0) / 1000;
        setSecs(s);
        setLevel(rec.current?.level() || 0);
        if (s >= 45) stop();
      }, 120);
    } catch (e) {
      setError(e.name === 'NotAllowedError' ? 'Microphone permission was denied' : `Microphone unavailable: ${e.message}`);
    }
  };

  const stop = async () => {
    clearInterval(timer.current);
    const r = rec.current;
    rec.current = null;
    if (!r) return;
    const blob = await r.stop();
    handle(blob);
  };

  const langToggle = (
    <div className="flex overflow-hidden rounded-md border border-ink-600 text-[11px]">
      {[
        ['en', 'EN'],
        ['ta', 'தமிழ்'],
      ].map(([k, l]) => (
        <button key={k} type="button" onClick={() => setLang(k)} className={`px-2 py-1 ${lang === k ? 'bg-sky-600 text-white' : 'bg-ink-800 text-slate-400'}`} disabled={state !== 'idle'}>
          {l}
        </button>
      ))}
    </div>
  );

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        {live ? (
          state === 'recording' ? (
            <button type="button" onClick={stop} className="btn bg-rose-600 text-white hover:bg-rose-500" title="Stop and send">
              <Square size={15} className="fill-white" /> Stop · {secs.toFixed(0)}s
              <span className="ml-1 inline-block h-2 w-12 overflow-hidden rounded bg-rose-900">
                <span className="block h-full bg-white transition-all" style={{ width: `${Math.min(100, level * 180)}%` }} />
              </span>
            </button>
          ) : (
            <button type="button" onClick={start} disabled={disabled || state === 'working'} className="btn-secondary" title="Record a voice message">
              {state === 'working' ? <Loader2 size={15} className="animate-spin" /> : <Mic size={15} />}
              {state === 'working' ? 'Understanding…' : label}
            </button>
          )
        ) : (
          <label className={`btn-secondary cursor-pointer ${disabled || state === 'working' ? 'pointer-events-none opacity-60' : ''}`} title="Record with the phone's voice recorder">
            {state === 'working' ? <Loader2 size={15} className="animate-spin" /> : <FileAudio size={15} />}
            {state === 'working' ? 'Understanding…' : `${label} (record)`}
            <input
              type="file"
              accept="audio/*"
              capture
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) handle(f);
              }}
            />
          </label>
        )}
        {langToggle}
      </div>
      {!compact && (
        <div className="mt-1 text-[11px] text-slate-500">
          {hint || 'Speech is converted to text on the control-room server — works without internet.'}
          {!live && ' (Live mic needs https or localhost; on this device the phone recorder is used.)'}
        </div>
      )}
      {error && <div className="mt-1 text-xs text-rose-400">{error}</div>}
    </div>
  );
}
