import { Check, Plus, UserX, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ErrorText, Modal } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useLive } from '../context/LiveData';
import { api, patch, post } from '../lib/api';
import { RESOURCE, timeAgo } from '../lib/constants';

const ROLES = ['admin', 'responder', 'volunteer', 'citizen'];

export default function Users() {
  const { user: me } = useAuth();
  const { resources, camps } = useLive();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('all');
  const [showNew, setShowNew] = useState(false);

  const load = () => api('/users').then(setUsers).catch(setError);
  useEffect(() => {
    load();
  }, []);

  const update = async (id, body) => {
    setError(null);
    try {
      const u = await patch(`/users/${id}`, body);
      setUsers((l) => l.map((x) => (x.id === id ? u : x)));
    } catch (e) {
      setError(e);
    }
  };

  const pending = users.filter((u) => u.role === 'volunteer' && u.volunteer_status === 'pending');
  const list = tab === 'volunteers' ? users.filter((u) => u.role === 'volunteer') : tab === 'pending' ? pending : users;

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6">
      <div className="flex flex-wrap items-end gap-2">
        <div className="mr-auto">
          <h1 className="text-xl font-bold text-white">Users & Volunteers</h1>
          <p className="text-sm text-slate-400">Role-based access: admin (control room), responder (field unit), volunteer (NGO / camp staff), citizen.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowNew(true)}>
          <Plus size={15} /> Add user
        </button>
      </div>
      <div className="mt-4 flex gap-2">
        {[
          ['all', `All (${users.length})`],
          ['volunteers', 'Volunteers / NGO'],
          ['pending', `Pending approval (${pending.length})`],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`chip cursor-pointer !px-3 !py-1 ${tab === k ? 'bg-rose-600 text-white' : 'bg-ink-700 text-slate-300'}`}>
            {l}
          </button>
        ))}
      </div>
      <div className="mt-2">
        <ErrorText error={error} />
      </div>
      <div className="panel mt-3 overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-ink-800 text-[11px] uppercase text-slate-400">
            <tr>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">Linked unit / camp</th>
              <th className="px-3 py-2">Last login</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id} className={`border-t border-ink-700 ${!u.is_active ? 'opacity-50' : ''}`}>
                <td className="px-3 py-2">
                  <div className="font-medium text-white">{u.name}</div>
                  <div className="text-xs text-slate-500">
                    {u.email}
                    {u.organization ? ` · ${u.organization}` : ''}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <select className="input !w-auto !py-1 text-xs" value={u.role} disabled={u.id === me.id} onChange={(e) => update(u.id, { role: e.target.value })}>
                    {ROLES.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{u.phone || '—'}</td>
                <td className="px-3 py-2">
                  {u.role === 'responder' && (
                    <select className="input !w-auto !py-1 text-xs" value={u.resource_id || ''} onChange={(e) => update(u.id, { resource_id: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">— no unit —</option>
                      {resources.map((r) => (
                        <option key={r.id} value={r.id}>
                          {RESOURCE[r.type]?.icon} {r.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {u.role === 'volunteer' && (
                    <select className="input !w-auto !py-1 text-xs" value={u.camp_id || ''} onChange={(e) => update(u.id, { camp_id: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">— no camp —</option>
                      {camps.map((c) => (
                        <option key={c.id} value={c.id}>
                          ⛺ {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">{u.last_login ? timeAgo(u.last_login) : 'never'}</td>
                <td className="px-3 py-2">
                  {u.role === 'volunteer' && u.volunteer_status !== 'approved' ? (
                    <span className="chip bg-amber-500/15 text-amber-300">{u.volunteer_status}</span>
                  ) : u.is_active ? (
                    <span className="chip bg-emerald-500/15 text-emerald-300">active</span>
                  ) : (
                    <span className="chip bg-slate-500/20 text-slate-400">disabled</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {u.role === 'volunteer' && u.volunteer_status === 'pending' && (
                    <>
                      <button className="btn-success !px-2 !py-1 text-xs" onClick={() => update(u.id, { volunteer_status: 'approved' })}>
                        <Check size={13} /> Approve
                      </button>{' '}
                      <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => update(u.id, { volunteer_status: 'rejected' })}>
                        <X size={13} /> Reject
                      </button>
                    </>
                  )}
                  {u.id !== me.id && (
                    <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => update(u.id, { is_active: !u.is_active })}>
                      <UserX size={13} /> {u.is_active ? 'Disable' : 'Enable'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showNew && (
        <NewUser
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function NewUser({ onClose, onCreated }) {
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'responder', phone: '' });
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    try {
      await post('/users', { ...f, phone: f.phone || undefined });
      onCreated();
    } catch (err) {
      setError(err);
    }
  };
  return (
    <Modal title="Add user" onClose={onClose}>
      <form className="space-y-3" onSubmit={submit}>
        <input className="input" placeholder="Full name" value={f.name} onChange={set('name')} required />
        <input className="input" placeholder="Email" type="email" value={f.email} onChange={set('email')} required />
        <input className="input" placeholder="Temporary password (min 6)" type="password" value={f.password} onChange={set('password')} required minLength={6} />
        <div className="grid grid-cols-2 gap-3">
          <select className="input" value={f.role} onChange={set('role')}>
            {ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <input className="input" placeholder="Phone (for SMS)" value={f.phone} onChange={set('phone')} />
        </div>
        <ErrorText error={error} />
        <div className="flex justify-end">
          <button className="btn-primary">Create</button>
        </div>
      </form>
    </Modal>
  );
}
