import { Minus, PackagePlus, Plus, Truck, UserMinus, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, patch, post } from '../lib/api';
import { timeAgo } from '../lib/constants';
import { Bar, ErrorText } from './ui';
import VoiceButton from './VoiceButton';
import { parseCampCommand, speak } from '../lib/voice';

/** Camp inventory & occupancy management (used by admins and camp volunteers). */
export default function CampDetail({ campId, canAdmin = false, compact = false }) {
  const [camp, setCamp] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [people, setPeople] = useState(10);
  const [amounts, setAmounts] = useState({});
  const [msg, setMsg] = useState(null);

  const load = () => api(`/camps/${campId}`).then(setCamp).catch(setError);
  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [campId]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn, okMsg) => {
    setBusy(true);
    setError(null);
    try {
      const out = await fn();
      if (out?.inventory) setCamp(out);
      else await load();
      setMsg(okMsg);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const onVoice = async (t) => {
    const cmd = parseCampCommand(t.text || '', camp?.inventory || []);
    if (!cmd) {
      setMsg(`Heard “${t.text}” — try “distributed 40 food packets”, “received 200 litres of water” or “checked in 12 people”.`);
      return speak('Sorry, I did not understand. Please say for example: distributed forty food packets.');
    }
    const label =
      cmd.kind === 'stock'
        ? `${cmd.delta < 0 ? 'Distributed' : 'Received'} ${Math.abs(cmd.delta)} ${cmd.unit} ${cmd.item}`
        : cmd.kind === 'occupancy'
          ? `${Math.abs(cmd.delta)} people checked ${cmd.delta > 0 ? 'in' : 'out'}`
          : 'Resupply request sent to the control room';
    const call =
      cmd.kind === 'stock'
        ? () => post(`/camps/${camp.id}/stock`, { item: cmd.item, delta: cmd.delta, reason: cmd.delta < 0 ? 'Distribution (voice)' : 'Restock / donation (voice)' })
        : cmd.kind === 'occupancy'
          ? () => post(`/camps/${camp.id}/occupancy`, { delta: cmd.delta })
          : () => post(`/camps/${camp.id}/resupply`);
    await run(call, `🎙 “${t.text}” → ${label}`);
    speak(`${label}.`);
  };

  if (!camp) return <div className="p-6 text-sm text-slate-500">Loading camp…</div>;
  const pct = camp.capacity ? camp.occupancy / camp.capacity : 0;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-lg font-bold text-white">⛺ {camp.name}</h2>
          <span className={`chip ${camp.status === 'open' ? 'bg-emerald-500/15 text-emerald-300' : camp.status === 'full' ? 'bg-rose-500/15 text-rose-300' : 'bg-slate-500/20 text-slate-400'}`}>{camp.status}</span>
          {canAdmin &&
            ['open', 'closed'].map((s) => (
              <button key={s} className="btn-ghost !px-2 !py-1 text-xs" disabled={busy || camp.status === s} onClick={() => run(() => patch(`/camps/${camp.id}`, { status: s }), `Camp marked ${s}`)}>
                mark {s}
              </button>
            ))}
        </div>
        <div className="mt-2 flex items-center gap-3 text-sm">
          <span className="font-mono text-white">
            {camp.occupancy}/{camp.capacity}
          </span>
          <Bar value={camp.occupancy} max={camp.capacity} color={pct >= 0.95 ? '#e11d48' : pct >= 0.75 ? '#f59e0b' : '#22c55e'} />
          <span className="text-xs text-slate-400">{Math.round(pct * 100)}%</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input type="number" min="1" className="input !w-24 !py-1" value={people} onChange={(e) => setPeople(Number(e.target.value))} aria-label="People" />
          <button className="btn-secondary !py-1 text-xs" disabled={busy} onClick={() => run(() => post(`/camps/${camp.id}/occupancy`, { delta: people }), `${people} people checked in`)}>
            <UserPlus size={13} /> Check in
          </button>
          <button className="btn-secondary !py-1 text-xs" disabled={busy} onClick={() => run(() => post(`/camps/${camp.id}/occupancy`, { delta: -people }), `${people} people checked out`)}>
            <UserMinus size={13} /> Check out
          </button>
          <button className="btn-secondary ml-auto !py-1 text-xs" disabled={busy} onClick={() => run(() => post(`/camps/${camp.id}/resupply`), 'Resupply request sent to the control room')}>
            <Truck size={13} /> Request resupply
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3">
        <div className="mb-1.5 text-xs font-semibold text-emerald-200">🎙 Update by voice</div>
        <VoiceButton
          label="Speak update"
          compact
          onTranscript={onVoice}
          disabled={busy}
        />
        <div className="mt-1 text-[11px] text-slate-500">Say “distributed 40 food packets”, “received 200 litres of water”, “checked in 12 people” or “we need resupply”.</div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-ink-700">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="bg-ink-800 text-[11px] uppercase text-slate-400">
            <tr>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2">Stock</th>
              <th className="px-3 py-2">Days left</th>
              <th className="px-3 py-2 text-right">Distribute / restock</th>
            </tr>
          </thead>
          <tbody>
            {camp.inventory.map((i) => {
              const low = i.quantity < i.min_level;
              const daily = i.per_person_daily * camp.occupancy;
              const amt = amounts[i.item] ?? Math.max(1, Math.round(i.min_level / 10));
              return (
                <tr key={i.id} className={`border-t border-ink-700 ${low ? 'bg-orange-500/5' : ''}`}>
                  <td className="px-3 py-1.5">
                    <div className="font-medium text-slate-100">{i.item}</div>
                    <div className="text-[10px] uppercase text-slate-500">{i.category}</div>
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`font-mono ${low ? 'text-orange-300' : 'text-white'}`}>
                        {Math.round(i.quantity).toLocaleString('en-IN')} {i.unit}
                      </span>
                      {low && <span className="chip bg-orange-500/15 text-orange-300">LOW</span>}
                    </div>
                    <div className="w-32">
                      <Bar value={i.quantity} max={Math.max(i.min_level * 3, i.quantity)} color={low ? '#f97316' : '#22c55e'} />
                    </div>
                    <div className="text-[10px] text-slate-500">min {i.min_level}</div>
                  </td>
                  <td className="px-3 py-1.5 font-mono text-xs text-slate-300">{daily > 0 ? (i.quantity / daily).toFixed(1) : '—'}</td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center justify-end gap-1">
                      <input type="number" min="1" className="input !w-20 !px-2 !py-1 text-xs" value={amt} onChange={(e) => setAmounts({ ...amounts, [i.item]: Number(e.target.value) })} aria-label={`Amount of ${i.item}`} />
                      <button className="btn-ghost !p-1.5" title="Distribute" disabled={busy} onClick={() => run(() => post(`/camps/${camp.id}/stock`, { item: i.item, delta: -amt, reason: 'Distribution' }), `Distributed ${amt} ${i.unit} ${i.item}`)}>
                        <Minus size={14} />
                      </button>
                      <button className="btn-ghost !p-1.5" title="Restock / donation received" disabled={busy} onClick={() => run(() => post(`/camps/${camp.id}/stock`, { item: i.item, delta: amt, reason: 'Restock / donation' }), `Received ${amt} ${i.unit} ${i.item}`)}>
                        <Plus size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {msg && (
        <div className="flex items-center gap-2 rounded-lg bg-ink-850 px-3 py-2 text-xs text-slate-200">
          <PackagePlus size={14} className="text-emerald-400" /> {msg}
        </div>
      )}
      <ErrorText error={error} />

      {!compact && (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="label">Volunteers at this camp</div>
            {camp.volunteers.length ? (
              camp.volunteers.map((v) => (
                <div key={v.id} className="rounded bg-ink-850 px-3 py-1.5 text-sm">
                  {v.name} <span className="text-xs text-slate-500">· {v.organization} · {v.phone}</span>
                </div>
              ))
            ) : (
              <div className="text-xs text-slate-500">None assigned yet (assign from Users & Volunteers).</div>
            )}
          </div>
          <div>
            <div className="label">Recent transactions</div>
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {camp.transactions.map((t) => (
                <div key={t.id} className="flex justify-between rounded bg-ink-850 px-3 py-1 text-xs">
                  <span>
                    {t.item} <span className={t.delta > 0 ? 'text-emerald-300' : 'text-orange-300'}>{t.delta > 0 ? '+' : ''}{Math.round(t.delta)}</span> · {t.reason}
                  </span>
                  <span className="text-slate-500">{timeAgo(t.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
