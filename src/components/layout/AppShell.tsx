import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import {
  Shield, LayoutDashboard, Radio, Users, UserCheck, HardDrive,
  Clock, Bell, School, Building2, KeyRound, Menu, X, LogOut, Wifi, WifiOff,
  BarChart3, Gauge, Zap, Activity, ClipboardList, Bot, Brain, UserCog, Tv,
  Settings, AlertTriangle, XCircle, MessageSquare, Moon, Sun
} from 'lucide-react';

const NAV_ITEMS: Record<string, { label: string; icon: React.ReactNode; path: string; roles: string[] }[]> = {
  principal: [
    { label: 'Dashboard', icon: <LayoutDashboard size={18} />, path: '/dashboard', roles: ['superadmin', 'integrator_admin', 'integrator_support', 'school_admin', 'coordinator', 'operator'] },
    { label: 'Cockpit Escolar', icon: <Gauge size={18} />, path: '/cockpit', roles: ['school_admin', 'coordinator'] },
    { label: 'Cockpit Integrador', icon: <BarChart3 size={18} />, path: '/cockpit-integrator', roles: ['integrator_admin', 'integrator_support', 'superadmin'] },
    { label: 'Cockpit Plataforma', icon: <BarChart3 size={18} />, path: '/cockpit-platform', roles: ['superadmin'] },
    { label: 'Eventos ao Vivo', icon: <Radio size={18} />, path: '/live-feed', roles: ['school_admin', 'coordinator', 'operator', 'integrator_admin'] },
    { label: 'IA Analytics', icon: <Brain size={18} />, path: '/ai-reports', roles: ['superadmin', 'integrator_admin', 'integrator_support', 'school_admin', 'coordinator'] },
  ],
  escola: [
    { label: 'Alunos', icon: <Users size={18} />, path: '/students', roles: ['school_admin', 'coordinator', 'integrator_admin', 'superadmin'] },
    { label: 'Dispositivos', icon: <HardDrive size={18} />, path: '/devices', roles: ['school_admin', 'integrator_admin', 'integrator_support', 'superadmin'] },
    { label: 'Edges', icon: <Shield size={18} />, path: '/edges', roles: ['integrator_admin', 'integrator_support', 'superadmin'] },
    { label: 'WhatsApp Escolar', icon: <MessageSquare size={18} />, path: '/whatsapp', roles: ['school_admin', 'integrator_admin', 'integrator_support', 'superadmin'] },
    { label: 'Histórico', icon: <Clock size={18} />, path: '/history', roles: ['school_admin', 'coordinator', 'operator', 'integrator_admin', 'superadmin'] },
    { label: 'Notificações', icon: <Bell size={18} />, path: '/notifications', roles: ['school_admin', 'coordinator', 'integrator_admin', 'superadmin'] },
  ],
  gestao: [
    { label: 'Onboarding', icon: <Zap size={18} />, path: '/onboarding', roles: ['integrator_admin', 'superadmin'] },
    { label: 'Escolas', icon: <School size={18} />, path: '/schools', roles: ['integrator_admin', 'superadmin'] },
    // Gestão de Parceiros unifies: Integradores + Licenças + Usuários + Documentos Bloqueados
    { label: 'Gestão de Parceiros', icon: <Building2 size={18} />, path: '/partner-management', roles: ['superadmin'] },
    { label: 'Configurações da Plataforma', icon: <Settings size={18} />, path: '/platform-settings', roles: ['superadmin'] },
    { label: 'Diagnóstico Nível 3', icon: <Activity size={18} />, path: '/device-diagnostics', roles: ['integrator_admin', 'integrator_support', 'superadmin'] },
    { label: 'Audit Trail', icon: <ClipboardList size={18} />, path: '/audit-trail', roles: ['integrator_admin', 'integrator_support', 'superadmin'] },
    { label: 'Ops Center', icon: <Shield size={18} />, path: '/ops-center', roles: ['superadmin', 'integrator_admin', 'integrator_support', 'school_admin', 'coordinator'] },
    { label: 'Dispositivos Virtuais', icon: <Bot size={18} />, path: '/virtual-devices', roles: ['integrator_admin', 'integrator_support', 'superadmin', 'school_admin'] },
    { label: 'TV Panels', icon: <Tv size={18} />, path: '/tv-panels', roles: ['superadmin', 'integrator_admin', 'school_admin'] },
    { label: 'Usuários', icon: <UserCog size={18} />, path: '/users', roles: ['integrator_admin', 'integrator_support', 'school_admin', 'coordinator'] },
  ],
};

const SECTION_LABELS: Record<string, string> = {
  principal: 'Principal',
  escola: 'Escola',
  gestao: 'Gestão',
};

interface BillingBanner {
  status: 'warning' | 'blocked';
  note: string | null;
  billingBlockAt: string | null;
}

function useBillingBanner(profile: { role: string; schoolId: string | null } | null, token: string | null): BillingBanner | null {
  const [banner, setBanner] = useState<BillingBanner | null>(null);

  useEffect(() => {
    if (profile?.role !== 'school_admin' || !profile.schoolId || !token) return;
    fetch(`/api/schools/${profile.schoolId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const s = data?.school;
        if (s && (s.billingStatus === 'warning' || s.billingStatus === 'blocked')) {
          setBanner({ status: s.billingStatus, note: s.billingNote, billingBlockAt: s.billingBlockAt });
        }
      })
      .catch(() => {});
  }, [profile?.schoolId, token]);

  return banner;
}

export default function AppShell() {
  const { profile, logout, token } = useAuth();
  const { isConnected } = useSocket();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  const role = profile?.role || '';
  const billingBanner = useBillingBanner(profile, token);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const toggleDarkMode = () => {
    const isNowDark = document.documentElement.classList.toggle('dark');
    setIsDark(isNowDark);
    localStorage.setItem('theme', isNowDark ? 'dark' : 'light');
  };

  const linkStyle = (isActive: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
    borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: isActive ? 600 : 500,
    color: isActive ? 'var(--color-primary-700)' : 'var(--color-text-secondary)',
    background: isActive ? 'var(--color-primary-50)' : 'transparent',
    textDecoration: 'none', transition: 'all 0.15s ease',
    cursor: 'pointer',
  });

  const renderNav = () => (
    <>
      {Object.entries(NAV_ITEMS).map(([section, items]) => {
        const visible = items.filter(i => i.roles.includes(role));
        if (visible.length === 0) return null;
        return (
          <div key={section} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)', padding: '0 14px', marginBottom: 6 }}>
              {SECTION_LABELS[section]}
            </div>
            {visible.map(item => (
              <NavLink key={item.path} to={item.path} onClick={() => setSidebarOpen(false)}
                style={({ isActive }) => linkStyle(isActive)}>
                {item.icon}
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        );
      })}
    </>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg)' }}>
      {/* Overlay mobile */}
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 40 }} />
      )}

      {/* Sidebar */}
      <aside style={{
        width: 260, minHeight: '100vh', background: 'var(--color-surface)',
        borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column',
        position: 'fixed', left: sidebarOpen ? 0 : -260, top: 0, zIndex: 50,
        transition: 'left 0.25s ease', boxShadow: sidebarOpen ? 'var(--shadow-lg)' : 'none',
      }} className="sidebar-desktop">
        {/* Brand */}
        <div style={{ padding: '20px 18px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--color-border)' }}>
          <div style={{
            width: 36, height: 36, borderRadius: 'var(--radius-sm)',
            background: 'linear-gradient(135deg, var(--color-primary-600), var(--color-primary-800))',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Shield size={18} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-primary-800)', lineHeight: 1.2 }}>Acesso Escolar</div>
            <div style={{ fontSize: 10, color: 'var(--color-text-muted)', fontWeight: 500 }}>Painel de Controle</div>
          </div>
          <button onClick={() => setSidebarOpen(false)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'none' }}
            className="sidebar-close-btn">
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '16px 8px', overflowY: 'auto' }}>
          {renderNav()}
        </nav>

        {/* User + Status */}
        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ position: 'relative' }}>
              {isConnected ? <Wifi size={14} color="var(--color-success)" /> : <WifiOff size={14} color="var(--color-danger)" />}
            </div>
            <span style={{ fontSize: 11, color: isConnected ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 500 }}>
              {isConnected ? 'Conectado' : 'Desconectado'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--color-primary-100)', color: 'var(--color-primary-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
              {profile?.name?.charAt(0)?.toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile?.name}</div>
              <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{profile?.role?.replace('_', ' ')}</div>
            </div>
            <button onClick={toggleDarkMode} title="Alternar Tema"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }}>
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button onClick={handleLogout} title="Sair"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }}>
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div style={{ flex: 1, marginLeft: 0, minWidth: 0 }} className="main-content">
        {/* Top bar (mobile) */}
        <header style={{
          height: 56, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 12,
          background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)',
          position: 'sticky', top: 0, zIndex: 30,
        }}>
          <button onClick={() => setSidebarOpen(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text)', padding: 4 }}>
            <Menu size={20} />
          </button>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-primary-800)' }}>Acesso Escolar</div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={toggleDarkMode} title="Alternar Tema"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text)', padding: 4 }}>
              {isDark ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            {isConnected
              ? <span className="badge badge-success" style={{ fontSize: 11 }}>● Online</span>
              : <span className="badge badge-danger" style={{ fontSize: 11 }}>● Offline</span>
            }
          </div>
        </header>

        {/* Billing banner (school_admin only) */}
        {billingBanner && (
          <div style={{
            background: billingBanner.status === 'blocked' ? 'var(--color-danger)' : '#f97316',
            color: '#fff',
            padding: '10px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 13,
            fontWeight: 500,
          }}>
            {billingBanner.status === 'blocked'
              ? <XCircle size={16} />
              : <AlertTriangle size={16} />
            }
            {billingBanner.status === 'blocked'
              ? <>
                  <strong>Escola bloqueada por inadimplência.</strong>
                  {billingBanner.note && <span> {billingBanner.note}</span>}
                  <span> Entre em contato com seu integrador para regularizar.</span>
                </>
              : <>
                  <strong>Atenção:</strong>
                  <span>
                    {billingBanner.note || 'Há uma pendência financeira com seu integrador.'}
                    {billingBanner.billingBlockAt && (
                      <> Bloqueio previsto para <strong>{new Date(billingBanner.billingBlockAt).toLocaleDateString('pt-BR')}</strong>.</>
                    )}
                  </span>
                </>
            }
          </div>
        )}

        {/* Page content */}
        <main style={{ padding: '24px 20px', maxWidth: 1400, margin: '0 auto' }}>
          <Outlet />
        </main>
      </div>

      {/* CSS for responsive sidebar */}
      <style>{`
        @media (min-width: 1024px) {
          .sidebar-desktop { left: 0 !important; box-shadow: none !important; }
          .sidebar-close-btn { display: none !important; }
          .main-content { margin-left: 260px !important; }
          .main-content header { display: none !important; }
        }
        @media (max-width: 1023px) {
          .sidebar-close-btn { display: block !important; }
        }
      `}</style>
    </div>
  );
}
