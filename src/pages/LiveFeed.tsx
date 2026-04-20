import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { Radio, User, Clock, DoorOpen, Camera, ChevronRight, X } from 'lucide-react';

interface LiveEvent {
  id: string;
  studentName: string;
  method: string;
  direction: string;
  status: string;
  deviceLocation: string;
  occurredAt: string;
  classGroup?: string;
  enrollment?: string;
  photoUrl?: string;
}

export default function LiveFeed() {
  const { token } = useAuth();
  const { lastEvent, isConnected } = useSocket();
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [selected, setSelected] = useState<LiveEvent | null>(null);
  const hasLoadedRef = useRef(false);

  // Load initial events
  useEffect(() => {
    if (!token || hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    fetch('/api/events?limit=30', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        setEvents((d.events || []).map((e: any) => ({
          id: e.id,
          studentName: e.student?.name || e.studentName || 'Não identificado',
          method: e.method || '',
          direction: e.direction || '',
          status: e.status || '',
          deviceLocation: e.device?.location || e.device?.name || e.deviceLocation || '',
          occurredAt: e.occurredAt || e.occurred_at,
          classGroup: e.student?.classGroup || e.classGroup || '',
          enrollment: e.student?.enrollment || e.enrollment || '',
          photoUrl: e.student?.photo?.base64Optimized
            ? `data:image/jpeg;base64,${e.student.photo.base64Optimized}`
            : e.photoUrl || null,
        })));
      })
      .catch(() => {});
  }, [token]);

  // Add real-time events
  useEffect(() => {
    if (lastEvent) {
      setEvents(prev => [lastEvent, ...prev].slice(0, 100));
    }
  }, [lastEvent]);

  const methodIcon = (m: string) => {
    if (m?.toLowerCase().includes('face')) return <Camera size={14} />;
    return <DoorOpen size={14} />;
  };

  return (
    <div className="animate-fade-in-up">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Radio size={22} style={{ color: isConnected ? 'var(--color-success)' : 'var(--color-danger)' }} />
            Eventos ao Vivo
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 4 }}>
            {events.length} eventos • Atualização em tempo real
          </p>
        </div>
        <span className={`badge ${isConnected ? 'badge-success' : 'badge-danger'}`} style={{ position: 'relative' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
          {isConnected ? 'Ao Vivo' : 'Desconectado'}
        </span>
      </div>

      {/* Events list */}
      <div style={{ display: 'flex', gap: 20 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {events.length === 0 ? (
            <div style={{
              border: '2px dashed var(--color-border)', borderRadius: 'var(--radius-lg)',
              padding: '60px 20px', textAlign: 'center', color: 'var(--color-text-muted)',
            }}>
              <Radio size={36} style={{ marginBottom: 12, opacity: 0.3 }} />
              <div style={{ fontSize: 14, fontWeight: 600 }}>Aguardando eventos...</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Quando alguém acessar o dispositivo, o evento aparecerá aqui instantaneamente</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {events.map((event, i) => (
                <div
                  key={event.id || i}
                  onClick={() => setSelected(event)}
                  className={i === 0 && lastEvent?.id === event.id ? 'animate-fade-in-up' : ''}
                  style={{
                    background: 'var(--color-surface)', borderRadius: 'var(--radius-md)',
                    border: `1.5px solid ${selected?.id === event.id ? 'var(--color-primary-400)' : 'var(--color-border)'}`,
                    padding: '14px 18px', cursor: 'pointer', transition: 'all 0.15s',
                    display: 'flex', alignItems: 'center', gap: 14,
                  }}
                >
                  {/* Student photo or status avatar */}
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                    border: `2px solid ${event.status === 'granted' ? 'var(--color-success)' : event.status === 'denied' ? 'var(--color-danger)' : 'var(--color-warning)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: event.status === 'granted'
                      ? 'var(--color-success-bg)' : event.status === 'denied'
                      ? 'var(--color-danger-bg)' : 'var(--color-warning-bg)',
                    color: event.status === 'granted'
                      ? '#15803d' : event.status === 'denied'
                      ? 'var(--color-danger)' : 'var(--color-warning)',
                  }}>
                    {event.photoUrl
                      ? <img src={event.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <User size={18} />
                    }
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{event.studentName}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>{methodIcon(event.method)} {event.method || 'Face'}</span>
                      <span>• {event.deviceLocation}</span>
                      {event.classGroup && <span>• {event.classGroup}</span>}
                    </div>
                  </div>

                  {/* Time + status */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                      <Clock size={12} />
                      {new Date(event.occurredAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>
                    <span className={`badge ${event.direction === 'entry' ? 'badge-success' : event.direction === 'exit' ? 'badge-neutral' : 'badge-warning'}`} style={{ marginTop: 4 }}>
                      {event.direction === 'entry' ? '↗ Entrada' : event.direction === 'exit' ? '↙ Saída' : event.status}
                    </span>
                  </div>

                  <ChevronRight size={16} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail drawer (desktop) */}
        {selected && (
          <div style={{
            width: 340, flexShrink: 0, background: 'var(--color-surface)',
            borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)',
            padding: 24, position: 'sticky', top: 80, alignSelf: 'flex-start',
          }} className="animate-fade-in-up">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Detalhes</h3>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><X size={18} /></button>
            </div>

            {/* Student photo */}
            <div style={{
              width: '100%', aspectRatio: '3/4', borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, var(--color-primary-50), var(--color-primary-100))',
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
              overflow: 'hidden',
              border: `3px solid ${selected.status === 'granted' ? 'var(--color-success)' : selected.status === 'denied' ? 'var(--color-danger)' : 'var(--color-warning)'}`,
            }}>
              {selected.photoUrl
                ? <img src={selected.photoUrl} alt={selected.studentName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <User size={64} color="var(--color-primary-300)" />
              }
            </div>

            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{selected.studentName}</div>
            {selected.enrollment && <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 16 }}>Matrícula: {selected.enrollment}</div>}

            {[
              { label: 'Método', value: selected.method || 'Face' },
              { label: 'Dispositivo', value: selected.deviceLocation },
              { label: 'Direção', value: selected.direction === 'entry' ? 'Entrada' : 'Saída' },
              { label: 'Status', value: selected.status },
              { label: 'Horário', value: new Date(selected.occurredAt).toLocaleString('pt-BR') },
              { label: 'Turma', value: selected.classGroup || '—' },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{row.label}</span>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{row.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
