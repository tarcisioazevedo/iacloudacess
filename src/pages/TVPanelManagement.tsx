import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  Tv, Plus, Settings, Trash2, ExternalLink, Copy, Check,
  ToggleLeft, ToggleRight, X, School, Monitor,
} from 'lucide-react';

interface TVPanel {
  id: string;
  schoolId: string;
  unitId: string | null;
  accessToken: string;
  displayName: string | null;
  welcomeMessage: string | null;
  themeColor: string;
  isActive: boolean;
  showPhoto: boolean;
  showClassGroup: boolean;
  showClock: boolean;
  autoHideSeconds: number;
  maxVisibleCards: number;
  filterDirection: string | null;
  filterShift: string | null;
  createdAt: string;
  school: { id: string; name: string };
  unit: { id: string; name: string } | null;
}

// ── Panel Card ────────────────────────────────────────────────────────────────
function PanelCard({ panel, token, onEdit, onDelete, onToggle }: {
  panel: TVPanel;
  token: string;
  onEdit: (p: TVPanel) => void;
  onDelete: (id: string) => void;
  onToggle: (p: TVPanel) => void;
}) {
  const [copied, setCopied] = useState(false);
  const tvUrl = `${window.location.origin}/tv/${panel.accessToken}`;

  const copy = () => {
    navigator.clipboard.writeText(tvUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{
      background: 'var(--color-surface)', border: `1.5px solid ${panel.isActive ? 'var(--color-border)' : 'var(--color-border)'}`,
      borderRadius: 'var(--radius-lg)', overflow: 'hidden', opacity: panel.isActive ? 1 : 0.6,
      boxShadow: 'var(--shadow-sm)',
    }}>
      {/* Color header */}
      <div style={{ height: 8, background: panel.themeColor }} />

      <div style={{ padding: '16px 18px' }}>
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 'var(--radius-md)',
              background: panel.themeColor + '20', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Monitor size={18} color={panel.themeColor} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{panel.displayName || panel.school.name}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <School size={10} /> {panel.school.name}
                {panel.unit && <> · {panel.unit.name}</>}
              </div>
            </div>
          </div>
          <span className={`badge ${panel.isActive ? 'badge-success' : 'badge-neutral'}`} style={{ fontSize: 10 }}>
            {panel.isActive ? '● Ativo' : '● Inativo'}
          </span>
        </div>

        {/* Welcome message */}
        {panel.welcomeMessage && (
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 12, fontStyle: 'italic', borderLeft: `3px solid ${panel.themeColor}`, paddingLeft: 8 }}>
            "{panel.welcomeMessage}"
          </div>
        )}

        {/* Settings chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {panel.showPhoto     && <span className="badge badge-neutral" style={{ fontSize: 10 }}>📷 Foto</span>}
          {panel.showClassGroup && <span className="badge badge-neutral" style={{ fontSize: 10 }}>🏫 Turma</span>}
          {panel.showClock     && <span className="badge badge-neutral" style={{ fontSize: 10 }}>🕒 Relógio</span>}
          {panel.filterDirection && <span className="badge badge-neutral" style={{ fontSize: 10 }}>↕ {panel.filterDirection === 'entry' ? 'Só Entradas' : 'Só Saídas'}</span>}
          <span className="badge badge-neutral" style={{ fontSize: 10 }}>⏱ {panel.autoHideSeconds}s auto-hide</span>
          <span className="badge badge-neutral" style={{ fontSize: 10 }}>🗃 Max {panel.maxVisibleCards} cards</span>
        </div>

        {/* URL box */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-bg)',
          border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
          padding: '6px 10px', marginBottom: 14, fontSize: 11, overflow: 'hidden',
        }}>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-muted)' }}>
            {tvUrl}
          </span>
          <button onClick={copy} title="Copiar URL" style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? 'var(--color-success)' : 'var(--color-text-muted)', padding: 2, flexShrink: 0 }}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          <a href={tvUrl} target="_blank" rel="noreferrer" title="Abrir TV Panel" style={{ color: 'var(--color-primary-600)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <ExternalLink size={14} />
          </a>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => onEdit(panel)} style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            padding: '7px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
          }}>
            <Settings size={13} /> Configurar
          </button>
          <button onClick={() => onToggle(panel)} title={panel.isActive ? 'Desativar' : 'Ativar'} style={{
            padding: '7px 10px', fontSize: 12, cursor: 'pointer',
            background: panel.isActive ? 'var(--color-warning-bg)' : 'var(--color-success-bg)',
            color: panel.isActive ? 'var(--color-warning)' : 'var(--color-success)',
            border: `1px solid ${panel.isActive ? 'var(--color-warning)' : 'var(--color-success)'}`,
            borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center',
          }}>
            {panel.isActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
          </button>
          <button onClick={() => {
            if (confirm(`Excluir o painel "${panel.displayName || panel.school.name}"?`)) onDelete(panel.id);
          }} title="Excluir" style={{
            padding: '7px 10px', cursor: 'pointer',
            background: 'var(--color-danger-bg)', color: 'var(--color-danger)',
            border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center',
          }}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Panel Form Modal ──────────────────────────────────────────────────────────
function PanelFormModal({ panel, token, callerRole, callerSchoolId, onClose, onSaved }: {
  panel?: TVPanel;
  token: string;
  callerRole: string;
  callerSchoolId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!panel;
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    targetSchoolId: panel?.schoolId || callerSchoolId || '',
    displayName:     panel?.displayName || '',
    welcomeMessage:  panel?.welcomeMessage || '',
    themeColor:      panel?.themeColor || '#1b4965',
    showPhoto:       panel?.showPhoto ?? true,
    showClassGroup:  panel?.showClassGroup ?? true,
    showClock:       panel?.showClock ?? true,
    autoHideSeconds: panel?.autoHideSeconds ?? 8,
    maxVisibleCards: panel?.maxVisibleCards ?? 6,
    filterDirection: panel?.filterDirection || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => {
    if (['superadmin', 'integrator_admin'].includes(callerRole)) {
      fetch('/api/schools', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(d => setSchools(d.schools || [])).catch(() => {});
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const url   = isEdit ? `/api/tv/panels/${panel!.id}` : '/api/tv/panels';
      const method = isEdit ? 'PUT' : 'POST';
      const body: Record<string, unknown> = {
        displayName:    form.displayName || null,
        welcomeMessage: form.welcomeMessage || null,
        themeColor:     form.themeColor,
        showPhoto:      form.showPhoto,
        showClassGroup: form.showClassGroup,
        showClock:      form.showClock,
        autoHideSeconds: Number(form.autoHideSeconds),
        maxVisibleCards: Number(form.maxVisibleCards),
        filterDirection: form.filterDirection || null,
      };
      if (!isEdit) body.targetSchoolId = form.targetSchoolId;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message); return; }
      onSaved();
    } catch {
      setError('Erro de conexão');
    } finally {
      setSaving(false);
    }
  };

  const inp: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--color-bg)', color: 'var(--color-text)', boxSizing: 'border-box' };
  const chk: React.CSSProperties = { accentColor: 'var(--color-primary-600)', width: 16, height: 16 };
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 20px', overflowY: 'auto' }}>
      <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', width: '100%', maxWidth: 520, boxShadow: 'var(--shadow-xl)' }}>
        <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Tv size={18} color="var(--color-primary-600)" />
            {isEdit ? 'Configurar TV Panel' : 'Novo TV Panel'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && (
            <div style={{ background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', fontSize: 13, color: 'var(--color-danger)' }}>{error}</div>
          )}

          {/* School selector (only for admins / new panels) */}
          {!isEdit && ['superadmin', 'integrator_admin'].includes(callerRole) && schools.length > 0 && (
            <div>
              <label style={lbl}>Escola *</label>
              <select value={form.targetSchoolId} onChange={e => setForm(f => ({ ...f, targetSchoolId: e.target.value }))} style={inp} required>
                <option value="">Selecione...</option>
                {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label style={lbl}>Nome do painel <span style={{ fontWeight: 400 }}>(opcional)</span></label>
            <input value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} placeholder="Ex: Portão Principal" style={inp} />
          </div>

          <div>
            <label style={lbl}>Mensagem de boas-vindas <span style={{ fontWeight: 400 }}>(opcional)</span></label>
            <input value={form.welcomeMessage} onChange={e => setForm(f => ({ ...f, welcomeMessage: e.target.value }))} placeholder="Bem-vindo ao Colégio XYZ!" style={inp} />
          </div>

          <div>
            <label style={lbl}>Cor do tema</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="color" value={form.themeColor} onChange={e => setForm(f => ({ ...f, themeColor: e.target.value }))} style={{ width: 48, height: 36, padding: 2, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }} />
              <input value={form.themeColor} onChange={e => setForm(f => ({ ...f, themeColor: e.target.value }))} placeholder="#1b4965" style={{ ...inp, width: 120 }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Auto-ocultar após (segundos)</label>
              <input type="number" min={3} max={60} value={form.autoHideSeconds} onChange={e => setForm(f => ({ ...f, autoHideSeconds: parseInt(e.target.value) }))} style={inp} />
            </div>
            <div>
              <label style={lbl}>Máximo de cards visíveis</label>
              <input type="number" min={1} max={20} value={form.maxVisibleCards} onChange={e => setForm(f => ({ ...f, maxVisibleCards: parseInt(e.target.value) }))} style={inp} />
            </div>
          </div>

          <div>
            <label style={lbl}>Filtrar direção</label>
            <select value={form.filterDirection} onChange={e => setForm(f => ({ ...f, filterDirection: e.target.value }))} style={inp}>
              <option value="">Mostrar entradas e saídas</option>
              <option value="entry">Apenas entradas</option>
              <option value="exit">Apenas saídas</option>
            </select>
          </div>

          {/* Toggles */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 14px', background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 2 }}>EXIBIÇÃO</div>
            {[
              { key: 'showPhoto',      label: '📷 Exibir foto do aluno' },
              { key: 'showClassGroup', label: '🏫 Exibir turma' },
              { key: 'showClock',      label: '🕒 Exibir relógio' },
            ].map(item => (
              <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="checkbox"
                  style={chk}
                  checked={form[item.key as keyof typeof form] as boolean}
                  onChange={e => setForm(f => ({ ...f, [item.key]: e.target.checked }))}
                />
                {item.label}
              </label>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: 10, background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
            <button type="submit" disabled={saving} style={{ flex: 1, padding: 10, background: 'var(--color-primary-600)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Criar painel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TVPanelManagement() {
  const { token, profile } = useAuth();
  const role = profile?.role || '';

  const [panels, setPanels]   = useState<TVPanel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<TVPanel | null>(null);

  const h = { Authorization: `Bearer ${token}` };

  const load = () => {
    setLoading(true);
    fetch('/api/tv/panels', { headers: h })
      .then(r => r.json())
      .then(d => setPanels(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [token]);

  const handleDelete = async (id: string) => {
    await fetch(`/api/tv/panels/${id}`, { method: 'DELETE', headers: h });
    load();
  };

  const handleToggle = async (panel: TVPanel) => {
    await fetch(`/api/tv/panels/${panel.id}`, {
      method: 'PUT',
      headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !panel.isActive }),
    });
    load();
  };

  const canCreate = ['superadmin', 'integrator_admin', 'school_admin'].includes(role);

  return (
    <div className="animate-fade-in-up">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Tv size={22} color="var(--color-primary-600)" /> TV Panels
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 4 }}>
            {panels.length} painel{panels.length !== 1 ? 'is' : ''} configurado{panels.length !== 1 ? 's' : ''}
          </p>
        </div>
        {canCreate && (
          <button onClick={() => setShowForm(true)} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px',
            background: 'linear-gradient(135deg, var(--color-primary-600), var(--color-primary-800))',
            color: '#fff', border: 'none', borderRadius: 'var(--radius-md)',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            <Plus size={16} /> Novo Painel
          </button>
        )}
      </div>

      {/* Info banner */}
      <div style={{
        background: 'var(--color-primary-50)', border: '1px solid var(--color-primary-200)',
        borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: 24,
        fontSize: 13, color: 'var(--color-primary-700)', display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <Monitor size={16} color="var(--color-primary-600)" style={{ flexShrink: 0 }} />
        <span>
          Cada painel gera uma URL única que pode ser aberta em qualquer TV/monitor. Não requer login —
          funciona por token de acesso. Ideal para monitores na portaria e recepção.
        </span>
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>Carregando painéis...</div>
      ) : panels.length === 0 ? (
        <div style={{
          border: '2px dashed var(--color-border)', borderRadius: 'var(--radius-lg)',
          padding: '60px 20px', textAlign: 'center', color: 'var(--color-text-muted)',
        }}>
          <Tv size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Nenhum painel criado</div>
          <div style={{ fontSize: 13, marginBottom: 16 }}>Crie um painel para exibir acessos em tempo real em TVs e monitores</div>
          {canCreate && (
            <button onClick={() => setShowForm(true)} style={{
              padding: '10px 22px', background: 'var(--color-primary-600)', color: '#fff',
              border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
              Criar primeiro painel
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 18 }}>
          {panels.map(p => (
            <PanelCard
              key={p.id} panel={p} token={token!}
              onEdit={setEditTarget}
              onDelete={handleDelete}
              onToggle={handleToggle}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {showForm && (
        <PanelFormModal
          token={token!} callerRole={role}
          callerSchoolId={profile?.schoolId || null}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
      {editTarget && (
        <PanelFormModal
          panel={editTarget} token={token!} callerRole={role}
          callerSchoolId={profile?.schoolId || null}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); load(); }}
        />
      )}
    </div>
  );
}
