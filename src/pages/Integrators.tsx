import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { SkeletonTable } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import {
  Building2, Plus, Search, Settings, ExternalLink,
  CheckCircle, AlertTriangle, XCircle, School, HardDrive,
  Users, Calendar, Shield,
} from 'lucide-react';

interface IntegratorItem {
  id: string;
  name: string;
  slug: string;
  cnpj: string;
  contactEmail: string;
  contactPhone: string;
  status: string;
  licenseType: string;
  licenseExpiresAt: string;
  totalSchools: number;
  totalDevices: number;
  totalStudents: number;
  createdAt: string;
}

function getDemoIntegrators(): IntegratorItem[] {
  return [
    { id: '1', name: 'TechSeg Soluções', slug: 'techseg', cnpj: '11.222.333/0001-44', contactEmail: 'contato@techseg.com.br', contactPhone: '(11) 3322-4455', status: 'active', licenseType: 'enterprise', licenseExpiresAt: '2027-06-30', totalSchools: 18, totalDevices: 126, totalStudents: 5200, createdAt: '2025-01-15' },
    { id: '2', name: 'SecurEdu', slug: 'securedu', cnpj: '22.333.444/0001-55', contactEmail: 'admin@securedu.com.br', contactPhone: '(21) 3344-5566', status: 'active', licenseType: 'professional', licenseExpiresAt: '2026-12-31', totalSchools: 12, totalDevices: 84, totalStudents: 3800, createdAt: '2025-04-20' },
    { id: '3', name: 'EduSafe', slug: 'edusafe', cnpj: '33.444.555/0001-66', contactEmail: 'ops@edusafe.com', contactPhone: '(31) 4455-6677', status: 'active', licenseType: 'professional', licenseExpiresAt: '2026-09-15', totalSchools: 9, totalDevices: 62, totalStudents: 2900, createdAt: '2025-07-10' },
    { id: '4', name: 'AccessPro', slug: 'accesspro', cnpj: '44.555.666/0001-77', contactEmail: 'hello@accesspro.io', contactPhone: '(41) 5566-7788', status: 'active', licenseType: 'starter', licenseExpiresAt: '2026-06-30', totalSchools: 5, totalDevices: 38, totalStudents: 1100, createdAt: '2025-10-01' },
    { id: '5', name: 'ControleMax', slug: 'controlemax', cnpj: '55.666.777/0001-88', contactEmail: 'suporte@controlemax.com', contactPhone: '(51) 6677-8899', status: 'trial', licenseType: 'trial', licenseExpiresAt: '2026-05-15', totalSchools: 3, totalDevices: 32, totalStudents: 680, createdAt: '2026-02-20' },
    { id: '6', name: 'GuardaEscola', slug: 'guardaescola', cnpj: '66.777.888/0001-99', contactEmail: 'contato@guardaescola.com.br', contactPhone: '(19) 7788-9900', status: 'trial', licenseType: 'trial', licenseExpiresAt: '2026-05-30', totalSchools: 0, totalDevices: 0, totalStudents: 0, createdAt: '2026-04-01' },
  ];
}

export default function Integrators() {
  const { token, isDemo } = useAuth();
  const [integrators, setIntegrators] = useState<IntegratorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    if (isDemo) { setIntegrators(getDemoIntegrators()); setLoading(false); return; }
    try {
      const res = await fetch('/api/integrators', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const data = await res.json(); setIntegrators(data.integrators || []); }
      else { setError(`Erro ${res.status} ao carregar integradores`); }
    } catch { setError('Não foi possível conectar ao servidor'); }
    setLoading(false);
  };

  const filtered = integrators.filter(i => {
    if (!search) return true;
    const q = search.toLowerCase();
    return i.name.toLowerCase().includes(q) || i.slug.includes(q) || i.cnpj.includes(q) || i.contactEmail.includes(q);
  });

  const statusBadge = (s: string) => {
    switch (s) {
      case 'active': return <span className="badge badge-success"><CheckCircle size={10} /> Ativo</span>;
      case 'trial': return <span className="badge badge-warning"><AlertTriangle size={10} /> Trial</span>;
      case 'suspended': return <span className="badge badge-danger"><XCircle size={10} /> Suspenso</span>;
      default: return <span className="badge">{s}</span>;
    }
  };

  const licenseBadge = (type: string) => {
    const colors: Record<string, string> = {
      enterprise: 'var(--chart-8)', professional: 'var(--color-primary-600)', starter: 'var(--color-info)', trial: 'var(--color-warning)',
    };
    return (
      <span style={{
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
        padding: '2px 8px', borderRadius: 999,
        background: `${colors[type] || 'var(--color-text-muted)'}15`, color: colors[type] || 'var(--color-text-muted)',
      }}>
        {type}
      </span>
    );
  };

  const daysUntilExpiry = (date: string) => {
    const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
    if (days < 0) return <span style={{ color: 'var(--color-danger)', fontWeight: 600, fontSize: 12 }}>Expirado</span>;
    if (days < 30) return <span style={{ color: 'var(--color-warning)', fontWeight: 600, fontSize: 12 }}>{days}d restantes</span>;
    return <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{new Date(date).toLocaleDateString('pt-BR')}</span>;
  };

  const totals = {
    schools: integrators.reduce((sum, i) => sum + i.totalSchools, 0),
    devices: integrators.reduce((sum, i) => sum + i.totalDevices, 0),
    students: integrators.reduce((sum, i) => sum + i.totalStudents, 0),
  };

  return (
    <div className="animate-fade-in-up">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--color-primary-800)' }}>Integradores</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
            {integrators.filter(i => i.status === 'active').length} ativos •
            {' '}{totals.schools} escolas • {totals.devices} devices • {totals.students.toLocaleString()} alunos
          </p>
        </div>
        <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <Plus size={14} /> Novo Integrador
        </button>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 16, position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
        <input type="text" placeholder="Buscar por nome, CNPJ ou e-mail..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', maxWidth: 400, padding: '9px 12px 9px 34px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--color-surface)' }} />
      </div>

      {/* Table */}
      {loading ? <SkeletonTable rows={5} cols={7} /> : error ? (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--color-danger)' }}>
          <XCircle size={24} style={{ marginBottom: 8 }} />
          <p style={{ margin: 0, fontSize: 14 }}>{error}</p>
          <button className="btn btn-secondary" style={{ marginTop: 12, fontSize: 13 }} onClick={loadData}>Tentar novamente</button>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="building" title="Nenhum integrador" description="Cadastre o primeiro integrador para começar." />
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Integrador</th>
                <th>Contato</th>
                <th style={{ textAlign: 'center' }}>Escolas</th>
                <th style={{ textAlign: 'center' }}>Devices</th>
                <th>Licença</th>
                <th>Validade</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(i => (
                <tr key={i.id} style={{ cursor: 'pointer' }}>
                  <td>
                    <div className="td-bold">{i.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>{i.cnpj}</div>
                  </td>
                  <td>
                    <div style={{ fontSize: 12 }}>{i.contactEmail}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{i.contactPhone}</div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: 14 }}>{i.totalSchools}</span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: 14 }}>{i.totalDevices}</span>
                  </td>
                  <td>{licenseBadge(i.licenseType)}</td>
                  <td>{daysUntilExpiry(i.licenseExpiresAt)}</td>
                  <td>{statusBadge(i.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
