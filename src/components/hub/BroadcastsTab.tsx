import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  Megaphone, Send, Eye, Trash2, Plus, Check, Clock, XCircle,
  Users, Filter, ChevronRight, RefreshCcw, AlertTriangle,
} from 'lucide-react';

interface Broadcast {
  id: string;
  title: string;
  message: string;
  channel: string;
  targetScope: string;
  targetFilter: any;
  status: string;
  scheduledAt: string | null;
  sentAt: string | null;
  completedAt: string | null;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
}

const STATUS_MAP: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft: { label: 'Rascunho', color: 'var(--color-text-muted)', icon: <Clock size={12} /> },
  sending: { label: 'Enviando...', color: 'var(--color-info, #3B82F6)', icon: <Send size={12} /> },
  sent: { label: 'Enviado', color: 'var(--color-success)', icon: <Check size={12} /> },
  partial: { label: 'Parcial', color: 'var(--color-warning)', icon: <AlertTriangle size={12} /> },
  failed: { label: 'Falhou', color: 'var(--color-danger)', icon: <XCircle size={12} /> },
};

const SCOPE_MAP: Record<string, string> = {
  all: 'Toda a escola',
  grade: 'Por série',
  classGroup: 'Por turma',
  shift: 'Por turno',
  custom: 'Filtro personalizado',
};

export default function BroadcastsTab({ hubSchoolId }: { hubSchoolId: string | null }) {
  const { token } = useAuth();
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);

  // Create form
  const [form, setForm] = useState({ title: '', message: '', channel: 'whatsapp', targetScope: 'all', targetFilter: {} as any });
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const schoolId = hubSchoolId;

  useEffect(() => { if (schoolId) loadBroadcasts(); }, [schoolId]);

  const loadBroadcasts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/schools/${schoolId}/broadcasts?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBroadcasts(data.broadcasts || []);
      }
    } catch {}
    setLoading(false);
  };

  const createBroadcast = async () => {
    if (!form.title.trim() || !form.message.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/schools/${schoolId}/broadcasts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const data = await res.json();
        setPreviewCount(data.recipientPreview);
        setShowCreate(false);
        setForm({ title: '', message: '', channel: 'whatsapp', targetScope: 'all', targetFilter: {} });
        loadBroadcasts();
      }
    } catch {}
    setCreating(false);
  };

  const sendBroadcast = async (id: string) => {
    if (!confirm('Confirma o envio deste comunicado? A ação não pode ser desfeita.')) return;
    setSendingId(id);
    try {
      const res = await fetch(`/api/schools/${schoolId}/broadcasts/${id}/send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        loadBroadcasts();
      } else {
        const err = await res.json();
        alert(err.message || 'Erro ao enviar');
      }
    } catch {}
    setSendingId(null);
  };

  const deleteBroadcast = async (id: string) => {
    if (!confirm('Excluir este comunicado?')) return;
    try {
      await fetch(`/api/schools/${schoolId}/broadcasts/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      loadBroadcasts();
    } catch {}
  };

  const viewDetail = async (id: string) => {
    try {
      const res = await fetch(`/api/schools/${schoolId}/broadcasts/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDetail(data.broadcast);
      }
    } catch {}
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

  if (!schoolId) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>Selecione uma escola</div>;

  return (
    <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'rgba(168,85,247,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Megaphone size={18} color="#A855F7" />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Comunicados Gerais</h3>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>Envie avisos para responsáveis por WhatsApp</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={loadBroadcasts} className="btn btn-ghost" style={{ padding: '8px 12px' }}>
            <RefreshCcw size={14} />
          </button>
          <button onClick={() => setShowCreate(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <Plus size={14} /> Novo Comunicado
          </button>
        </div>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="card" style={{ padding: 20, border: '2px solid var(--color-primary-200)' }}>
          <h4 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700 }}>Novo Comunicado</h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4, display: 'block' }}>Título</label>
              <input type="text" placeholder="Ex: Reunião de Pais — Maio 2026" value={form.title}
                onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 14 }} />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4, display: 'block' }}>Mensagem</label>
              <textarea value={form.message} placeholder="Digite o conteúdo do comunicado..." rows={5}
                onChange={(e) => setForm(p => ({ ...p, message: e.target.value }))}
                style={{ width: '100%', padding: 12, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 13, resize: 'vertical' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4, display: 'block' }}>
                  <Filter size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />Público-Alvo
                </label>
                <select value={form.targetScope} onChange={(e) => setForm(p => ({ ...p, targetScope: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
                  <option value="all">Toda a escola</option>
                  <option value="grade">Por série</option>
                  <option value="classGroup">Por turma</option>
                  <option value="shift">Por turno</option>
                </select>
              </div>

              {form.targetScope !== 'all' && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4, display: 'block' }}>
                    Filtro (separar por vírgula)
                  </label>
                  <input type="text" placeholder={form.targetScope === 'grade' ? 'Ex: 8, 9' : form.targetScope === 'classGroup' ? 'Ex: 8A, 9B' : 'Ex: manhã, tarde'}
                    onChange={(e) => {
                      const values = e.target.value.split(',').map(v => v.trim()).filter(Boolean);
                      const key = form.targetScope === 'grade' ? 'grades' : form.targetScope === 'classGroup' ? 'classGroups' : 'shifts';
                      setForm(p => ({ ...p, targetFilter: { [key]: values } }));
                    }}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 13 }} />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <button onClick={() => setShowCreate(false)} className="btn btn-ghost" style={{ fontSize: 13 }}>Cancelar</button>
              <button onClick={createBroadcast} disabled={creating || !form.title || !form.message} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '10px 20px' }}>
                <Plus size={14} /> {creating ? 'Criando...' : 'Criar Rascunho'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Broadcasts List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)' }}>Carregando...</div>
      ) : broadcasts.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)' }}>
          <Megaphone size={32} style={{ opacity: 0.2, marginBottom: 12 }} />
          <p style={{ fontSize: 14, fontWeight: 600 }}>Nenhum comunicado criado</p>
          <p style={{ fontSize: 12 }}>Use o botão "Novo Comunicado" para enviar avisos aos responsáveis.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {broadcasts.map(b => {
            const st = STATUS_MAP[b.status] || STATUS_MAP.draft;
            const progress = b.totalRecipients > 0 ? Math.round(((b.sentCount + b.failedCount) / b.totalRecipients) * 100) : 0;

            return (
              <div key={b.id} className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{b.title}</h4>
                      <span style={{
                        padding: '2px 8px', borderRadius: 'var(--radius-sm)', fontSize: 11, fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: 3,
                        color: st.color, background: `${st.color}15`,
                      }}>
                        {st.icon} {st.label}
                      </span>
                    </div>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-muted)', maxWidth: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {b.message}
                    </p>
                    <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: 'var(--color-text-muted)' }}>
                      <span><Users size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />{b.totalRecipients} destinatários</span>
                      <span>{SCOPE_MAP[b.targetScope] || b.targetScope}</span>
                      <span>{formatDate(b.createdAt)}</span>
                      {b.status === 'sending' || b.status === 'sent' || b.status === 'partial' ? (
                        <span style={{ color: 'var(--color-success)' }}>✓ {b.sentCount} enviados {b.failedCount > 0 && `· ${b.failedCount} falhas`}</span>
                      ) : null}
                    </div>

                    {/* Progress bar for sending state */}
                    {(b.status === 'sending' || b.status === 'partial') && (
                      <div style={{ marginTop: 8, background: 'var(--color-border)', borderRadius: 4, height: 4, width: '100%', maxWidth: 300, overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: 'var(--color-primary-500)', borderRadius: 4, width: `${progress}%`, transition: 'width 0.3s' }} />
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 6 }}>
                    {b.status === 'draft' && (
                      <>
                        <button onClick={() => sendBroadcast(b.id)} disabled={sendingId === b.id}
                          className="btn btn-primary" style={{ padding: '6px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Send size={12} /> {sendingId === b.id ? 'Enviando...' : 'Enviar'}
                        </button>
                        <button onClick={() => deleteBroadcast(b.id)} className="btn btn-ghost" style={{ padding: 6, color: 'var(--color-danger)' }}>
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                    {(b.status === 'sent' || b.status === 'partial' || b.status === 'sending') && (
                      <button onClick={() => viewDetail(b.id)} className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Eye size={12} /> Detalhes
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      {detail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setDetail(null)}>
          <div className="card" style={{ padding: 24, maxWidth: 600, width: '90%', maxHeight: '80vh', overflow: 'auto' }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{detail.title}</h3>
              <button onClick={() => setDetail(null)} className="btn btn-ghost" style={{ padding: 4 }}>✕</button>
            </div>

            <div style={{ padding: 12, background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', marginBottom: 16, fontSize: 13, whiteSpace: 'pre-wrap' }}>
              {detail.message}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div className="card" style={{ padding: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-primary-600)' }}>{detail.totalRecipients}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Total</div>
              </div>
              <div className="card" style={{ padding: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-success)' }}>{detail.sentCount}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Enviados</div>
              </div>
              <div className="card" style={{ padding: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-danger)' }}>{detail.failedCount}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Falhas</div>
              </div>
            </div>

            {detail.deliveries?.length > 0 && (
              <div style={{ maxHeight: 250, overflow: 'auto' }}>
                <table className="data-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>Destinatário</th>
                      <th>Canal</th>
                      <th>Status</th>
                      <th>Enviado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.deliveries.map((d: any) => (
                      <tr key={d.id}>
                        <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{d.recipient}</td>
                        <td>{d.channel}</td>
                        <td>
                          <span style={{
                            padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                            color: d.status === 'sent' ? 'var(--color-success)' : d.status === 'failed' ? 'var(--color-danger)' : 'var(--color-text-muted)',
                            background: d.status === 'sent' ? 'rgba(34,197,94,0.1)' : d.status === 'failed' ? 'rgba(239,68,68,0.1)' : 'rgba(0,0,0,0.05)',
                          }}>
                            {d.status === 'sent' ? 'Enviado' : d.status === 'failed' ? 'Falhou' : 'Pendente'}
                          </span>
                          {d.lastError && <div style={{ fontSize: 10, color: 'var(--color-danger)', marginTop: 2 }}>{d.lastError}</div>}
                        </td>
                        <td style={{ fontSize: 11 }}>{d.sentAt ? formatDate(d.sentAt) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
