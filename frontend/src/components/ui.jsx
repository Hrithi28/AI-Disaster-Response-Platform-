import { X } from 'lucide-react';
import { CATEGORY, INC_STATUS, RES_STATUS, SEV } from '../lib/constants';

export function SeverityBadge({ level, score, size = 'sm' }) {
  const s = SEV[level] || SEV[3];
  return (
    <span
      className={`chip ${size === 'lg' ? 'text-xs px-2.5 py-1' : ''}`}
      style={{ background: `${s.color}22`, color: s.color, border: `1px solid ${s.color}55` }}
      title={`AI severity ${level}/5`}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
      {s.label}
      {score != null && <span className="font-mono opacity-80">· {Math.round(score)}</span>}
    </span>
  );
}

export const StatusChip = ({ status, kind = 'incident' }) => {
  const m = (kind === 'incident' ? INC_STATUS : RES_STATUS)[status] || { label: status, cls: 'bg-slate-500/20 text-slate-300' };
  return <span className={`chip ${m.cls}`}>{m.label}</span>;
};

export const CategoryChip = ({ category }) => {
  const c = CATEGORY[category] || CATEGORY.info;
  return (
    <span className="chip" style={{ background: `${c.color}22`, color: c.color }}>
      {c.label}
    </span>
  );
};

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-[2000] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className={`panel max-h-[90vh] w-full overflow-hidden shadow-2xl ${wide ? 'max-w-4xl' : 'max-w-lg'} flex flex-col`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ink-700 px-5 py-3">
          <h3 className="font-semibold text-white">{title}</h3>
          <button className="btn-ghost !p-1" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, accent, icon: Icon }) {
  return (
    <div className="panel flex min-w-0 items-center gap-3 px-4 py-3">
      {Icon && (
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: `${accent || '#64748b'}22`, color: accent || '#94a3b8' }}>
          <Icon size={18} />
        </div>
      )}
      <div className="min-w-0">
        <div className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
        <div className="kpi leading-tight">{value}</div>
        {sub && <div className="truncate text-[11px] text-slate-500">{sub}</div>}
      </div>
    </div>
  );
}

export function Bar({ value, max = 1, color = '#e11d48' }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-700">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color }} />
    </div>
  );
}

export const ErrorText = ({ error }) =>
  error ? (
    <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
      {error.message || String(error)}
      {error.details && <ul className="mt-1 list-disc pl-4 text-xs">{error.details.map((d) => <li key={d}>{d}</li>)}</ul>}
    </div>
  ) : null;
