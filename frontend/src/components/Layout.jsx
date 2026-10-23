import { Activity, BrainCircuit, ClipboardList, LayoutDashboard, LogOut, MessageSquareText, Radio, ShieldCheck, Siren, Tent, Truck, Users } from 'lucide-react';
import { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { connectionLevel, useLive } from '../context/LiveData';
import ConnectivityBadge from './ConnectivityBadge';

const NAV = [
  { to: '/', label: 'Command', icon: LayoutDashboard, end: true },
  { to: '/camps', label: 'Camps & Evacuation', icon: Tent },
  { to: '/gateway', label: 'SMS & Mesh Gateway', icon: MessageSquareText },
  { to: '/resilience', label: 'Offline & Resilience', icon: ShieldCheck },
  { to: '/analytics', label: 'Analytics', icon: Activity },
  { to: '/resources', label: 'Resources', icon: Truck },
  { to: '/ai-lab', label: 'AI Lab', icon: BrainCircuit },
  { to: '/users', label: 'Users & Volunteers', icon: Users },
  { to: '/audit', label: 'Audit & Reports', icon: ClipboardList },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const live = useLive();
  const { health, flash, setFlash, sim, connectivity } = live;
  const level = connectionLevel(live);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 6000);
    return () => clearTimeout(t);
  }, [flash, setFlash]);

  return (
    <div className="flex h-full">
      <aside className="flex w-16 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-ink-700 bg-ink-900 py-3 lg:w-56 lg:items-stretch lg:px-3">
        <div className="mb-3 flex items-center gap-2 px-1">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-rose-600 text-white">
            <Siren size={20} />
          </div>
          <div className="hidden leading-tight lg:block">
            <div className="text-sm font-extrabold text-white">DRP Command</div>
            <div className="text-[10px] text-slate-400">Node · {health?.node?.id || '—'}</div>
          </div>
        </div>
        <div className="mb-2 hidden lg:block">
          <ConnectivityBadge compact />
        </div>
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-rose-600/15 text-rose-300' : 'text-slate-400 hover:bg-ink-700 hover:text-slate-100'}`
            }
            title={label}
          >
            <Icon size={18} className="shrink-0" />
            <span className="hidden truncate lg:inline">{label}</span>
          </NavLink>
        ))}
        <div className="my-1 hidden border-t border-ink-700 lg:block" />
        <a href="/field" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-ink-700" title="Field App">
          <Radio size={18} />
          <span className="hidden lg:inline">Field App ↗</span>
        </a>
        <a href="/sos" target="_blank" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-ink-700" title="Citizen SOS">
          <Siren size={18} />
          <span className="hidden lg:inline">Citizen SOS ↗</span>
        </a>

        <div className="mt-auto hidden space-y-1.5 rounded-lg border border-ink-700 p-3 text-[11px] lg:block">
          <Row ok={level !== 'offline'} label="Live sync" value={level === 'offline' ? 'offline' : 'Socket.IO'} />
          <Row ok={connectivity?.internetAvailable} label="Internet" value={connectivity?.internetAvailable ? 'yes' : 'LAN-only'} />
          <Row ok={health?.ml?.online} label="AI engine" value={health?.ml?.online ? `model v${health.ml.modelVersion}` : 'fallback'} />
          <Row ok label="PostgreSQL" value={health?.postgres?.startsWith('PGlite') ? (health.postgres.includes('disk') ? 'embedded · saved' : 'in-memory') : 'server'} />
          <Row ok label="Doc store" value={health?.documentStore === 'mongodb' ? 'MongoDB' : health?.documentStore?.includes('disk') ? 'local · saved' : 'in-memory'} />
          <Row ok={(connectivity?.sync?.pending ?? 0) === 0} label="Cloud sync" value={connectivity?.sync?.cloud_url ? `${connectivity.sync.pending} queued` : 'local only'} />
          <Row ok={sim?.enabled} label="Simulator" value={sim?.enabled ? `×${sim.speed}` : 'paused'} />
        </div>
        <div className="mt-2 flex items-center gap-2 border-t border-ink-700 px-1 pt-3 lg:mt-3">
          <div className="hidden min-w-0 flex-1 lg:block">
            <div className="truncate text-xs font-semibold text-slate-200">{user?.name}</div>
            <div className="text-[10px] uppercase text-slate-500">{user?.role}</div>
          </div>
          <button className="btn-ghost !p-2" onClick={logout} title="Log out">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {level === 'offline' && (
          <div className="shrink-0 bg-rose-700/90 py-1 text-center text-xs font-semibold text-white">Cannot reach the control-room server — showing last known data, reconnecting…</div>
        )}
        {level === 'lan' && (
          <div className="shrink-0 bg-amber-600/90 py-0.5 text-center text-[11px] font-semibold text-white">
            No internet · running on the local network — dispatch, AI, SMS gateway and field sync keep working; cloud sync is queued
          </div>
        )}
        <div className="relative min-h-0 flex-1">
          <Outlet />
        </div>
        {flash && (
          <div className="absolute right-4 top-4 z-[1800] w-80 animate-slidein rounded-xl border border-rose-500/60 bg-rose-950/95 p-4 shadow-2xl">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-rose-300">
              <Siren size={14} /> Critical alert
            </div>
            <div className="mt-1 font-semibold text-white">{flash.title}</div>
            <div className="mt-1 text-sm text-rose-100/80">{flash.message}</div>
            {flash.channels && <div className="mt-2 text-[10px] text-rose-300/70">Sent via {flash.channels.join(', ')}</div>}
          </div>
        )}
      </main>
    </div>
  );
}

const Row = ({ ok, label, value }) => (
  <div className="flex items-center justify-between gap-2">
    <span className="flex items-center gap-1.5 text-slate-400">
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-amber-400'}`} />
      {label}
    </span>
    <span className="font-mono text-slate-300">{value}</span>
  </div>
);
