import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { SkeletonTable } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import {
  Plus, Search, Settings, CheckCircle, XCircle, AlertTriangle,
  Users, HardDrive, MapPin, Tv, MessageSquare, X, Wifi, WifiOff, Shield
} from 'lucide-react';

interface SchoolItem {
  id: string;
  name: string;
  slug: string;
  cnpj?: string;
  city?: string;
  state?: string;
  status: string;
  totalStudents: number;
  totalDevices: number;
  devicesOnline: number;
  totalUnits: number;
  allowPhotoNotifications?: boolean;
  integratorId?: string;
  createdAt: string;
}

function getDemoSchools(): SchoolItem[] {
  return [
    { id: '1', name: 'Colegio Horizonte', slug: 'horizonte', cnpj: '12.345.678/0001-90', city: 'Sao Paulo', state: 'SP', status: 'active', totalStudents: 420, totalDevices: 8, devicesOnline: 7, totalUnits: 2, createdAt: '2025-06-15' },
    { id: '2', name: 'Colegio Atlas', slug: 'atlas', cnpj: '23.456.789/0001-01', city: 'Sao Paulo', state: 'SP', status: 'active', totalStudents: 380, totalDevices: 6, devicesOnline: 5, totalUnits: 1, createdAt: '2025-08-20' },
    { id: '3', name: 'Colegio Prisma', slug: 'prisma', cnpj: '34.567.890/0001-12', city: 'Campinas', state: 'SP', status: 'active', totalStudents: 290, totalDevices: 4, devicesOnline: 4, totalUnits: 1, createdAt: '2025-09-10' },
    { id: '4', name: 'Colegio Delta', slug: 'delta', cnpj: '45.678.901/0001-23', city: 'Curitiba', state: 'PR', status: 'onboarding', totalStudents: 0, totalDevices: 3, devicesOnline: 0, totalUnits: 1, createdAt: '2026-03-01' },
    { id: '5', name: 'Escola Lume', slug: 'lume', cnpj: '56.789.012/0001-34', city: 'Sao Paulo', state: 'SP', status: 'active', totalStudents: 180, totalDevices: 3, devicesOnline: 3, totalUnits: 1, createdAt: '2025-11-05' },
    { id: '6', name: 'Escola Nova Era', slug: 'nova-era', cnpj: '67.890.123/0001-45', city: 'Guarulhos', state: 'SP', status: 'suspended', totalStudents: 210, totalDevices: 4, devicesOnline: 0, totalUnits: 1, createdAt: '2025-07-12' },
  ];
}

export default function Schools() {
  const navigate = useNavigate();
  const { token, isDemo } = useAuth();
  const [schools, setSchools] = useState<SchoolItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', cnpj: '', integratorId: '' });
  const [creating, setCreating] = useState(false);
  const [integrators, setIntegrators] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (profile?.role === 'superadmin' && !isDemo) {
      fetch('/api/integrators', { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.json())
        .then(data => {
          if (data.integrators) {
            setIntegrators(data.integrators);
            if (data.integrators.length > 0) {
              setCreateForm(prev => ({ ...prev, integratorId: data.integrators[0].id }));
            }
          }
        })
        .catch(() => {});
    }
  }, [profile?.role, isDemo, token]);

  const handleOpenConfig = (school: SchoolItem) => {
    navigate(`/school-hub?schoolId=${school.id}`);
  };

  const handleCreateSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemo) {
      setShowCreate(false);
      navigate(`/school-hub?schoolId=new-demo`);
      return;
    }
    
    if (profile?.role === 'superadmin' && !createForm.integratorId) {
      alert('Selecione um integrador para vincular à escola.');
      return;
    }
    
    setCreating(true);
    try {
      const res = await fetch('/api/schools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(createForm),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.message || 'Falha ao criar escola');
      }
      const data = await res.json();
      setShowCreate(false);
      navigate(`/school-hub?schoolId=${data.school?.id || data.id}`);
    } catch (err: any) {
      alert(err.message || 'Erro ao criar escola');
    } finally {
      setCreating(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    if (isDemo) {
      setSchools(getDemoSchools());
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/schools', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error('Nao foi possivel carregar as escolas');
      }
      const data = await res.json();
      setSchools(data.schools || []);
    } catch {
      setSchools(getDemoSchools());
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePhoto = async (schoolId: string, current: boolean) => {
    try {
      setSchools(prev => prev.map(s => s.id === schoolId ? { ...s, allowPhotoNotifications: !current } : s));
      const res = await fetch(`/api/schools/${schoolId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ allowPhotoNotifications: !current }),
      });
      if (!res.ok) throw new Error('Erro ao atualizar');
    } catch (err) {
      setSchools(prev => prev.map(s => s.id === schoolId ? { ...s, allowPhotoNotifications: current } : s));
    }
  };

  const filtered = schools.filter((school) => {
    if (statusFilter !== 'all' && school.status !== statusFilter) return false;
    if (!search) return true;

    const query = search.toLowerCase();
    return (
      school.name.toLowerCase().includes(query)
      || school.slug.toLowerCase().includes(query)
      || (school.cnpj || '').toLowerCase().includes(query)
      || (school.city || '').toLowerCase().includes(query)
    );
  });

  const statusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="badge badge-success"><CheckCircle size={10} /> Ativa</span>;
      case 'onboarding':
        return <span className="badge badge-warning"><AlertTriangle size={10} /> Onboarding</span>;
      case 'suspended':
        return <span className="badge badge-danger"><XCircle size={10} /> Suspensa</span>;
      default:
        return <span className="badge">{status}</span>;
    }
  };

  const deviceHealth = (online: number, total: number) => {
    if (total === 0) {
      return <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>-</span>;
    }
    const ratio = online / total;
    const color = ratio >= 1 ? 'var(--color-success)' : ratio >= 0.5 ? 'var(--color-warning)' : 'var(--color-danger)';
    return <span style={{ fontWeight: 600, color, fontFamily: 'var(--font-mono)', fontSize: 13 }}>{online}/{total}</span>;
  };

  return (
    <div className="animate-fade-in-up">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--color-primary-800)' }}>Escolas</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
            Gestao de escolas do portfolio • {schools.filter(item => item.status === 'active').length} ativas
          </p>
        </div>
        <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }} onClick={() => setShowCreate(true)}>
          <Plus size={14} /> Nova Escola
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input
            type="text"
            placeholder="Buscar escola, CNPJ ou cidade..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '9px 12px 9px 34px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--color-surface)' }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--color-surface)', cursor: 'pointer' }}
        >
          <option value="all">Todos os status</option>
          <option value="active">Ativas</option>
          <option value="onboarding">Onboarding</option>
          <option value="suspended">Suspensas</option>
        </select>
      </div>

      {loading ? <SkeletonTable rows={5} cols={7} /> : filtered.length === 0 ? (
        <EmptyState icon="schools" title="Nenhuma escola encontrada" description="Tente ajustar os filtros ou cadastre uma nova escola." />
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Escola</th>
                <th>Localizacao</th>
                <th style={{ textAlign: 'center' }}>Alunos</th>
                <th style={{ textAlign: 'center' }}>Devices</th>
                <th style={{ textAlign: 'center' }}>Unidades</th>
                <th>Status</th>
                <th style={{ width: 110 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((school) => (
                <tr key={school.id}>
                  <td>
                    <div className="td-bold">{school.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {school.cnpj || school.slug}
                    </div>
                    {school.allowPhotoNotifications && (
                      <span className="badge badge-success" style={{ marginTop: 4, display: 'inline-flex', padding: '2px 6px', fontSize: 10 }}>📸 Fotos Liberadas</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                      <MapPin size={12} color="var(--color-text-muted)" />
                      {school.city || 'Nao informado'}{school.state ? `, ${school.state}` : ''}
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      <Users size={12} color="var(--color-text-muted)" />
                      <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: 13 }}>{school.totalStudents}</span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      <HardDrive size={12} color="var(--color-text-muted)" />
                      {deviceHealth(school.devicesOnline, school.totalDevices)}
                    </div>
                  </td>
                  <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 13 }}>{school.totalUnits}</td>
                  <td>{statusBadge(school.status)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost btn-sm" title="Cockpit da Escola" style={{ padding: 4 }} onClick={() => navigate(`/cockpit?schoolId=${school.id}`)}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-briefcase"><path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/></svg>
                      </button>
                      <button className="btn btn-ghost btn-sm" title="Secretaria Acadêmica" style={{ padding: 4 }} onClick={() => navigate(`/school-hub?schoolId=${school.id}`)}>
                        <Settings size={14} />
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        title="WhatsApp da Escola"
                        style={{ padding: 4 }}
                        onClick={() => navigate(`/whatsapp?schoolId=${school.id}`)}
                      >
                        <MessageSquare size={14} />
                      </button>
                      <button className="btn btn-ghost btn-sm" title="TV Panel" style={{ padding: 4 }} onClick={() => navigate(`/tv-panels?schoolId=${school.id}`)}>
                        <Tv size={14} />
                      </button>
                      <button className="btn btn-ghost btn-sm" title={school.allowPhotoNotifications ? "Bloquear Fotos WhatsApp" : "Liberar Fotos WhatsApp"} onClick={() => handleTogglePhoto(school.id, !!school.allowPhotoNotifications)} style={{ padding: 4, color: school.allowPhotoNotifications ? 'var(--color-success)' : 'inherit' }}>
                        📸
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Modal de Nova Escola (Minimalista) */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={() => !creating && setShowCreate(false)} />
          <div className="card animate-fade-in-up" style={{ position: 'relative', width: '100%', maxWidth: 400, backgroundColor: 'var(--color-surface)', padding: 24, zIndex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Nova Escola</h3>
              <button className="btn btn-ghost" style={{ padding: 4 }} onClick={() => !creating && setShowCreate(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleCreateSchool} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="form-label">Nome da Escola *</label>
                <input required type="text" className="form-input" value={createForm.name} onChange={e => setCreateForm({ ...createForm, name: e.target.value })} placeholder="Ex: Colégio Anglo" />
              </div>
              <div>
                <label className="form-label">CNPJ</label>
                <input type="text" className="form-input" value={createForm.cnpj} onChange={e => setCreateForm({ ...createForm, cnpj: e.target.value })} placeholder="00.000.000/0000-00" />
              </div>
              {profile?.role === 'superadmin' && integrators.length > 0 && (
                <div>
                  <label className="form-label">Integrador Vinculado *</label>
                  <select 
                    className="form-input" 
                    value={createForm.integratorId} 
                    onChange={e => setCreateForm({ ...createForm, integratorId: e.target.value })}
                    required
                  >
                    {integrators.map(intg => (
                      <option key={intg.id} value={intg.id}>{intg.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button type="button" className="btn btn-neutral" style={{ flex: 1 }} onClick={() => !creating && setShowCreate(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={creating || !createForm.name}>
                  {creating ? 'Criando...' : 'Criar Escola'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
