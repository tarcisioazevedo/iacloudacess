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

  // Slide-over Modal States
  const [selectedSchool, setSelectedSchool] = useState<SchoolItem | null>(null);
  const [activeTab, setActiveTab] = useState<'geral' | 'devices' | 'profiles'>('geral');
  const [modalDevices, setModalDevices] = useState<any[]>([]);
  const [modalProfiles, setModalProfiles] = useState<any[]>([]);
  const [modalLoading, setModalLoading] = useState(false);

  useEffect(() => { loadData(); }, []);

  const handleOpenConfig = (school: SchoolItem) => {
    setSelectedSchool(school);
    setActiveTab('geral');
    setModalDevices([]);
    setModalProfiles([]);
  };

  useEffect(() => {
    if (!selectedSchool || activeTab === 'geral' || isDemo) return;
    
    let isMounted = true;
    setModalLoading(true);

    const headers = { Authorization: `Bearer ${token}` };
    
    if (activeTab === 'devices') {
      fetch(`/api/devices?schoolId=${selectedSchool.id}`, { headers })
        .then(res => res.json())
        .then(data => { if (isMounted) setModalDevices(data.devices || []); })
        .catch(() => {})
        .finally(() => { if (isMounted) setModalLoading(false); });
    } else if (activeTab === 'profiles') {
      fetch(`/api/profiles?schoolId=${selectedSchool.id}`, { headers })
        .then(res => res.json())
        .then(data => { if (isMounted) setModalProfiles(data.profiles || []); })
        .catch(() => {})
        .finally(() => { if (isMounted) setModalLoading(false); });
    }

    return () => { isMounted = false; };
  }, [selectedSchool, activeTab, isDemo, token]);

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
        <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
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
                      <button className="btn btn-ghost btn-sm" title="Configuracoes" style={{ padding: 4 }} onClick={() => handleOpenConfig(school)}>
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

      {selectedSchool && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex' }}>
          <div 
            style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }} 
            onClick={() => setSelectedSchool(null)} 
          />
          <div className="animate-fade-in-up" style={{ 
            position: 'absolute', right: 0, top: 0, bottom: 0, width: '100%', maxWidth: 640, 
            backgroundColor: 'var(--color-surface)', boxShadow: '-4px 0 24px rgba(0,0,0,0.1)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden'
          }}>
            <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'var(--color-surface)' }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Configurações da Escola</h2>
                <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>{selectedSchool.name}</p>
              </div>
              <button 
                onClick={() => setSelectedSchool(null)}
                style={{ background: 'var(--color-surface-2)', border: 'none', padding: 8, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={18} color="var(--color-text-primary)" />
              </button>
            </div>

            <div style={{ padding: '0 32px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: 24 }}>
              <button 
                onClick={() => setActiveTab('geral')}
                style={{ background: 'transparent', border: 'none', borderBottom: activeTab === 'geral' ? '2px solid var(--color-primary-600)' : '2px solid transparent', padding: '16px 0', fontSize: 14, fontWeight: activeTab === 'geral' ? 700 : 500, color: activeTab === 'geral' ? 'var(--color-primary-600)' : 'var(--color-text-secondary)', cursor: 'pointer', display: 'flex', gap: 6, alignItems: 'center', transition: 'all 0.2s' }}
              >
                <Settings size={16} /> Geral
              </button>
              <button 
                onClick={() => setActiveTab('devices')}
                style={{ background: 'transparent', border: 'none', borderBottom: activeTab === 'devices' ? '2px solid var(--color-primary-600)' : '2px solid transparent', padding: '16px 0', fontSize: 14, fontWeight: activeTab === 'devices' ? 700 : 500, color: activeTab === 'devices' ? 'var(--color-primary-600)' : 'var(--color-text-secondary)', cursor: 'pointer', display: 'flex', gap: 6, alignItems: 'center', transition: 'all 0.2s' }}
              >
                <HardDrive size={16} /> Equipamentos
              </button>
              <button 
                onClick={() => setActiveTab('profiles')}
                style={{ background: 'transparent', border: 'none', borderBottom: activeTab === 'profiles' ? '2px solid var(--color-primary-600)' : '2px solid transparent', padding: '16px 0', fontSize: 14, fontWeight: activeTab === 'profiles' ? 700 : 500, color: activeTab === 'profiles' ? 'var(--color-primary-600)' : 'var(--color-text-secondary)', cursor: 'pointer', display: 'flex', gap: 6, alignItems: 'center', transition: 'all 0.2s' }}
              >
                <Shield size={16} /> Usuários Administrativos
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 32, backgroundColor: 'var(--color-surface-2)' }}>
              {activeTab === 'geral' && (
                <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div className="card" style={{ padding: 24 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px' }}>Identidade</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div>
                        <label className="form-label">Nome da Escola</label>
                        <input type="text" className="form-input" value={selectedSchool.name} disabled />
                      </div>
                      <div>
                        <label className="form-label">CNPJ</label>
                        <input type="text" className="form-input" value={selectedSchool.cnpj || 'Não informado'} disabled />
                      </div>
                    </div>
                  </div>
                  <div className="card" style={{ padding: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <MessageSquare size={16} />
                        Notificações de Foto
                      </h3>
                      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>
                        Permite o envio das fotos do momento do acesso via WhatsApp caso a integração esteja ativa.
                      </p>
                    </div>
                    <div>
                      <button 
                        className={`btn ${selectedSchool.allowPhotoNotifications ? 'btn-success' : 'btn-ghost'}`} 
                        onClick={() => handleTogglePhoto(selectedSchool.id, !!selectedSchool.allowPhotoNotifications)}
                      >
                        {selectedSchool.allowPhotoNotifications ? 'Ativado' : 'Ativar'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'devices' && (
                <div className="animate-fade-in-up">
                  {modalLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
                  ) : modalDevices.length === 0 ? (
                    <EmptyState icon="devices" title="Nenhum dispositivo encontrado" description="Esta escola ainda não possui equipamentos configurados." />
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 16 }}>
                      {modalDevices.map(d => (
                        <div key={d.id} className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 700 }}>{d.name}</div>
                              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{d.ipAddress}</div>
                            </div>
                            {d.status === 'online' ? <Wifi size={14} color="var(--color-success)" /> : <WifiOff size={14} color="var(--color-danger)" />}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                            <MapPin size={12} /> {d.location || 'Sem local'}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                            <HardDrive size={12} /> {d.model || 'Desconhecido'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'profiles' && (
                <div className="animate-fade-in-up">
                  {modalLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
                  ) : modalProfiles.length === 0 ? (
                    <EmptyState icon="users" title="Nenhum usuário encontrado" description="Sem usuários administrativos cadastrados unicamente para esta escola." />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {modalProfiles.map(p => (
                        <div key={p.id} className="card" style={{ padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: 'var(--color-primary-100)', color: 'var(--color-primary-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>
                              {p.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</div>
                              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{p.email}</div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                            <span className="badge" style={{ background: 'var(--color-surface-2)' }}>{p.role}</span>
                            {!p.isActive && <span className="badge badge-danger">Inativo</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
