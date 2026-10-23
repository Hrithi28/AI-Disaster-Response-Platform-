import { HandHeart, Loader2, Radio, ShieldCheck, Siren, User } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ErrorText } from '../components/ui';
import { homeFor, useAuth } from '../context/AuthContext';

const DEMO = [
  { role: 'Control room', email: 'admin@drp.in', password: 'admin123', icon: ShieldCheck, desc: 'Live command dashboard, optimiser, analytics, AI lab' },
  { role: 'Field responder', email: 'responder@drp.in', password: 'field123', icon: Radio, desc: 'Mobile field app for Rescue Boat 01' },
  { role: 'Camp volunteer (NGO)', email: 'volunteer@drp.in', password: 'volunteer123', icon: HandHeart, desc: 'Relief camp inventory & check-ins' },
  { role: 'Citizen', email: 'citizen@drp.in', password: 'citizen123', icon: User, desc: 'SOS request & tracking' },
];

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('admin@drp.in');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={homeFor(user.role)} replace />;

  const submit = async (e, creds) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const u = await login(creds?.email || email, creds?.password || password);
      nav(homeFor(u.role));
    } catch (err) {
      setError(
        err.offline || err.status === 503
          ? new Error('Cannot reach the control-room server. Check that the "Control room :4000" window is running (wait for "DRP EDGE node … running"), then try again. Internet is not needed.')
          : err,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-rose-950 via-ink-900 to-ink-950 p-12 lg:flex lg:flex-col">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-rose-600 text-white">
            <Siren size={24} />
          </div>
          <div className="text-lg font-extrabold text-white">DRP Command</div>
        </div>
        <div className="mt-auto max-w-lg">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-300">Full Stack Development Project</div>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight text-white">AI-Powered Disaster Response &amp; Resource Allocation Platform</h1>
          <p className="mt-4 text-slate-300">
            Real-time data ingestion, AI-driven severity prediction and optimised resource deployment — from hours to minutes.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-3 text-sm">
            {['NLP in English & Tamil', 'Explainable severity AI', 'Hungarian-algorithm dispatch', 'Works offline (LAN + SMS + LoRa)', 'Relief camps & evacuation', 'Socket.IO live sync'].map((f) => (
              <div key={f} className="flex items-center gap-2 text-slate-300">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> {f}
              </div>
            ))}
          </div>
          <div className="mt-10 text-xs text-slate-500">Hrithika S · Guide: Sudha P · Dept. of IT, SSN College of Engineering</div>
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <h2 className="text-2xl font-bold text-white">Sign in</h2>
          <p className="mt-1 text-sm text-slate-400">Use a demo account below or enter credentials.</p>
          <form className="mt-6 space-y-3" onSubmit={submit}>
            <div>
              <label className="label">Email</label>
              <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
            <ErrorText error={error} />
            <button className="btn-primary w-full" disabled={busy}>
              {busy && <Loader2 size={15} className="animate-spin" />} Sign in
            </button>
            <div className="flex justify-between text-xs">
              <Link to="/forgot-password" className="text-slate-400 hover:text-white">
                Forgot password?
              </Link>
              <Link to="/volunteer/register" className="text-emerald-400 hover:text-emerald-300">
                Register as volunteer / NGO →
              </Link>
            </div>
          </form>

          <div className="mt-8 space-y-2">
            <div className="label">One-click demo accounts</div>
            {DEMO.map((d) => (
              <button key={d.email} onClick={() => submit(null, d)} className="panel flex w-full items-center gap-3 p-3 text-left transition hover:border-rose-500/50">
                <d.icon size={20} className="text-rose-400" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-white">{d.role}</div>
                  <div className="truncate text-xs text-slate-400">{d.desc}</div>
                </div>
                <span className="font-mono text-[10px] text-slate-500">{d.email}</span>
              </button>
            ))}
          </div>
          <Link to="/sos" className="btn mt-6 w-full border border-rose-500/50 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20">
            <Siren size={16} /> Emergency? Send an SOS without logging in
          </Link>
        </div>
      </div>
    </div>
  );
}
