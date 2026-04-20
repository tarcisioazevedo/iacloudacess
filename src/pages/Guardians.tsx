import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { UserCheck, Plus, X, Phone, Mail } from 'lucide-react';

interface Guardian {
  id: string; name: string; phone: string; email: string;
  studentLinks: {
    id: string; relation: string;
    notifyEntry: boolean; notifyExit: boolean;
    whatsappOn: boolean; emailOn: boolean; allowPhoto?: boolean;
    student: { id: string; name: string; enrollment: string };
  }[];
}

interface Student { id: string; name: string; }

export default function Guardians() {
  const { token } = useAuth();
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showConfig, setShowConfig] = useState<{guardianId: string, linkId: string} | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', studentId: '', relation: 'Pai', relationCustom: '' });
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!token) return;
    Promise.all([
      fetch('/api/guardians', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch('/api/students', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())
    ]).then(([dGuardians, dStudents]) => {
      setGuardians(dGuardians.guardians || []);
      setStudents(dStudents.students || []);
    }).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, [token]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: form.name, phone: form.phone, email: form.email,
      studentId: form.studentId,
      relation: form.relation === 'Outro' ? form.relationCustom : form.relation
    };
    const res = await fetch('/api/guardians', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
    if (res.ok) {
      setShowForm(false); setForm({ name: '', phone: '', email: '', studentId: '', relation: 'Pai', relationCustom: '' }); load();
    } else {
      const err = await res.json();
      alert(err.message || 'Erro ao criar responsável');
    }
  };

  const handleToggleConfig = async (linkId: string, field: string, value: boolean) => {
    const link = guardians.flatMap(g => g.studentLinks).find(l => l.id === linkId);
    if (!link) return;
    
    // Optimistic update
    setGuardians(prev => prev.map(g => ({
      ...g, studentLinks: g.studentLinks.map(l => l.id === linkId ? { ...l, [field]: value } : l)
    })));

    try {
      await fetch(`/api/guardians/link/${linkId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ [field]: value })
      });
    } catch {
      load(); // rollback on error
    }
  };

  return (
    <div className="animate-fade-in-up">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}><UserCheck size={22} /> Responsáveis</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 2 }}>{guardians.length} responsáveis cadastrados</p>
        </div>
        <button onClick={() => setShowForm(true)} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', fontSize: 13, fontWeight: 600,
          background: 'linear-gradient(135deg, var(--color-primary-600), var(--color-primary-800))', color: '#fff',
          border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer',
        }}><Plus size={16} /> Novo Responsável</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
        {guardians.map(g => (
          <div key={g.id} style={{
            background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border)', padding: 20, transition: 'box-shadow 0.2s',
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{g.name}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
              {g.phone && <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Phone size={13} /> {g.phone}</span>}
              {g.email && <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Mail size={13} /> {g.email}</span>}
            </div>
            {g.studentLinks.length > 0 && (
              <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 6, letterSpacing: '0.05em' }}>Alunos vinculados</div>
                {g.studentLinks.map(link => (
                  <div key={link.student.id} style={{ padding: '8px 0', borderBottom: '1px dashed var(--color-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 12 }}>{link.student.name}</span>
                      <span className="badge badge-neutral">{link.relation}</span>
                    </div>

                    {/* Notification Toggles */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: 'var(--color-text-secondary)' }}>
                        <input type="checkbox" checked={link.whatsappOn} onChange={(e) => handleToggleConfig(link.id, 'whatsappOn', e.target.checked)} />
                        Ativar WhatsApp
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: 'var(--color-text-secondary)' }}>
                        <input type="checkbox" checked={link.emailOn} onChange={(e) => handleToggleConfig(link.id, 'emailOn', e.target.checked)} />
                        Ativar E-mail
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: 'var(--color-text-secondary)' }}>
                        <input type="checkbox" checked={link.notifyEntry} onChange={(e) => handleToggleConfig(link.id, 'notifyEntry', e.target.checked)} />
                        Avisar Entrada
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: 'var(--color-text-secondary)' }}>
                        <input type="checkbox" checked={link.notifyExit} onChange={(e) => handleToggleConfig(link.id, 'notifyExit', e.target.checked)} />
                        Avisar Saída
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: 'var(--color-text-secondary)' }}>
                        <input type="checkbox" checked={link.allowPhoto || false} onChange={(e) => handleToggleConfig(link.id, 'allowPhoto', e.target.checked)} />
                        📸 Receber Foto
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {loading && <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-muted)' }}>Carregando...</div>}
      {!loading && guardians.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>Nenhum responsável cadastrado</div>}

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', padding: 32, width: '100%', maxWidth: 440, boxShadow: 'var(--shadow-lg)' }} className="animate-fade-in-up">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Novo Responsável</h2>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { label: 'Nome completo', key: 'name', type: 'text', required: true },
                { label: 'WhatsApp', key: 'phone', type: 'tel', required: false },
                { label: 'E-mail', key: 'email', type: 'email', required: false },
              ].map(f => (
                <label key={f.key}>
                  <span style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>{f.label}</span>
                  <input required={f.required} type={f.type} value={(form as any)[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-sans)', outline: 'none' }}
                  />
                </label>
              ))}
              
              <label>
                <span style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Aluno (Obrigatório)*</span>
                <select required value={form.studentId} onChange={e => setForm({ ...form, studentId: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-sans)', outline: 'none' }}>
                  <option value="">Selecione um aluno...</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>

              <label>
                <span style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Grau de Parentesco / Vínculo</span>
                <select value={form.relation} onChange={e => setForm({ ...form, relation: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-sans)', outline: 'none' }}>
                  {['Pai', 'Mãe', 'Tio/Tia', 'Avô/Avó', 'Primo/a', 'Van Escolar', 'Outro'].map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </label>

              {form.relation === 'Outro' && (
                <label>
                  <span style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Descrição do Vínculo</span>
                  <input required placeholder="Ex: Madrasta, Padrasto..." type="text" value={form.relationCustom} onChange={e => setForm({ ...form, relationCustom: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-sans)', outline: 'none' }}
                  />
                </label>
              )}

              <button type="submit" style={{
                padding: '10px 0', fontSize: 14, fontWeight: 700, color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', marginTop: 8,
                background: 'linear-gradient(135deg, var(--color-primary-600), var(--color-primary-800))',
              }}>Cadastrar Responsável</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
