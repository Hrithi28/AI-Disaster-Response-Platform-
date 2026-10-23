import { AlertTriangle, Bell, Info, MessageSquare, Siren, AtSign } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { DISASTER, RESOURCE, timeAgo } from '../lib/constants';
import { CategoryChip, SeverityBadge, StatusChip } from './ui';

/** Priority Queue Scheduler view (ordered by dynamic priority). */
export function QueuePanel({ incidents, onSelect, selectedId }) {
  const [queue, setQueue] = useState([]);
  const sig = incidents.map((i) => `${i.id}:${i.status}:${i.severity}:${i.report_count}`).join(',');
  useEffect(() => {
    const ctrl = new AbortController();
    api('/allocation/queue', { signal: ctrl.signal }).then((q) => Array.isArray(q) && setQueue(q)).catch(() => {});
    return () => ctrl.abort();
  }, [sig]);

  return (
    <div className="space-y-1.5 p-3">
      {queue.map((q, idx) => {
        const missing = Object.entries(q.outstanding || {});
        return (
          <button
            key={q.id}
            onClick={() => onSelect(q)}
            className={`w-full rounded-lg border px-3 py-2 text-left transition hover:border-ink-600 hover:bg-ink-800 ${selectedId === q.id ? 'border-sky-500/60 bg-ink-800' : 'border-ink-700 bg-ink-850/60'}`}
          >
            <div className="flex items-center gap-2">
              <span className="w-5 font-mono text-[11px] text-slate-500">{idx + 1}</span>
              <span>{DISASTER[q.disaster_type]?.icon}</span>
              <span className="flex-1 truncate text-sm font-medium text-slate-100">{q.title}</span>
              <span className="font-mono text-xs font-bold text-white" title="Dynamic priority = AI score + ageing + casualties + report volume">
                {q.priority.toFixed(0)}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-7">
              <SeverityBadge level={q.severity} />
              <StatusChip status={q.status} />
              {missing.length > 0 ? (
                <span className="chip bg-rose-500/10 text-rose-300">needs {missing.map(([t, n]) => `${n}${RESOURCE[t]?.icon}`).join(' ')}</span>
              ) : (
                <span className="chip bg-emerald-500/10 text-emerald-300">covered</span>
              )}
              <span className="text-[10px] text-slate-500">{timeAgo(q.created_at)}</span>
            </div>
          </button>
        );
      })}
      {!queue.length && <div className="p-6 text-center text-sm text-slate-500">No active incidents 🎉</div>}
    </div>
  );
}

const CHANNEL_ICON = { social: AtSign, sos: Siren, field: MessageSquare };

/** Unified feed of social, SOS and field reports with their NLP tags. */
export function FeedPanel({ reports, onSelectIncident }) {
  return (
    <div className="space-y-1.5 p-3">
      {reports.map((r) => {
        const Icon = CHANNEL_ICON[r.channel] || MessageSquare;
        return (
          <div key={r.id} className="animate-slidein rounded-lg border border-ink-700 bg-ink-850/60 px-3 py-2">
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <Icon size={12} className={r.channel === 'sos' ? 'text-rose-400' : 'text-sky-400'} />
              <span className="font-semibold text-slate-400">{r.author}</span>
              <span>· {timeAgo(r.createdAt)}</span>
              {r.nlp?.fallback && <span className="text-amber-400">· rules</span>}
            </div>
            <p className="mt-1 text-sm text-slate-200">{r.text}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <CategoryChip category={r.nlp?.category} />
              <span className={`chip ${r.nlp?.urgency_label === 'high' ? 'bg-rose-500/15 text-rose-300' : r.nlp?.urgency_label === 'medium' ? 'bg-amber-500/15 text-amber-300' : 'bg-slate-500/15 text-slate-400'}`}>
                urgency {r.nlp?.urgency_label}
              </span>
              {r.nlp?.confidence != null && <span className="font-mono text-[10px] text-slate-500">{Math.round(r.nlp.confidence * 100)}%</span>}
              {r.incidentId && (
                <button className="chip bg-ink-700 text-slate-300 hover:bg-ink-600" onClick={() => onSelectIncident(r.incidentId)}>
                  {r.status === 'merged' ? 'merged →' : 'new →'} #{r.incidentId}
                </button>
              )}
            </div>
          </div>
        );
      })}
      {!reports.length && <div className="p-6 text-center text-sm text-slate-500">Waiting for reports…</div>}
    </div>
  );
}

const LEVEL = {
  critical: { icon: Siren, cls: 'border-rose-500/50 bg-rose-500/10', text: 'text-rose-300' },
  warning: { icon: AlertTriangle, cls: 'border-amber-500/40 bg-amber-500/5', text: 'text-amber-300' },
  info: { icon: Info, cls: 'border-ink-700 bg-ink-850/60', text: 'text-sky-300' },
};

export function AlertsPanel({ alerts, onSelectIncident }) {
  return (
    <div className="space-y-1.5 p-3">
      {alerts.map((a) => {
        const L = LEVEL[a.level] || LEVEL.info;
        return (
          <div key={a.id} className={`animate-slidein rounded-lg border px-3 py-2 ${L.cls}`}>
            <div className={`flex items-center gap-2 text-xs font-semibold ${L.text}`}>
              <L.icon size={13} /> {a.title}
              <span className="ml-auto font-normal text-slate-500">{timeAgo(a.created_at)}</span>
            </div>
            <p className="mt-1 text-xs text-slate-300">{a.message}</p>
            <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
              <Bell size={10} /> {(a.channels || []).join(' · ')}
              {a.incident_id && (
                <button className="ml-auto text-sky-400 hover:underline" onClick={() => onSelectIncident(a.incident_id)}>
                  view #{a.incident_id}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const FEED_COLOR = { red: 'bg-rose-500/20 text-rose-300', orange: 'bg-orange-500/20 text-orange-300', yellow: 'bg-amber-500/20 text-amber-300', green: 'bg-emerald-500/15 text-emerald-300' };

/** Real-time public feeds: USGS earthquakes + GDACS cyclones/floods near India. */
export function GlobalFeedsPanel({ feeds }) {
  const items = feeds?.items || [];
  return (
    <div className="space-y-1.5 p-3">
      <div className="flex flex-wrap gap-1.5 text-[10px]">
        {Object.entries(feeds?.sources || {}).map(([k, v]) => (
          <span key={k} className={`chip ${v.status === 'live' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-500/20 text-slate-400'}`}>
            {k}: {v.status}
            {v.count != null ? ` · ${v.count}` : ''}
          </span>
        ))}
        {!feeds?.sources?.USGS && <span className="chip bg-slate-500/20 text-slate-400">Feeds load when the server has internet</span>}
      </div>
      {items.map((e) => (
        <a key={e.id} href={e.url} target="_blank" rel="noreferrer" className="block rounded-lg border border-ink-700 bg-ink-850/60 px-3 py-2 hover:border-ink-600">
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span className="font-semibold text-slate-300">{e.source}</span>
            <span className={`chip ${FEED_COLOR[e.alert_level] || FEED_COLOR.green}`}>{e.type} · {e.alert_level}</span>
            <span className="ml-auto">{timeAgo(e.time)}</span>
          </div>
          <div className="mt-1 text-sm text-slate-200">{e.title}</div>
          <div className="text-[11px] text-slate-500">
            {e.distance_km != null ? `${e.distance_km.toLocaleString('en-IN')} km from Chennai` : e.country}
            {e.tsunami ? ' · tsunami flag' : ''}
          </div>
        </a>
      ))}
      {feeds?.sources?.USGS && !items.length && <div className="p-6 text-center text-sm text-slate-500">No significant events near India right now.</div>}
    </div>
  );
}
