import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface Profile {
  id: string;
  email: string;
  name: string;
  role: string;
  integratorId: string | null;
  schoolId: string | null;
}

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  isDemo: boolean;
  profile: Profile | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setAuthFromRegistration: (accessToken: string, profile: Profile) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// ── Demo profiles (used when API is unreachable) ──
const DEMO_PROFILES: Record<string, Profile> = {
  'admin@plataforma.com': { id: 'demo-1', email: 'admin@plataforma.com', name: 'Administrador Global', role: 'superadmin', integratorId: null, schoolId: null },
  'integrador@techseg.com': { id: 'demo-2', email: 'integrador@techseg.com', name: 'Carlos (Integrador)', role: 'integrator_admin', integratorId: 'int-1', schoolId: null },
  'diretor@colegio.com': { id: 'demo-3', email: 'diretor@colegio.com', name: 'Maria Silva (Diretora)', role: 'school_admin', integratorId: 'int-1', schoolId: 'sch-1' },
  'coord@colegio.com': { id: 'demo-4', email: 'coord@colegio.com', name: 'Ana Costa (Coordenadora)', role: 'coordinator', integratorId: 'int-1', schoolId: 'sch-1' },
  'portaria@colegio.com': { id: 'demo-5', email: 'portaria@colegio.com', name: 'João Porteiro', role: 'operator', integratorId: 'int-1', schoolId: 'sch-1' },
};
const DEMO_PASSWORD = 'admin123';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);

  // Try to restore session on mount
  useEffect(() => {
    const isDemoModeEnabled = (import.meta as any).env?.VITE_DEMO_MODE === 'true';
    const storedProfile = localStorage.getItem('demo_profile');
    if (storedProfile && isDemoModeEnabled) {
      try {
        setProfile(JSON.parse(storedProfile));
        setToken('demo-token');
        setIsDemo(true);
      } catch {}
      setIsLoading(false);
      return;
    } else if (storedProfile && !isDemoModeEnabled) {
      localStorage.removeItem('demo_profile');
    }

    const stored = localStorage.getItem('auth_token');
    if (stored) {
      setToken(stored);
      fetchProfile(stored).finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const fetchProfile = async (accessToken: string) => {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProfile(data.profile);
      } else {
        localStorage.removeItem('auth_token');
        setToken(null);
        setProfile(null);
      }
    } catch {
      localStorage.removeItem('auth_token');
      setToken(null);
      setProfile(null);
    }
  };

  const login = useCallback(async (email: string, password: string) => {
    // Demo mode is ONLY available when explicitly enabled via VITE_DEMO_MODE=true.
    // It must NEVER auto-activate on production API failures (security rule).
    const metaEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
    const isDemoModeEnabled = metaEnv?.VITE_DEMO_MODE === 'true';

    const tryDemoFallback = (): boolean => {
      if (!isDemoModeEnabled) return false;
      const demoProfile = DEMO_PROFILES[email.toLowerCase()];
      if (demoProfile && password === DEMO_PASSWORD) {
        setToken('demo-token');
        setProfile(demoProfile);
        setIsDemo(true);
        localStorage.setItem('demo_profile', JSON.stringify(demoProfile));
        return true;
      }
      return false;
    };

    // 1. Try real API first
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        const data = await res.json();
        setToken(data.accessToken);
        setProfile(data.profile);
        setIsDemo(false);
        localStorage.setItem('auth_token', data.accessToken);
        return;
      }
      if (res.status === 401) {
        // In demo mode: wrong real credentials may still match a demo profile
        if (isDemoModeEnabled && tryDemoFallback()) return;
        throw new Error('Credenciais inválidas');
      }
      if (res.status >= 500) {
        // Server error — never silently fall into demo on production
        if (isDemoModeEnabled && tryDemoFallback()) return;
        throw new Error('Servidor indisponível. Tente novamente em instantes.');
      }
      throw new Error('Erro ao autenticar');
    } catch (err: any) {
      // 2. Network error — API unreachable
      if (err.message === 'Credenciais inválidas') throw err;
      if (err.message?.startsWith('Servidor')) throw err;
      // In demo mode only: allow offline use with demo credentials
      if (isDemoModeEnabled && tryDemoFallback()) return;
      throw new Error('Não foi possível conectar ao servidor. Verifique sua conexão.');
    }
  }, []);

  const setAuthFromRegistration = useCallback((accessToken: string, registeredProfile: Profile) => {
    localStorage.setItem('auth_token', accessToken);
    setToken(accessToken);
    setProfile(registeredProfile);
    setIsDemo(false);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('demo_profile');
    setToken(null);
    setProfile(null);
    setIsDemo(false);
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: !!profile,
        isLoading,
        isDemo,
        profile,
        token,
        login,
        logout,
        setAuthFromRegistration,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
