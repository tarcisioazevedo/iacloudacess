import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { SkeletonTable } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import {
  Key, Plus, Search, CheckCircle, AlertTriangle, XCircle, Clock,
  Calendar, Building2, Shield, TrendingUp,
} from 'lucide-react';

interface LicenseItem {
  id: string;
  integratorName: string;
  integratorSlug: string;
  plan: string;
  status: string;
  maxSchools: number;
  usedSchools: number;
  maxDevices: number;
  usedDevices: number;
  validFrom: string;
  validTo: string;
}

function getDemoLicenses(): LicenseItem[] {
  return [
    { id: '1', integratorName: 'TechSeg Soluções', integratorSlug: 'techseg', plan: 'enterprise', status: 'active', maxSchools: 50, usedSchools: 18, maxDevices: 500, usedDevices: 126, validFrom: '2025-01-15', validTo: '2027-06-30' },
    { id: '2', integratorName: 'SecurEdu', integratorSlug: 'securedu', plan: 'professional', status: 'active', maxSchools: 25, usedSchools: 12, maxDevices: 250, usedDevices: 84, validFrom: '2025-04-20', validTo: '2026-12-31' },
    { id: '3', integratorName: 'EduSafe', integratorSlug: 'edusafe', plan: 'professional', status: 'active', maxSchools: 25, usedSchools: 9, maxDevices: 250, usedDevices: 62, validFrom: '2025-07-10', validTo: '2026-09-15' },
    { id: '4', integratorName: 'AccessPro', integratorSlug: 'accesspro', plan: 'starter', status: 'active', maxSchools: 10, usedSchools: 5, maxDevices: 100, usedDevices: 38, validFrom: '2025-10-01', validTo: '2026-06-30' },
    { id: '5', integratorName: 'ControleMax', integratorSlug: 'controlemax', plan: 'trial', status: 'trial', maxSchools: 5, usedSchools: 3, maxDevices: 50, usedDevices: 32, validFrom: '2026-02-20', validTo: '2026-05-15' },
    { id: '6', integratorName: 'GuardaEscola', integratorSlug: 'guardaescola', plan: 'trial', status: 'trial', maxSchools: 5, usedSchools: 0, maxDevices: 50, usedDevices: 0, validFrom: '2026-04-01', validTo: '2026-05-30' },
    { id: '7', integratorName: 'SafeSchool BR', integratorSlug: 'safeschool', plan: 'professional', status: 'suspended', maxSchools: 25, usedSchools: 7, maxDevices: 250, usedDevices: 45, validFrom: '2025-03-01', validTo: '2026-03-01' },
  ];
}

export default function Licenses() {
  const { token, isDemo } = useAuth();
  const [licenses, setLicenses] = useState<LicenseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    if (isDemo) { setLicenses(getDemoLicenses()); setLoading(false); return; }
    try {
      const res = await fetch('/api/licenses', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const data = await res.json(); setLicenses(data.licenses || []); }
      else setLicenses(getDemoLicenses());
    } catch { setLicenses(getDemoLicenses()); }
    setLoading(false);
  };

  const filtered = licenses.filter(l => {
    if (statusFilter !== 'all' && l.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return l.integratorName.toLowerCase().includes(q) || l.plan.includes(q);
    }
    return true;
  });

  const daysUntilExpiry = (date: string) => Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);

  const expiryBadge = (date: string) => {
    const days = daysUntilExpiry(date);
    if (days < 0) return <span className="badge badge-danger">Expirado</span>;
    if (days <= 30) return <span className="badge badge-warning"><Clock size={10} /> {days}d</span>;
    if (days <= 90) return <span className="badge badge-info">{days}d</span>;
    return <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{new Date(date).toLocaleDateString('pt-BR')}</span>;
  };

  const statusBadge = (s: string) => {
    switch (s) {
      case 'active': return <span className="badge badge-success"><CheckCircle size={10} /> Ativa</span>;
      case 'trial': return <span className="badge badge-warning"><AlertTriangle size={10} /> Trial</span>;
      case 'suspended': return <span className="badge badge-danger"><XCircle size={10} /> Suspensa</span>;
      case 'expired': return <span className="badge badge-danger"><Clock size={10} /> Expirada</span>;
      default: return <span className="badge">{s}</span>;
    }
  };

  const planColors: Record<string, string> = {
    enterprise: '#7c3aed', professional: '#0369a1', starter: '#0891b2', trial: '#d97706',
  };

  const usageBar = (used: number, max: number) => {
    const pct = max > 0 ? Math.min((used / max) * 100, 100) : 0;
    const color = pct >= 90 ? 'var(--color-danger)' : pct >= 70 ? 'var(--color-warning)' : 'var(--color-success)';
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 120 }}>
        <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--color-border)' }}>
          <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: color, transition: 'width 0.6s ease' }} />
        </div>
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600, color, whiteSpace: 'nowrap' }}>
          {used}/{max}
        </span>
      </div>
    );
  };

  const stats = {
    active: licenses.filter(l => l.status === 'active').length,
    trial: licenses.filter(l => l.status === 'trial').length,
    expiring: licenses.filter(l => daysUntilExpiry(l.validTo) > 0 && daysUntilExpiry(l.validTo) <= 30).length,
    suspended: licenses.filter(l => l.status === 'suspended').length,
  };

  return (
    <div className="animate-fade-in-up">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--color-primary-800)' }}>Licenças</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
            Gestão de licenciamento da plataforma
          </p>
        </div>
        <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <Plus size={14} /> Nova Licença
        </button>
      </div>

      {/* Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Ativas', value: stats.active, icon: <CheckCircle size={14} />, color: 'var(--color-success)' },
          { label: 'Trial', value: stats.trial, icon: <AlertTriangle size={14} />, color: 'var(--color-warning)' },
          { label: 'Expirando (30d)', value: stats.expiring, icon: <Clock size={14} />, color: 'var(--color-info)' },
          { label: 'Suspensas', value: stats.suspended, icon: <XCircle size={14} />, color: 'var(--color-danger)' },
        ].map((s, i) => (
          <div key={i} className="card" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ color: s.color }}>{s.icon}</div>
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Search + Filter */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input type="text" placeholder="Buscar por integrador ou plano..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '9px 12px 9px 34px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--color-surface)' }} />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--color-surface)', cursor: 'pointer' }}>
          <option value="all">Todos os status</option>
          <option value="active">Ativas</option>
          <option value="trial">Trial</option>
          <option value="suspended">Suspensas</option>
        </select>
      </div>

      {/* Table */}
      {loading ? <SkeletonTable rows={5} cols={7} /> : filtered.length === 0 ? (
        <EmptyState icon="licenses" title="Nenhuma licença" description="Cadastre a primeira licença para começar." />
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Integrador</th>
                <th>Plano</th>
                <th>Escolas</th>
                <th>Devices</th>
                <th>Validade</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => (
                <tr key={l.id} style={{ cursor: 'pointer' }}>
                  <td>
                    <div className="td-bold">{l.integratorName}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>{l.integratorSlug}</div>
                  </td>
                  <td>
                    <span style={{
                      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                      padding: '3px 10px', borderRadius: 999,
                      background: `${planColors[l.plan] || '#6b7280'}15`,
                      color: planColors[l.plan] || '#6b7280',
                    }}>
                      {l.plan}
                    </span>
                  </td>
                  <td>{usageBar(l.usedSchools, l.maxSchools)}</td>
                  <td>{usageBar(l.usedDevices, l.maxDevices)}</td>
                  <td>{expiryBadge(l.validTo)}</td>
                  <td>{statusBadge(l.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
