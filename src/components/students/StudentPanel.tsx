import React, { useState, useEffect } from 'react';
import { X, UserCheck, Settings, BookOpen, Clock, Activity, Edit3, Save, MessageSquare, Phone, Mail, UserPlus, AlertTriangle } from 'lucide-react';

interface Guardian {
  id: string; name: string; phone: string; email: string;
}

interface GuardianLink {
  id: string;
  relation: string;
  notifyEntry: boolean;
  notifyExit: boolean;
  whatsappOn: boolean;
  emailOn: boolean;
  allowPhoto: boolean;
  guardian: Guardian;
}

interface StudentFull {
  id: string; name: string; enrollment: string; grade: string; classGroup: string; shift: string; status: string;
  photo?: { storagePath: string; validationStatus: string };
  school?: { name: string; slug: string };
  guardianLinks?: GuardianLink[];
}

export default function StudentPanel({ studentId, token, onClose, onUpdate }: {
  studentId: string; token: string; onClose: () => void; onUpdate: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'geral' | 'responsaveis'>('geral');
  const [student, setStudent] = useState<StudentFull | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', enrollment: '', grade: '', classGroup: '', shift: '' });

  // Add Guardian View
  const [showAddGuardian, setShowAddGuardian] = useState(false);
  const [newGuardianForm, setNewGuardianForm] = useState({ name: '', phone: '', email: '', relation: 'Pai', relationCustom: '' });

  const load = () => {
    setLoading(true);
    fetch(`/api/students/${studentId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        setStudent(d.student);
        if (d.student) {
          setEditForm({
            name: d.student.name,
            enrollment: d.student.enrollment,
            grade: d.student.grade || '',
            classGroup: d.student.classGroup || '',
            shift: d.student.shift || 'manhã',
          });
        }
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, [studentId, token]);

  const handleUpdate = async () => {
    const res = await fetch(`/api/students/${studentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(editForm)
    });
    if (res.ok) {
      setIsEditing(false);
      load();
      onUpdate();
    }
  };

  const handleToggleConfig = async (linkId: string, field: string, value: boolean) => {
    // Optimistic update
    setStudent(prev => {
      if (!prev) return prev;
      return {
        ...prev, 
        guardianLinks: prev.guardianLinks?.map(l => l.id === linkId ? { ...l, [field]: value } : l)
      };
    });

    await fetch(`/api/guardians/link/${linkId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ [field]: value })
    });
  };

  const handleCreateGuardian = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: newGuardianForm.name, phone: newGuardianForm.phone, email: newGuardianForm.email,
      studentId: studentId,
      relation: newGuardianForm.relation === 'Outro' ? newGuardianForm.relationCustom : newGuardianForm.relation
    };
    const res = await fetch('/api/guardians', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      setShowAddGuardian(false);
      setNewGuardianForm({ name: '', phone: '', email: '', relation: 'Pai', relationCustom: '' });
      load();
    } else {
      const err = await res.json();
      alert(err.message || 'Erro ao criar responsável');
    }
  };

  if (!student && loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ width: '100%', maxWidth: 500, background: 'var(--color-surface)', height: '100%' }} />
      </div>
    );
  }

  if (!student) return null;

  const links = student.guardianLinks || [];
  const limitReached = links.length >= 3;

  return (
    <div className="animate-fade-in" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', justifyContent: 'flex-end' }}>
      <div className="animate-slide-in-right" style={{ 
        width: '100%', maxWidth: 540, background: 'var(--color-surface)', height: '100%', 
        boxShadow: 'var(--shadow-2xl)', display: 'flex', flexDirection: 'column' 
      }}>
        
        {/* Header */}
        <div style={{ 
          padding: '24px 24px 0', 
          background: 'linear-gradient(135deg, var(--color-primary-50), var(--color-bg))',
          borderBottom: '1px solid var(--color-border)',
          position: 'relative'
        }}>
          <button onClick={onClose} style={{ 
            position: 'absolute', top: 16, right: 16, background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--color-text-muted)'
          }}><X size={18} /></button>

          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 20 }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%', flexShrink: 0,
              background: student.photo ? `url(data:image/jpeg;base64,${student.photo.storagePath}) center / cover` : 'var(--color-primary-100)',
              color: 'var(--color-primary-700)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24, fontWeight: 800, border: student.photo ? '3px solid var(--color-success-400)' : '3px solid transparent',
              boxShadow: 'var(--shadow-md)'
            }}>
              {!student.photo && student.name.charAt(0)}
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--color-primary-900)' }}>{student.name}</h2>
              <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                <span className="badge badge-neutral" style={{ fontFamily: 'var(--font-mono)' }}>#{student.enrollment}</span>
                <span className="badge badge-primary">{student.school?.name}</span>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 24 }}>
            <button onClick={() => setActiveTab('geral')} style={{
              background: 'none', border: 'none', padding: '12px 0', fontSize: 13, fontWeight: activeTab === 'geral' ? 700 : 500,
              color: activeTab === 'geral' ? 'var(--color-primary-700)' : 'var(--color-text-muted)', cursor: 'pointer',
              borderBottom: activeTab === 'geral' ? '2px solid var(--color-primary-600)' : '2px solid transparent',
              display: 'flex', alignItems: 'center', gap: 6
            }}><BookOpen size={16} /> Dados Gerais</button>
            
            <button onClick={() => setActiveTab('responsaveis')} style={{
              background: 'none', border: 'none', padding: '12px 0', fontSize: 13, fontWeight: activeTab === 'responsaveis' ? 700 : 500,
              color: activeTab === 'responsaveis' ? 'var(--color-primary-700)' : 'var(--color-text-muted)', cursor: 'pointer',
              borderBottom: activeTab === 'responsaveis' ? '2px solid var(--color-primary-600)' : '2px solid transparent',
              display: 'flex', alignItems: 'center', gap: 6
            }}><UserCheck size={16} /> Responsáveis ({links.length}/3)</button>
          </div>
        </div>

        {/* Content Area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24, background: 'var(--color-bg)' }}>
          
          {/* TAB: GERAL */}
          {activeTab === 'geral' && (
            <div className="animate-fade-in">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Informações Escolares</h3>
                {!isEditing ? (
                  <button onClick={() => setIsEditing(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'var(--color-primary-600)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}><Edit3 size={14} /> Editar</button>
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setIsEditing(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                    <button onClick={handleUpdate} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--color-success-50)', color: 'var(--color-success-700)', border: '1px solid var(--color-success-200)', padding: '4px 8px', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}><Save size={14} /> Salvar</button>
                  </div>
                )}
              </div>

              <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Nome</label>
                    {isEditing ? <input value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 4, fontSize: 13 }} /> : <div style={{ fontSize: 14, fontWeight: 500, marginTop: 4 }}>{student.name}</div>}
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Matrícula</label>
                    {isEditing ? <input value={editForm.enrollment} onChange={e => setEditForm({...editForm, enrollment: e.target.value})} style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 4, fontSize: 13 }} /> : <div style={{ fontSize: 14, fontWeight: 500, marginTop: 4, fontFamily: 'var(--font-mono)' }}>{student.enrollment}</div>}
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Série</label>
                    {isEditing ? <input value={editForm.grade} onChange={e => setEditForm({...editForm, grade: e.target.value})} style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 4, fontSize: 13 }} /> : <div style={{ fontSize: 14, fontWeight: 500, marginTop: 4 }}>{student.grade || '—'}</div>}
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Turma</label>
                    {isEditing ? <input value={editForm.classGroup} onChange={e => setEditForm({...editForm, classGroup: e.target.value})} style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 4, fontSize: 13 }} /> : <div style={{ fontSize: 14, fontWeight: 500, marginTop: 4 }}>{student.classGroup || '—'}</div>}
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Turno</label>
                    {isEditing ? (
                      <select value={editForm.shift} onChange={e => setEditForm({...editForm, shift: e.target.value})} style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 4, fontSize: 13 }}>
                        <option value="manhã">Manhã</option><option value="tarde">Tarde</option><option value="integral">Integral</option>
                      </select>
                    ) : <div style={{ fontSize: 14, fontWeight: 500, marginTop: 4 }}>{student.shift || '—'}</div>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: RESPONSÁVEIS */}
          {activeTab === 'responsaveis' && (
            <div className="animate-fade-in">
              {!showAddGuardian ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Vínculos Familiares</h3>
                    <button 
                      onClick={() => setShowAddGuardian(true)} 
                      disabled={limitReached}
                      title={limitReached ? "Limite de 3 responsáveis atingido" : ""}
                      style={{ 
                        display: 'flex', alignItems: 'center', gap: 6, 
                        background: limitReached ? 'var(--color-border)' : 'var(--color-primary-50)', 
                        color: limitReached ? 'var(--color-text-muted)' : 'var(--color-primary-700)', 
                        border: '1px solid', borderColor: limitReached ? 'transparent' : 'var(--color-primary-200)',
                        padding: '6px 12px', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 600, 
                        cursor: limitReached ? 'not-allowed' : 'pointer' 
                      }}>
                      <UserPlus size={14} /> Adicionar
                    </button>
                  </div>

                  {limitReached && (
                    <div style={{ display: 'flex', gap: 8, padding: 12, background: 'var(--color-warning-50)', color: 'var(--color-warning-800)', borderRadius: 'var(--radius-md)', marginBottom: 16, fontSize: 12 }}>
                      <AlertTriangle size={16} /> Este aluno já possui o limite máximo de 3 responsáveis vinculados.
                    </div>
                  )}

                  {links.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--color-surface)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-lg)' }}>
                      <UserCheck size={32} style={{ color: 'var(--color-text-muted)', marginBottom: 10 }} />
                      <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-text)' }}>Nenhum responsável vinculado</p>
                      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>Vincule um responsável para habilitar as notificações LGPD.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {links.map(link => (
                        <div key={link.id} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                          <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--color-bg-subtle)' }}>
                            <div>
                              <div style={{ fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                                {link.guardian.name}
                                <span className="badge badge-neutral" style={{ fontSize: 10 }}>{link.relation}</span>
                              </div>
                              <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                                {link.guardian.phone && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={12} /> {link.guardian.phone}</span>}
                                {link.guardian.email && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Mail size={12} /> {link.guardian.email}</span>}
                              </div>
                            </div>
                          </div>
                          
                          <div style={{ padding: '16px 20px', background: 'var(--color-bg-subtle)' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 10, letterSpacing: '0.05em' }}>Configurações do Vínculo</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                                <input type="checkbox" checked={link.whatsappOn} onChange={(e) => handleToggleConfig(link.id, 'whatsappOn', e.target.checked)} style={{ accentColor: 'var(--color-success-500)', width: 16, height: 16 }} />
                                WhatsApp On
                              </label>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                                <input type="checkbox" checked={link.emailOn} onChange={(e) => handleToggleConfig(link.id, 'emailOn', e.target.checked)} style={{ accentColor: 'var(--color-primary-500)', width: 16, height: 16 }} />
                                Email On
                              </label>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                                <input type="checkbox" checked={link.notifyEntry} onChange={(e) => handleToggleConfig(link.id, 'notifyEntry', e.target.checked)} style={{ accentColor: 'var(--color-primary-500)', width: 16, height: 16 }} />
                                Notificar Entrada
                              </label>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                                <input type="checkbox" checked={link.notifyExit} onChange={(e) => handleToggleConfig(link.id, 'notifyExit', e.target.checked)} style={{ accentColor: 'var(--color-primary-500)', width: 16, height: 16 }} />
                                Notificar Saída
                              </label>
                            </div>
                            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--color-border)' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--color-warning-700)' }}>
                                <input type="checkbox" checked={link.allowPhoto || false} onChange={(e) => handleToggleConfig(link.id, 'allowPhoto', e.target.checked)} style={{ accentColor: 'var(--color-warning-500)', width: 18, height: 18 }} />
                                📸 Anexar Foto aos Alertas (LGPD)
                              </label>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Novo Responsável</h3>
                    <button onClick={() => setShowAddGuardian(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: 12, cursor: 'pointer' }}>Voltar</button>
                  </div>
                  
                  <form onSubmit={handleCreateGuardian} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <label>
                      <span style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Nome Completo</span>
                      <input required type="text" value={newGuardianForm.name} onChange={e => setNewGuardianForm({...newGuardianForm, name: e.target.value})} style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }} />
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      <label>
                        <span style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>WhatsApp</span>
                        <input type="tel" value={newGuardianForm.phone} onChange={e => setNewGuardianForm({...newGuardianForm, phone: e.target.value})} placeholder="+55..." style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }} />
                      </label>
                      <label>
                        <span style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>E-mail</span>
                        <input type="email" value={newGuardianForm.email} onChange={e => setNewGuardianForm({...newGuardianForm, email: e.target.value})} style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }} />
                      </label>
                    </div>
                    <label>
                      <span style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Grau de Parentesco / Vínculo</span>
                      <select value={newGuardianForm.relation} onChange={e => setNewGuardianForm({...newGuardianForm, relation: e.target.value})} style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }}>
                        {['Pai', 'Mãe', 'Tio/Tia', 'Avô/Avó', 'Primo/a', 'Van Escolar', 'Outro'].map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </label>

                    {newGuardianForm.relation === 'Outro' && (
                      <label>
                        <span style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Descrição do Vínculo</span>
                        <input required placeholder="Ex: Padrasto, Vizinho..." type="text" value={newGuardianForm.relationCustom} onChange={e => setNewGuardianForm({...newGuardianForm, relationCustom: e.target.value})} style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }} />
                      </label>
                    )}

                    <div style={{ marginTop: 8, padding: 12, background: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-md)', fontSize: 11, color: 'var(--color-text-secondary)', display: 'flex', gap: 8 }}>
                      <AlertTriangle size={14} style={{ color: 'var(--color-primary-600)', flexShrink: 0 }} />
                      O vínculo LGPD é criado imediatamente. Revise as opções de Notificação e Foto após adicionar o responsável.
                    </div>

                    <button type="submit" style={{ padding: '12px 0', fontSize: 14, fontWeight: 700, color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', marginTop: 4, background: 'linear-gradient(135deg, var(--color-primary-600), var(--color-primary-800))' }}>
                      Adicionar Responsável ao Aluno
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
