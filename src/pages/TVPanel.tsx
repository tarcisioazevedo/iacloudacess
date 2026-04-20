import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { Shield, Wifi, WifiOff, LogIn, LogOut } from 'lucide-react';

interface TVConfig {
  displayName: string;
  schoolName: string;
  schoolId: string;
  logoPath: string | null;
  welcomeMessage: string | null;
  themeColor: string;
  showPhoto: boolean;
  showClassGroup: boolean;
  showClock: boolean;
  autoHideSeconds: number;
  maxVisibleCards: number;
  filterDirection: string | null;
}

interface TVEvent {
  id: string;
  studentName: string;
  classGroup: string;
  grade: string;
  shift: string;
  enrollment: string;
  photoPath: string | null;
  direction: string;
  status: string;
  method: string;
  deviceLocation: string;
  occurredAt: string;
  _addedAt?: number;
}

interface TVStats {
  totalEntries: number;
  studentsPresent: number;
  totalStudents: number;
  attendanceRate: number;
}

export default function TVPanel() {
  const { accessToken } = useParams<{ accessToken: string }>();
  const [config, setConfig] = useState<TVConfig | null>(null);
  const [events, setEvents] = useState<TVEvent[]>([]);
  const [stats, setStats] = useState<TVStats>({ totalEntries: 0, studentsPresent: 0, totalStudents: 0, attendanceRate: 0 });
  const [connected, setConnected] = useState(false);
  const [clock, setClock] = useState(new Date());
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Clock
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Load config
  useEffect(() => {
    if (!accessToken) return;
    fetch(`/api/tv/config/${accessToken}`)
      .then(r => { if (!r.ok) throw new Error('Token inválido'); return r.json(); })
      .then(data => setConfig(data))
      .catch(err => setError(err.message));
  }, [accessToken]);

  // Load initial events
  useEffect(() => {
    if (!accessToken || !config) return;
    fetch(`/api/tv/recent/${accessToken}?limit=${config.maxVisibleCards * 2}`)
      .then(r => r.json())
      .then(data => {
        setEvents(data.events.map((e: TVEvent) => ({ ...e, _addedAt: Date.now() })));
        setStats(data.stats);
      })
      .catch(() => {});
  }, [accessToken, config]);

  // Socket.io connection
  useEffect(() => {
    if (!config?.schoolId || !accessToken) return;

    const s = io(window.location.origin, {
      auth: { token: `tv_${accessToken}` },
      query: { schoolId: config.schoolId },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: Infinity,
    });

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));

    s.on('access:new', (data: any) => {
      const newEvent: TVEvent = {
        id: data.id,
        studentName: data.studentName || 'Não identificado',
        classGroup: data.classGroup || '',
        grade: data.grade || '',
        shift: data.shift || '',
        enrollment: data.enrollment || '',
        photoPath: data.photoPath || null,
        direction: data.direction || 'entry',
        status: data.status || 'granted',
        method: data.method || '',
        deviceLocation: data.deviceLocation || '',
        occurredAt: data.occurredAt || new Date().toISOString(),
        _addedAt: Date.now(),
      };

      setEvents(prev => [newEvent, ...prev].slice(0, (config?.maxVisibleCards || 6) * 2));
      setStats(prev => ({
        ...prev,
        totalEntries: prev.totalEntries + (data.direction === 'entry' ? 1 : 0),
      }));
    });

    socketRef.current = s;
    return () => { s.disconnect(); socketRef.current = null; };
  }, [config, accessToken]);

  // Auto-hide old cards
  const removeOldEvents = useCallback(() => {
    if (!config) return;
    const maxAge = config.autoHideSeconds * 1000;
    setEvents(prev => prev.filter(e => Date.now() - (e._addedAt || 0) < maxAge * 3));
  }, [config]);

  useEffect(() => {
    const timer = setInterval(removeOldEvents, 5000);
    return () => clearInterval(timer);
  }, [removeOldEvents]);

  // Format time
  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatClockTime = () => {
    return clock.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = () => {
    return clock.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  // Error state
  if (error) {
    return (
      <div className="tv-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <Shield size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
          <div style={{ fontSize: 20, fontWeight: 700 }}>TV Panel Indisponível</div>
          <div style={{ fontSize: 14, opacity: 0.5, marginTop: 8 }}>{error}</div>
        </div>
      </div>
    );
  }

  // Loading
  if (!config) {
    return (
      <div className="tv-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="animate-spin" style={{ width: 40, height: 40, border: '3px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', borderRadius: '50%' }} />
      </div>
    );
  }

  const visibleEvents = events.slice(0, config.maxVisibleCards);

  return (
    <div className="tv-panel">
      {/* Header */}
      <div className="tv-panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 'var(--radius-md)',
            background: `linear-gradient(135deg, ${config.themeColor}, ${config.themeColor}cc)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Shield size={22} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>{config.displayName}</div>
            <div style={{ fontSize: 12, opacity: 0.5, textTransform: 'capitalize' }}>{formatDate()}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          {/* Connection status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            {connected
              ? <><Wifi size={14} color="#22c55e" /><span style={{ color: '#22c55e' }}>Ao Vivo</span></>
              : <><WifiOff size={14} color="#dc2626" /><span style={{ color: '#dc2626' }}>Reconectando</span></>
            }
          </div>
          {/* Clock */}
          {config.showClock && (
            <div style={{ fontSize: 36, fontWeight: 800, fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em', opacity: 0.9 }}>
              {formatClockTime()}
            </div>
          )}
        </div>
      </div>

      {/* Events Grid */}
      <div className="tv-panel-grid" style={{ paddingBottom: 100 }}>
        {visibleEvents.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '80px 0', opacity: 0.3 }}>
            <Shield size={64} style={{ marginBottom: 16 }} />
            <div style={{ fontSize: 18, fontWeight: 600 }}>
              {config.welcomeMessage || 'Aguardando eventos de acesso...'}
            </div>
          </div>
        ) : (
          visibleEvents.map((event) => (
            <div
              key={event.id}
              className={`tv-event-card ${event.direction}`}
            >
              {/* Photo */}
              <div className="tv-event-photo" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 28, fontWeight: 800, color: 'rgba(255,255,255,0.3)',
              }}>
                {event.photoPath ? (
                  <img
                    src={event.photoPath}
                    alt={event.studentName}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius-lg)' }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  event.studentName.charAt(0).toUpperCase()
                )}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="tv-event-name">{event.studentName}</div>
                {config.showClassGroup && event.classGroup && (
                  <div className="tv-event-meta">
                    {event.grade} • Turma {event.classGroup}
                    {event.shift ? ` • ${event.shift}` : ''}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                    background: event.direction === 'entry' ? 'rgba(34,197,94,0.15)' : 'rgba(59,130,246,0.15)',
                    color: event.direction === 'entry' ? '#22c55e' : '#3b82f6',
                  }}>
                    {event.direction === 'entry' ? <LogIn size={12} /> : <LogOut size={12} />}
                    {event.direction === 'entry' ? 'Entrada' : 'Saída'}
                  </span>
                  <span className="tv-event-time">{formatTime(event.occurredAt)}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer Stats */}
      <div className="tv-panel-footer">
        <div className="tv-stat">
          <div className="tv-stat-value" style={{ color: '#22c55e' }}>{stats.totalEntries}</div>
          <div className="tv-stat-label">Entradas Hoje</div>
        </div>
        <div className="tv-stat">
          <div className="tv-stat-value">{stats.studentsPresent}</div>
          <div className="tv-stat-label">Alunos Presentes</div>
        </div>
        <div className="tv-stat">
          <div className="tv-stat-value" style={{ color: config.themeColor }}>{stats.attendanceRate}%</div>
          <div className="tv-stat-label">Presença</div>
        </div>
      </div>
    </div>
  );
}
