import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type Role = 'super_admin' | 'admin' | 'management' | 'store_user';

export interface AppUser {
  id: string;
  access_id: string;
  name: string;
  role: Role;
  office_id: string | null;
  can_add: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_print: boolean;
  can_excel: boolean;
  can_delete_history?: boolean;
  can_clear_notifications?: boolean;
}

interface AuthContextType {
  user: AppUser | null;
  login: (accessId: string) => Promise<AppUser | null>;
  logout: () => void;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

const STORAGE_KEY = 'fgw_user';
const SESSION_KEY = 'fgw_session_id';
const HEARTBEAT_MS = 45_000; // 45s

const safeGet = (key: string) => {
  try { return window.localStorage.getItem(key); } catch { return null; }
};

const safeSet = (key: string, value: string) => {
  try { window.localStorage.setItem(key, value); } catch { /* ignore blocked storage */ }
};

const safeRemove = (key: string) => {
  try { window.localStorage.removeItem(key); } catch { /* ignore blocked storage */ }
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(() => {
    try {
      const stored = safeGet(STORAGE_KEY);
      return stored ? (JSON.parse(stored) as AppUser) : null;
    } catch { return null; }
  });
  const [isLoading, setIsLoading] = useState(false);
  const heartbeatRef = useRef<number | null>(null);

  const startSession = async (u: AppUser) => {
    try {
      const { data } = await supabase
        .from('user_sessions')
        .insert({ user_id: u.id, user_agent: navigator.userAgent })
        .select('id')
        .maybeSingle();
      if (data?.id) safeSet(SESSION_KEY, data.id);
    } catch { /* ignore */ }
  };

  const beat = async () => {
    const sid = safeGet(SESSION_KEY);
    if (!sid) return;
    try {
      await supabase.from('user_sessions').update({ last_seen_at: new Date().toISOString() }).eq('id', sid);
    } catch { /* ignore */ }
  };

  const endSession = async () => {
    const sid = safeGet(SESSION_KEY);
    if (!sid) return;
    try {
      await supabase.from('user_sessions').update({ logout_at: new Date().toISOString(), last_seen_at: new Date().toISOString() }).eq('id', sid);
    } catch { /* ignore */ }
    safeRemove(SESSION_KEY);
  };

  const hydrate = async (cached: AppUser) => {
    const { data } = await supabase
      .from('app_users')
      .select('*')
      .eq('id', cached.id)
      .eq('is_active', true)
      .maybeSingle();
    if (data) {
      const fresh: AppUser = data as AppUser;
      setUser(fresh);
      safeSet(STORAGE_KEY, JSON.stringify(fresh));
    }
  };

  // Heartbeat: while user is logged in, periodically update last_seen_at.
  // If no session row exists yet (e.g. after deploy update), create one.
  useEffect(() => {
    if (!user) return;
    (async () => {
      if (!safeGet(SESSION_KEY)) await startSession(user);
      beat();
    })();
    heartbeatRef.current = window.setInterval(beat, HEARTBEAT_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') beat(); };
    const onUnload = () => {
      const sid = safeGet(SESSION_KEY);
      if (!sid) return;
      // Best-effort beacon so last_seen_at updates on tab close.
      try {
        navigator.sendBeacon?.(
          `https://qlneyjfhknbetemnmlqx.supabase.co/rest/v1/user_sessions?id=eq.${sid}`,
          new Blob([JSON.stringify({ last_seen_at: new Date().toISOString() })], { type: 'application/json' }),
        );
      } catch { /* ignore */ }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [user?.id]);

  useEffect(() => {
    if (user) hydrate(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (accessId: string): Promise<AppUser | null> => {
    const { data, error } = await supabase
      .from('app_users')
      .select('*')
      .eq('access_id', accessId)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data) return null;
    const u = data as AppUser;
    setUser(u);
    safeSet(STORAGE_KEY, JSON.stringify(u));
    await startSession(u);
    return u;
  };

  const refresh = async () => {
    if (user) await hydrate(user);
  };

  const logout = () => {
    endSession();
    setUser(null);
    safeRemove(STORAGE_KEY);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading, refresh }}>
      {children}
    </AuthContext.Provider>
  );
};
