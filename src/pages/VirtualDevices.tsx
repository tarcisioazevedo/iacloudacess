import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  Bot, Play, Square, Zap, Trash2, RefreshCw, PlusCircle,
  Activity, AlertCircle, CheckCircle2,
} from 'lucide-react';

interface VirtualDevice {
  id: string;
  name: string;
  location?: string;
  status: string;
  simulationRunning: boolean;
  eventCount: number;
  lastHeartbeat?: string;
  lastEventAt?: string;
  schoolUnit?: { name: string; school?: { name: string } };
}

export default function VirtualDevices() {
  const { token, profile } = useAuth();
  const [devices, setDevices] = useState<VirtualDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', location: '', intervalMs: 30 });
  const [schoolUnits, setSchoolUnits] = useState<{ id: string; name: string }[]>([]);
  const [selectedUnit, setSelectedUnit] = useState('');
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/virtual-devices', { headers });
      const d = await r.json();
      setDevices(d.devices || []);
    } finally {
      setLoading(false);
    }
  };

  const loadUnits = async () => {
    const r = await fetch('/api/school-units', { headers });
    const d = await r.json();
    setSchoolUnits(d.schoolUnits || d.units || []);
  };

  useEffect(() => { load(); loadUnits(); }, [token]);

  const action = async (url: string, method = 'POST', body?: object) => {
    setActionLoading(url);
    try {
      const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
      const d = await r.json();
      if (r.ok) {
        showToast(d.message || 'Operação concluída ✓');
        await load();
      } else {
        showToast(d.message || 'Erro ao executar', false);
      }
    } catch (e: any) {
      showToast(e.message, false);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreate = async () => {
    if (!form.name || !selectedUnit) {
      showToast('Preencha nome e unidade', false); return;
    }
    await action('/api/devices', 'POST', {
      schoolUnitId: selectedUnit,
      name: form.name,
      location: form.location,
      ipAddress: '127.0.0.1', // placeholder for virtual
      isVirtual: true,
      simulatorIntervalMs: form.intervalMs * 1000,
    });
    setShowCreate(false);
    setForm({ name: '', location: '', intervalMs: 30 });
  };

  return (
    <div className="animate-fade-in-up">
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: toast.ok ? '#22c55e' : '#dc2626',
          color: '#fff', padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {toast.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Bot size={22} color="var(--color-primary-500)" /> Dispositivos Virtuais
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 2 }}>
            Simule catracas Intelbras para testar o fluxo completo de eventos, notificações e relatórios
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={load} style={btnStyle}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
          </button>
          <button onClick={() => setShowCreate(true)} style={{ ...btnStyle, background: 'var(--color-primary-600)', color: '#fff', border: 'none' }}>
            <PlusCircle size={14} /> Novo Dispositivo Virtual
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(46,129,173,0.08), rgba(46,129,173,0.03))',
        border: '1px solid rgba(46,129,173,0.25)', borderRadius: 'var(--radius-lg)',
        padding: '14px 20px', marginBottom: 20, fontSize: 13, color: 'var(--color-text-secondary)',
        display: 'flex', alignItems: 'flex-start', gap: 12,
      }}>
        <Activity size={18} color="var(--color-primary-500)" style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <strong style={{ color: 'var(--color-text)' }}>Como funciona:</strong> Dispositivos virtuais geram eventos de acesso reais no banco de dados,
          disparam notificações WhatsApp/E-mail para responsáveis, alimentam o Dashboard e o Histórico —
          tudo sem necessidade de hardware físico. Perfeito para onboarding de novas escolas.
        </div>
      </div>

      {/* Create form modal */}
      {showCreate && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 900,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowCreate(false)}>
          <div style={{
            background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)',
            padding: 28, width: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 700 }}>
              <Bot size={18} color="var(--color-primary-500)" /> Criar Dispositivo Virtual
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label style={labelStyle}>
                Nome do dispositivo
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: Catraca Entrada Virtual" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Localização (opcional)
                <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                  placeholder="Ex: Portão Principal" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Unidade Escolar
                <select value={selectedUnit} onChange={e => setSelectedUnit(e.target.value)} style={inputStyle}>
                  <option value="">Selecione a unidade...</option>
                  {schoolUnits.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </label>
              <label style={labelStyle}>
                Intervalo entre eventos: <strong>{form.intervalMs}s</strong>
                <input type="range" min={10} max={300} step={5} value={form.intervalMs}
                  onChange={e => setForm(f => ({ ...f, intervalMs: Number(e.target.value) }))}
                  style={{ width: '100%', marginTop: 6 }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-text-muted)' }}>
                  <span>10s (rápido)</span><span>300s (realista)</span>
                </div>
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCreate(false)} style={btnStyle}>Cancelar</button>
              <button onClick={handleCreate} style={{ ...btnStyle, background: 'var(--color-primary-600)', color: '#fff', border: 'none' }}>
                <Bot size={14} /> Criar e Iniciar Simulação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Device cards */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>Carregando dispositivos virtuais...</div>
      ) : devices.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '60px 20px',
          background: 'var(--color-surface)', border: '2px dashed var(--color-border)',
          borderRadius: 'var(--radius-lg)',
        }}>
          <Bot size={48} color="var(--color-primary-400)" style={{ margin: '0 auto 16px', opacity: 0.6 }} />
          <h3 style={{ fontWeight: 700, marginBottom: 8 }}>Nenhum dispositivo virtual criado</h3>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', maxWidth: 400, margin: '0 auto 20px' }}>
            Crie um dispositivo virtual para simular o fluxo completo de acessos sem hardware físico.
          </p>
          <button onClick={() => setShowCreate(true)} style={{ ...btnStyle, background: 'var(--color-primary-600)', color: '#fff', border: 'none', padding: '10px 22px' }}>
            <PlusCircle size={16} /> Criar primeiro dispositivo virtual
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {devices.map(device => (
            <div key={device.id} style={{
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)', padding: 20, position: 'relative',
              borderTop: `3px solid ${device.simulationRunning ? 'var(--color-success)' : 'var(--color-border-strong)'}`,
            }}>
              {/* Status badge */}
              <div style={{ position: 'absolute', top: 14, right: 14 }}>
                <span className={`badge ${device.simulationRunning ? 'badge-success' : 'badge-neutral'}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {device.simulationRunning ? <><Activity size={10} /> SIMULANDO</> : 'PARADO'}
                </span>
              </div>

              {/* Device info */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Bot size={16} color="var(--color-primary-500)" />
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{device.name}</span>
                </div>
                {device.location && (
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{device.location}</div>
                )}
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                  {device.schoolUnit?.school?.name} · {device.schoolUnit?.name}
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                <div style={{ background: 'var(--color-bg)', borderRadius: 6, padding: '8px 10px' }}>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{device.eventCount}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Eventos gerados</div>
                </div>
                <div style={{ background: 'var(--color-bg)', borderRadius: 6, padding: '8px 10px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600 }}>
                    {device.lastEventAt ? new Date(device.lastEventAt).toLocaleTimeString('pt-BR') : '—'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Último evento</div>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {device.simulationRunning ? (
                  <button onClick={() => action(`/api/virtual-devices/${device.id}/stop`)}
                    disabled={!!actionLoading} style={{ ...smallBtn, color: 'var(--color-danger)' }}>
                    <Square size={12} /> Pausar
                  </button>
                ) : (
                  <button onClick={() => action(`/api/virtual-devices/${device.id}/start`)}
                    disabled={!!actionLoading} style={{ ...smallBtn, color: 'var(--color-success)' }}>
                    <Play size={12} /> Iniciar
                  </button>
                )}
                <button onClick={() => action(`/api/virtual-devices/${device.id}/trigger`, 'POST', { direction: 'entry' })}
                  disabled={!!actionLoading} style={{ ...smallBtn, color: 'var(--color-primary-600)' }}>
                  <Zap size={12} /> Gerar Evento
                </button>
                <button onClick={() => {
                  if (confirm(`Remover "${device.name}"?`))
                    action(`/api/virtual-devices/${device.id}`, 'DELETE');
                }} disabled={!!actionLoading} style={{ ...smallBtn, color: 'var(--color-danger)', marginLeft: 'auto' }}>
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
};
const smallBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4,
  padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
  background: 'var(--color-bg)', border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
};
const labelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)',
};
const inputStyle: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 6, border: '1px solid var(--color-border)',
  fontSize: 13, background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none',
};
