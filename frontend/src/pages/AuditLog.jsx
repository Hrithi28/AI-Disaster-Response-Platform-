import { Download, FileText, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ErrorText } from '../components/ui';
import { api, download } from '../lib/api';
import { RESOURCE, timeAgo } from '../lib/constants';

const EXPORTS = [
  ['incidents', 'Incidents'],
  ['dispatches', 'Dispatch history'],
  ['inventory', 'Camp inventory'],
  ['sms', 'SMS & mesh log'],
  ['audit', 'Audit trail'],
];

export default function AuditLog() {
  const [tab, setTab] = useState('audit');
  const [audit, setAudit] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    api('/audit?limit=300').then(setAudit).catch(setError);
    api('/allocation/dispatches?limit=500').then(setDispatches).catch(setError);
  }, []);

  const dl = async (path, name) => {
    setBusy(name);
    setError(null);
    try {
      await download(path, name);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  const ql = q.toLowerCase();
  const auditRows = audit.filter((a) => !q || `${a.action} ${a.user_email} ${a.entity} ${a.entity_id}`.toLowerCase().includes(ql));
  const dispatchRows = dispatches.filter((d) => !q || `${d.incident_title} ${d.resource_name} ${d.status} ${d.method}`.toLowerCase().includes(ql));

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6">
      <div className="flex flex-wrap items-end gap-2">
        <div className="mr-auto">
          <h1 className="text-xl font-bold text-white">Audit & Reports</h1>
          <p className="text-sm text-slate-400">Every change is logged with who, what and when — needed for accountability after a disaster.</p>
        </div>
        <button className="btn-primary" disabled={busy} onClick={() => dl('/exports/sitrep.pdf', `DRP-sitrep-${new Date().toISOString().slice(0, 16)}.pdf`)}>
          <FileText size={15} /> Situation report (PDF)
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {EXPORTS.map(([k, label]) => (
          <button key={k} className="btn-secondary !py-1.5 text-xs" disabled={busy} onClick={() => dl(`/exports/${k}.csv`, `drp-${k}.csv`)}>
            <Download size={13} /> {label} CSV
          </button>
        ))}
      </div>
      <div className="mt-2">
        <ErrorText error={error} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {[
          ['audit', `Audit trail (${audit.length})`],
          ['dispatches', `Dispatch history (${dispatches.length})`],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`chip cursor-pointer !px-3 !py-1 ${tab === k ? 'bg-rose-600 text-white' : 'bg-ink-700 text-slate-300'}`}>
            {l}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Search size={14} className="text-slate-500" />
          <input className="input !w-56 !py-1" placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="panel mt-3 overflow-x-auto">
        {tab === 'audit' ? (
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="bg-ink-800 text-[11px] uppercase text-slate-400">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Entity</th>
                <th className="px-3 py-2">Result</th>
                <th className="px-3 py-2">IP</th>
              </tr>
            </thead>
            <tbody>
              {auditRows.map((a) => (
                <tr key={a.id} className="border-t border-ink-700">
                  <td className="whitespace-nowrap px-3 py-1.5 text-xs text-slate-400" title={a.created_at}>
                    {timeAgo(a.created_at)}
                  </td>
                  <td className="px-3 py-1.5 text-xs">
                    {a.user_email || <span className="text-slate-500">anonymous</span>} <span className="text-slate-500">{a.role}</span>
                  </td>
                  <td className="px-3 py-1.5 font-mono text-xs text-slate-200">{a.action}</td>
                  <td className="px-3 py-1.5 text-xs">
                    {a.entity}
                    {a.entity_id ? ` #${a.entity_id}` : ''}
                  </td>
                  <td className="px-3 py-1.5">
                    <span className={`chip ${a.status < 400 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>{a.status}</span>
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[11px] text-slate-500">{a.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-ink-800 text-[11px] uppercase text-slate-400">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Incident</th>
                <th className="px-3 py-2">Unit</th>
                <th className="px-3 py-2">Method</th>
                <th className="px-3 py-2">Routing</th>
                <th className="px-3 py-2 text-right">ETA</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Dispatched</th>
              </tr>
            </thead>
            <tbody>
              {dispatchRows.map((d) => (
                <tr key={d.id} className="border-t border-ink-700">
                  <td className="px-3 py-1.5 font-mono text-xs">{d.id}</td>
                  <td className="max-w-[260px] truncate px-3 py-1.5">{d.incident_title}</td>
                  <td className="px-3 py-1.5">
                    {RESOURCE[d.resource_type]?.icon} {d.resource_name}
                  </td>
                  <td className="px-3 py-1.5 text-xs">{d.method}</td>
                  <td className="px-3 py-1.5 text-xs text-slate-400">{d.route_engine || '—'}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs">{Math.round(d.eta_min)}m</td>
                  <td className="px-3 py-1.5 text-xs">{d.status.replace('_', ' ')}</td>
                  <td className="px-3 py-1.5 text-xs text-slate-500">{timeAgo(d.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
