import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { Users, Radio, HardDrive, Bell, TrendingUp, ArrowUpRight, Clock } from 'lucide-react';

interface Stats {
  totalStudents: number;
  todayEvents: number;
  devicesOnline: number;
  pendingNotifications: number;
}

export default function Dashboard() {
  const { profile, token } = useAuth();
  const { isConnected, lastEvent } = useSocket();
  const [stats, setStats] = useState<Stats>({ totalStudents: 0, todayEvents: 0, devicesOnline: 0, pendingNotifications: 0 });
  const [recentEvents, setRecentEvents] = useState<any[]>([]);

  useEffect(() => {
    if (!token) return;
    const h = { Authorization: `Bearer ${token}` };

    fetch('/api/students', { headers: h })
      .then(r => r.json()).then(d => setStats(s => ({ ...s, totalStudents: d.students?.length || 0 })))
      .catch(() => {});

    fetch('/api/events?limit=5', { headers: h })
      .then(r => r.json()).then(d => { setRecentEvents(d.events || []); setStats(s => ({ ...s, todayEvents: d.total || 0 })); })
      .catch(() => {});

    fetch('/api/devices', { headers: h })
      .then(r => r.json()).then(d => {
        const online = (d.devices || []).filter((dev: any) => dev.status === 'online').length;
        setStats(s => ({ ...s, devicesOnline: online }));
      }).catch(() => {});

    // Pending notifications count from the stats endpoint
    fetch('/api/notifications/stats', { headers: h })
      .then(r => r.json()).then(d => setStats(s => ({ ...s, pendingNotifications: d.pending || 0 })))
      .catch(() => {});
  }, [token]);

  // Add real-time events to the list
  useEffect(() => {
    if (lastEvent) {
      setRecentEvents(prev => [lastEvent, ...prev.slice(0, 4)]);
      setStats(s => ({ ...s, todayEvents: s.todayEvents + 1 }));
    }
  }, [lastEvent]);

  const cards = [
    { label: 'Alunos Ativos', value: stats.totalStudents, icon: <Users size={20} />, color: 'var(--color-primary-600)', bg: 'var(--color-primary-50)' },
    { label: 'Eventos Hoje', value: stats.todayEvents, icon: <Radio size={20} />, color: 'var(--color-success)', bg: 'var(--color-success-bg)' },
    { label: 'Devices Online', value: stats.devicesOnline, icon: <HardDrive size={20} />, color: 'var(--color-warning)', bg: 'var(--color-warning-bg)' },
    { label: 'Notificações', value: stats.pendingNotifications, icon: <Bell size={20} />, color: '#8b5cf6', bg: '#f5f3ff' },
  ];

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  return (
    <div className="animate-fade-in-up">
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>
          {greeting()}, {profile?.name?.split(' ')[0]} 👋
        </h1>
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginTop: 4 }}>
          Visão geral da operação em tempo real
        </p>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 28 }}>
        {cards.map((card, i) => (
          <div key={i} style={{
            background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)',
            padding: '20px 22px', boxShadow: 'var(--shadow-sm)',
            border: '1px solid var(--color-border)', transition: 'box-shadow 0.2s',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{card.label}</div>
                <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1 }}>{card.value}</div>
              </div>
              <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: card.bg, color: card.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {card.icon}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 12, fontSize: 12, color: 'var(--color-success)', fontWeight: 500 }}>
              <TrendingUp size={14} />
              <span>Atualizado em tempo real</span>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Events */}
      <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Últimos Eventos</h2>
          <a href="/live-feed" style={{ fontSize: 12, color: 'var(--color-primary-600)', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            Ver todos <ArrowUpRight size={14} />
          </a>
        </div>
        {recentEvents.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
            Nenhum evento registrado ainda
          </div>
        ) : (
          <div>
            {recentEvents.map((event, i) => (
              <div key={event.id || i} style={{
                padding: '12px 20px', borderBottom: i < recentEvents.length - 1 ? '1px solid var(--color-border)' : 'none',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: event.status === 'granted' ? 'var(--color-success)' : event.status === 'denied' ? 'var(--color-danger)' : 'var(--color-warning)',
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{event.studentName || event.student?.name || 'Não identificado'}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                    {event.method || 'Face'} • {event.deviceLocation || event.device?.location || event.device?.name || ''}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--color-text-muted)', flexShrink: 0 }}>
                  <Clock size={12} />
                  {new Date(event.occurredAt || event.occurred_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </div>
                <span className={`badge ${event.status === 'granted' ? 'badge-success' : event.status === 'denied' ? 'badge-danger' : 'badge-warning'}`}>
                  {event.direction === 'entry' ? 'Entrada' : event.direction === 'exit' ? 'Saída' : event.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
