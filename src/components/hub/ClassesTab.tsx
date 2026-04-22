import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { BookOpen, MapPin, Plus, List, Trash2, Search } from 'lucide-react';
import { useToast } from '../ui/Toast';

export default function ClassesTab({ hubSchoolId }: { hubSchoolId?: string | null }) {
  const { token, profile } = useAuth();
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ grade: '', classGroup: '', shift: 'manhã' });
  const [search, setSearch] = useState('');
  const toast = useToast();

  const isSchoolAdminOrIntegrator = ['school_admin', 'integrator_admin', 'superadmin', 'coordinator'].includes(profile?.role || '');

  useEffect(() => {
    // Escolas management removed from here as it's handled by SchoolHub
  }, [token, profile?.role]);

  const loadClasses = () => {
    if (!token) return;
    const targetSchool = hubSchoolId || profile?.schoolId;
    if (!targetSchool && profile?.role !== 'superadmin') {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    fetch(`/api/school-classes${targetSchool ? `?schoolId=${targetSchool}` : ''}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => setClasses(data.classes || []))
      .catch(() => toast.error('Erro ao buscar turmas'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadClasses();
    // eslint-disable-next-line
  }, [hubSchoolId, token]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/school-classes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          schoolId: hubSchoolId || profile?.schoolId,
          ...form
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      
      toast.success('Turma criada com sucesso!');
      setShowForm(false);
      setForm({ grade: '', classGroup: '', shift: 'manhã' });
      loadClasses();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar turma');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta turma?')) return;
    try {
      const res = await fetch(`/api/school-classes/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Falha ao excluir');
      setClasses(classes.filter(c => c.id !== id));
      toast.success('Turma removida');
    } catch {
      toast.error('Não é possível remover: pode haver alunos vinculados');
    }
  };

  // Group classes by grade naturally
  const filtered = classes.filter(c => 
    c.grade.toLowerCase().includes(search.toLowerCase()) || 
    c.classGroup.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="animate-fade-in-up">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
           {(!['superadmin', 'integrator_admin'].includes(profile?.role || '')) && (
             <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 600 }}>
               Catálogo Oficial da Escola
             </div>
           )}
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: 220 }}>
            <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar..."
              style={{ width: '100%', padding: '9px 14px 9px 38px', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 13, outline: 'none' }}
            />
          </div>
          {isSchoolAdminOrIntegrator && (
            <button onClick={() => setShowForm(true)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', fontSize: 13, fontWeight: 600,
              background: 'var(--color-primary-600)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer',
            }}><Plus size={16} /> Nova Matriz</button>
          )}
        </div>
      </div>

      {showForm && (
        <div style={{ background: 'var(--color-primary-50)', border: '1px solid var(--color-primary-200)', borderRadius: 'var(--radius-lg)', padding: 20, marginBottom: 24 }} className="animate-fade-in-up">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--color-primary-800)' }}>Adicionar Série/Turma</h3>
            <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>✕</button>
          </div>
          <form onSubmit={handleCreate} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, alignItems: 'end' }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Série/Ano</label>
              <input required placeholder="Ex: 8º Ano Fundamental" value={form.grade} onChange={e => setForm({...form, grade: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Identificador da Turma</label>
              <input required placeholder="Ex: A, B, 8A" value={form.classGroup} onChange={e => setForm({...form, classGroup: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Turno</label>
              <select value={form.shift} onChange={e => setForm({...form, shift: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: '#fff' }}>
                <option value="manhã">Manhã</option>
                <option value="tarde">Tarde</option>
                <option value="noite">Noite</option>
                <option value="integral">Integral</option>
              </select>
            </div>
            <button type="submit" style={{ padding: '11px', background: 'var(--color-primary-600)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontWeight: 600, cursor: 'pointer' }}>Salvar Turma</button>
          </form>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)' }}>Carregando catálogo...</div>
      ) : filtered.length === 0 ? (
        <div style={{ background: 'var(--color-surface)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 60, textAlign: 'center' }}>
          <BookOpen size={40} style={{ color: 'var(--color-text-muted)', marginBottom: 12 }} />
          <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600 }}>Nenhuma turma encontrada</h3>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>Cadastre as séries e turmas para blindar o cadastro de alunos contra erros de digitação.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {filtered.map(c => (
            <div key={c.id} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'transform 0.2s, box-shadow 0.2s' }}
              onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
              onMouseOut={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)' }}>{c.grade}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <span className="badge badge-neutral" style={{ fontSize: 11, fontWeight: 700 }}>Turma {c.classGroup}</span>
                  <span className="badge badge-neutral" style={{ fontSize: 11 }}>{c.shift}</span>
                </div>
              </div>
              {isSchoolAdminOrIntegrator && (
                <button onClick={() => handleDelete(c.id)} style={{ background: 'var(--color-danger-50)', color: 'var(--color-danger-600)', border: 'none', padding: 8, borderRadius: 'var(--radius-sm)', cursor: 'pointer', opacity: 0.8 }}
                  onMouseOver={e => e.currentTarget.style.opacity = '1'}
                  onMouseOut={e => e.currentTarget.style.opacity = '0.8'}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
