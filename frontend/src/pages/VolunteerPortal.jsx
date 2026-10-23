import { HandHeart, LogOut } from 'lucide-react';
import CampDetail from '../components/CampDetail';
import ConnectivityBadge from '../components/ConnectivityBadge';
import { useAuth } from '../context/AuthContext';

/** Volunteer / NGO portal: manage the assigned relief camp. */
export default function VolunteerPortal() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen bg-ink-950">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-ink-700 bg-ink-900 px-4 py-3">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-600 text-white">
          <HandHeart size={18} />
        </div>
        <div className="mr-auto min-w-0">
          <div className="truncate text-sm font-bold text-white">{user.name}</div>
          <div className="text-[11px] text-slate-400">Volunteer · {user.organization || 'NGO'}</div>
        </div>
        <ConnectivityBadge compact />
        <button className="btn-ghost !p-2" onClick={logout} title="Log out">
          <LogOut size={16} />
        </button>
      </header>
      <main className="mx-auto max-w-4xl p-4">
        {user.camp_id ? (
          <section className="panel p-4">
            <CampDetail campId={user.camp_id} />
          </section>
        ) : (
          <section className="panel p-8 text-center">
            <div className="text-lg font-semibold text-white">Waiting for a camp assignment</div>
            <p className="mt-1 text-sm text-slate-400">The control room will assign you to a relief camp. You will also get an SMS.</p>
          </section>
        )}
        <p className="mt-4 text-center text-xs text-slate-500">Record check-ins, distributions and donations here. Low stock is flagged to the control room automatically.</p>
      </main>
    </div>
  );
}
