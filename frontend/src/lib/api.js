// Fetch wrapper: JSON in/out, JWT access token with automatic refresh-token
// rotation, readable errors. Network failures are tagged (err.offline) so the
// offline outbox can queue the request instead of losing it.
const TOKEN_KEY = 'drp_token';
const REFRESH_KEY = 'drp_refresh';

const ls = {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      v ? localStorage.setItem(k, v) : localStorage.removeItem(k);
    } catch {
      /* storage unavailable */
    }
  },
};

export const getToken = () => ls.get(TOKEN_KEY);
export const getRefresh = () => ls.get(REFRESH_KEY);
export const setSession = (token, refresh) => {
  ls.set(TOKEN_KEY, token);
  if (refresh !== undefined) ls.set(REFRESH_KEY, refresh);
};
export const setToken = (t) => setSession(t, t ? undefined : null);

let refreshing = null;
async function refreshSession() {
  const rt = getRefresh();
  if (!rt) return false;
  refreshing ||= fetch('/api/auth/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refresh_token: rt }) })
    .then(async (r) => {
      if (!r.ok) {
        setSession(null, null);
        return false;
      }
      const d = await r.json();
      setSession(d.token, d.refresh_token);
      return true;
    })
    .catch(() => false)
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

export async function api(path, { method = 'GET', body, signal, headers = {}, raw = false, retried = false } = {}) {
  const h = { 'content-type': 'application/json', ...headers };
  const token = getToken();
  if (token) h.authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined, signal });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    const err = new Error('No connection to the control-room server');
    err.offline = true;
    throw err;
  }
  if (res.status === 401 && token && !retried && !path.startsWith('/auth/')) {
    if (await refreshSession()) return api(path, { method, body, signal, headers, raw, retried: true });
  }
  if (raw && res.ok) return res;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.details = data.details;
    err.status = res.status;
    throw err;
  }
  return data;
}

export const post = (path, body, opts) => api(path, { method: 'POST', body, ...opts });
export const patch = (path, body, opts) => api(path, { method: 'PATCH', body, ...opts });
export const put = (path, body, opts) => api(path, { method: 'PUT', body, ...opts });

/** Download an authenticated file (CSV / PDF export). */
export async function download(path, filename) {
  const res = await api(path, { raw: true });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
