import { createContext, useContext, useEffect, useState } from 'react';
import { api, getRefresh, getToken, post, setSession } from '../lib/api';
import { resetSocket } from '../lib/socket';

const AuthCtx = createContext(null);
const USER_KEY = 'drp_user';

const cachedUser = () => {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
};
const cacheUser = (u) => {
  try {
    u ? localStorage.setItem(USER_KEY, JSON.stringify(u)) : localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken() && !getRefresh()) return setReady(true);
    api('/auth/me')
      .then((u) => {
        setUser(u);
        cacheUser(u);
      })
      .catch((e) => {
        // Offline: keep the last known user so the field app still opens
        if (e.offline && cachedUser()) setUser(cachedUser());
        else setSession(null, null);
      })
      .finally(() => setReady(true));
  }, []);

  const login = async (email, password) => {
    const { token, refresh_token, user } = await post('/auth/login', { email, password });
    setSession(token, refresh_token);
    cacheUser(user);
    resetSocket();
    setUser(user);
    return user;
  };
  const logout = () => {
    const rt = getRefresh();
    if (rt) post('/auth/logout', { refresh_token: rt }).catch(() => {});
    setSession(null, null);
    cacheUser(null);
    resetSocket();
    setUser(null);
  };
  return <AuthCtx.Provider value={{ user, ready, login, logout }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
export const homeFor = (role) => (role === 'responder' ? '/field' : role === 'citizen' ? '/sos' : role === 'volunteer' ? '/volunteer' : '/');
