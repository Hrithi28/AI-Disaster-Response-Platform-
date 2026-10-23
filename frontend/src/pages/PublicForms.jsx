import { CheckCircle2, HandHeart, KeyRound, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ErrorText } from '../components/ui';
import { post } from '../lib/api';

const Shell = ({ icon: Icon, title, children }) => (
  <div className="flex min-h-full items-center justify-center p-6">
    <div className="panel w-full max-w-md p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-rose-600 text-white">
          <Icon size={20} />
        </div>
        <h1 className="text-xl font-bold text-white">{title}</h1>
      </div>
      {children}
      <Link to="/login" className="mt-4 block text-center text-xs text-slate-400 hover:text-white">
        ← Back to login
      </Link>
    </div>
  </div>
);

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [res, setRes] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setRes(await post('/auth/forgot-password', { email }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell icon={KeyRound} title="Reset password">
      {res ? (
        <div className="space-y-3 text-sm">
          <p className="text-slate-300">{res.message} The link is also sent by SMS to the phone on the account.</p>
          {res.dev_reset_link && (
            <a className="btn-secondary w-full" href={res.dev_reset_link.replace(/^https?:\/\/[^/]+/, '')}>
              Open reset link (demo mode)
            </a>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <input className="input" type="email" placeholder="Your account email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <ErrorText error={error} />
          <button className="btn-primary w-full" disabled={busy}>
            {busy && <Loader2 size={15} className="animate-spin" />} Send reset link
          </button>
        </form>
      )}
    </Shell>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [pw, setPw] = useState('');
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    try {
      await post('/auth/reset-password', { token: params.get('token'), password: pw });
      setDone(true);
      setTimeout(() => nav('/login'), 1800);
    } catch (err) {
      setError(err);
    }
  };
  return (
    <Shell icon={KeyRound} title="Choose a new password">
      {done ? (
        <p className="flex items-center gap-2 text-emerald-300">
          <CheckCircle2 size={18} /> Password updated. Redirecting to login…
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <input className="input" type="password" placeholder="New password (min 6 characters)" minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} required />
          <ErrorText error={error} />
          <button className="btn-primary w-full">Update password</button>
        </form>
      )}
    </Shell>
  );
}

const SKILLS = ['First aid', 'Cooking', 'Driving', 'Swimming / boat', 'Logistics', 'Counselling', 'Tamil–English translation', 'Medical professional'];

export function VolunteerRegister() {
  const [f, setF] = useState({ name: '', email: '', password: '', phone: '', organization: '', skills: [] });
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggle = (s) => setF({ ...f, skills: f.skills.includes(s) ? f.skills.filter((x) => x !== s) : [...f.skills, s] });
  const submit = async (e) => {
    e.preventDefault();
    try {
      setDone((await post('/auth/register-volunteer', { ...f, organization: f.organization || undefined })).message);
    } catch (err) {
      setError(err);
    }
  };
  return (
    <Shell icon={HandHeart} title="Volunteer / NGO registration">
      {done ? (
        <p className="flex items-start gap-2 text-emerald-300">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> {done}
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <input className="input" placeholder="Full name" value={f.name} onChange={set('name')} required minLength={2} />
          <input className="input" placeholder="Email" type="email" value={f.email} onChange={set('email')} required />
          <input className="input" placeholder="Mobile number (for SMS updates)" value={f.phone} onChange={set('phone')} required minLength={8} />
          <input className="input" placeholder="Organisation / NGO (optional)" value={f.organization} onChange={set('organization')} />
          <input className="input" placeholder="Password (min 6)" type="password" value={f.password} onChange={set('password')} required minLength={6} />
          <div>
            <div className="label">Skills</div>
            <div className="flex flex-wrap gap-1.5">
              {SKILLS.map((s) => (
                <button type="button" key={s} onClick={() => toggle(s)} className={`chip cursor-pointer ${f.skills.includes(s) ? 'bg-emerald-500/25 text-emerald-200' : 'bg-ink-700 text-slate-400'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <ErrorText error={error} />
          <button className="btn-primary w-full">Register</button>
        </form>
      )}
    </Shell>
  );
}
