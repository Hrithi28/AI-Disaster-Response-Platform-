import { Plus, Power } from 'lucide-react';
import { useState } from 'react';
import { ErrorText, Modal, StatusChip } from '../components/ui';
import { useLive } from '../context/LiveData';
import { patch, post } from '../lib/api';
import { LOCALITIES, RESOURCE, timeAgo } from '../lib/constants';

export default function Resources() {
  const { resources, sensors, incidents } = useLive();
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const incById = Object.fromEntries(incidents.map((i) => [i.id, i]));

  const list = resources.filter((r) => (!type || r.type === type) && (!status || r.status === status));
  const toggle = async (r) => {
    setError(null);
    try {
      await patch(`/resources/${r.id}`, { status: r.status === 'offline' ? 'available' : 'offline' });
    } catch (e) {
      setError(e);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6">
      <div className="flex flex-wrap items-end gap-2">
        <div className="mr-auto">
          <h1 className="text-xl font-bold text-white">Resources & Sensors</h1>
          <p className="text-sm text-slate-400">Response fleet (PostgreSQL) and IoT field sensors with live readings.</p>
        </div>
        <select className="input !w-auto" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          {Object.entries(RESOURCE).map(([k, v]) => (
            <option key={k} value={k}>{v.icon} {v.label}</option>
          ))}
        </select>
        <select className="input !w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {['available', 'dispatched', 'on_scene', 'returning', 'offline'].map((s) => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>
          <Plus size={15} /> Add unit
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {Object.entries(RESOURCE).map(([k, v]) => {
          const all = resources.filter((r) => r.type === k);
          const free = all.filter((r) => r.status === 'available').length;
          return (
            <button key={k} onClick={() => setType(type === k ? '' : k)} className={`panel p-3 text-left ${type === k ? 'border-rose-500/60' : ''}`}>
              <div className="text-xl">{v.icon}</div>
              <div className="mt-1 text-xs text-slate-400">{v.label}</div>
              <div className="font-mono text-lg font-bold text-white">
                {free}<span className="text-sm text-slate-500">/{all.length} free</span>
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-3"><ErrorText error={error} /></div>

      <div className="panel mt-3 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-ink-800 text-[11px] uppercase text-slate-400">
            <tr>
              <th className="px-4 py-2">Unit</th>
              <th className="px-4 py-2">Base</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Assignment</th>
              <th className="px-4 py-2">Capacity</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className="border-t border-ink-700">
                <td className="px-4 py-2 font-medium text-white">{RESOURCE[r.type]?.icon} {r.name}</td>
                <td className="px-4 py-2 text-slate-400">{r.base_name}</td>
                <td className="px-4 py-2"><StatusChip status={r.status} kind="resource" /></td>
                <td className="max-w-[260px] truncate px-4 py-2 text-slate-300">{r.assigned_incident_id ? `#${r.assigned_incident_id} ${incById[r.assigned_incident_id]?.title || ''}` : '—'}</td>
                <td className="px-4 py-2 font-mono text-slate-400">{r.capacity}</td>
                <td className="px-4 py-2 text-right">
                  {['available', 'offline'].includes(r.status) && (
                    <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => toggle(r)}>
                      <Power size={13} /> {r.status === 'offline' ? 'Bring online' : 'Take offline'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-6 text-sm font-semibold text-white">IoT field sensors</h2>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {sensors.map((s) => (
          <div key={s.code} className={`panel p-3 ${s.anomaly ? 'border-rose-500/60 bg-rose-500/5' : ''}`}>
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-slate-400">{s.code}</span>
              {s.anomaly ? <span className="chip bg-rose-500/20 text-rose-300">⚠ anomaly</span> : <span className="chip bg-emerald-500/15 text-emerald-300">normal</span>}
            </div>
            <div className="mt-1 truncate text-sm text-slate-200">{s.locality}</div>
            <div className="mt-1 font-mono text-xl font-bold text-white">
              {s.last_value ?? '—'} <span className="text-xs text-slate-500">{s.unit} · {s.sensor_type.replace('_', ' ')}</span>
            </div>
            <div className="text-[10px] text-slate-500">updated {timeAgo(s.updated_at)}</div>
          </div>
        ))}
      </div>
      {showAdd && <AddUnit onClose={() => setShowAdd(false)} />}
    </div>
  );
}

function AddUnit({ onClose }) {
  const [f, setF] = useState({ name: '', type: 'ambulance', base: 'Velachery', capacity: 2 });
  const [error, setError] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    const l = LOCALITIES.find((x) => x.name === f.base);
    try {
      await post('/resources', { name: f.name, type: f.type, base_name: `${f.base} Staging Point`, lat: l.lat, lng: l.lng, capacity: Number(f.capacity) });
      onClose();
    } catch (err) {
      setError(err);
    }
  };
  return (
    <Modal title="Add response unit" onClose={onClose}>
      <form className="space-y-3" onSubmit={submit}>
        <div>
          <label className="label">Name</label>
          <input className="input" required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Ambulance 13" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Type</label>
            <select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              {Object.entries(RESOURCE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Base</label>
            <select className="input" value={f.base} onChange={(e) => setF({ ...f, base: e.target.value })}>
              {LOCALITIES.map((l) => <option key={l.name}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Capacity</label>
            <input className="input" type="number" min="1" value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} />
          </div>
        </div>
        <ErrorText error={error} />
        <div className="flex justify-end"><button className="btn-primary"><Plus size={15} /> Add unit</button></div>
      </form>
    </Modal>
  );
}
