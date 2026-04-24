import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { KPICard } from '../components/cockpit/KPICard';
import { DonutChart } from '../components/charts/DonutChart';
import { Sparkline } from '../components/charts/Sparkline';
import { EmptyState } from '../components/ui/EmptyState';
import { SkeletonKPIRow, SkeletonTable } from '../components/ui/Skeleton';
import {
  Building2, School, HardDrive, Activity, Shield, KeyRound, TrendingUp,
  AlertTriangle, CheckCircle, XCircle, Users,
} from 'lucide-react';

interface PlatformAnalytics {
  kpis: {
    totalIntegrators: number;
    totalSchools: number;
    totalDevices: number;
    totalEventsToday: number;
    totalStudents: number;
    platformUptime: number;
  };
  integratorRanking: {
    id: string; name: string; slug: string;
    schools: number; eventsToday: number;
    devices: number; devicesOnline: number;
    healthStatus: string;
  }[];
  licensing: { active: number; trial: number; expiring: number; suspended: number };
  growth: { newSchools: number; newDevices: number };
  fleetStatus: { online: number; unstable: number; offline: number };
  weeklyTrend: { report_date: string; total_events: number }[];
}

function getDemoData(): PlatformAnalytics {
  return {
    kpis: { totalIntegrators: 8, totalSchools: 47, totalDevices: 342, totalEventsToday: 12847, totalStudents: 14280, platformUptime: 98.7 },
    integratorRanking: [
      { id: '1', name: 'TechSeg Soluções', slug: 'techseg', schools: 18, eventsToday: 4283, devices: 126, devicesOnline: 122, healthStatus: 'healthy' },
      { id: '2', name: 'SecurEdu', slug: 'securedu', schools: 12, eventsToday: 2918, devices: 84, devicesOnline: 82, healthStatus: 'healthy' },
      { id: '3', name: 'EduSafe', slug: 'edusafe', schools: 9, eventsToday: 1892, devices: 62, devicesOnline: 58, healthStatus: 'degraded' },
      { id: '4', name: 'AccessPro', slug: 'accesspro', schools: 5, eventsToday: 487, devices: 38, devicesOnline: 38, healthStatus: 'healthy' },
      { id: '5', name: 'ControleMax', slug: 'controlemax', schools: 3, eventsToday: 291, devices: 32, devicesOnline: 26, healthStatus: 'critical' },
    ],
    licensing: { active: 8, trial: 2, expiring: 1, suspended: 0 },
    growth: { newSchools: 12, newDevices: 38 },
    fleetStatus: { online: 326, unstable: 10, offline: 6 },
    weeklyTrend: [
      { report_date: '2026-04-11', total_events: 11200 },
      { report_date: '2026-04-12', total_events: 10800 },
      { report_date: '2026-04-14', total_events: 12100 },
      { report_date: '2026-04-15', total_events: 12800 },
      { report_date: '2026-04-16', total_events: 13200 },
    ],
  };
}

export default function CockpitSuperadmin() {
  const { token, isDemo } = useAuth();
  const [data, setData] = useState<PlatformAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMockData, setIsMockData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setError(null);
    if (isDemo) { setData(getDemoData()); setIsMockData(true); setLoading(false); return; }
    try {
      const res = await fetch('/api/analytics/platform', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { setData(await res.json()); setIsMockData(false); }
      else { setError(`Erro ${res.status} ao carregar analytics`); }
    } catch { setError('Não foi possível conectar ao servidor'); }
    setLoading(false);
  };

  if (loading) return (
    <div className="animate-fade-in">
      <div className="skeleton" style={{ width: 280, height: 22, marginBottom: 8 }} />
      <div className="skeleton" style={{ width: 380, height: 14, marginBottom: 24 }} />
      <SkeletonKPIRow count={5} />
      <div style={{ marginTop: 16 }}><SkeletonTable rows={5} cols={6} /></div>
    </div>
  );

  if (error) return (
    <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--color-danger)' }}>
      <XCircle size={24} style={{ marginBottom: 8 }} />
      <p style={{ margin: 0, fontSize: 14 }}>{error}</p>
      <button className="btn btn-secondary" style={{ marginTop: 12, fontSize: 13 }} onClick={loadData}>Tentar novamente</button>
    </div>
  );

  if (!data) return <EmptyState icon="analytics" title="Sem dados" />;

  const { kpis, integratorRanking, licensing, growth, fleetStatus, weeklyTrend } = data;
  const statusIcon = (s: string) => s === 'healthy' ? <CheckCircle size={14} color="var(--color-success)" /> : s === 'degraded' ? <AlertTriangle size={14} color="var(--color-warning)" /> : <XCircle size={14} color="var(--color-danger)" />;
  const trendData = weeklyTrend.map(w => w.total_events);

  return (
    <div className="animate-fade-in-up">
      {isMockData && (
        <div style={{
          background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: 'var(--radius-md)',
          padding: '10px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10,
          fontSize: 13, color: '#92400e',
        }}>
          <AlertTriangle size={16} color="#f59e0b" style={{ flexShrink: 0 }} />
          <span><strong>Dados de demonstração</strong> — A API de analytics não está disponível. Os números exibidos são fictícios.</span>
        </div>
      )}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--color-primary-800)' }}>Cockpit Plataforma</h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>Visão global cross-tenant — Acesso Escolar</p>
      </div>

      {/* KPIs */}
      <div className="cockpit-grid cockpit-grid-5" style={{ marginBottom: 24 }}>
        <KPICard label="Integradores" value={kpis.totalIntegrators} icon={<Building2 size={16} color="var(--color-primary-600)" />} iconBg="var(--color-primary-50)" />
        <KPICard label="Escolas Ativas" value={kpis.totalSchools} icon={<School size={16} color="var(--chart-6)" />} iconBg="#f0fdfa" trend={{ value: `+${growth.newSchools} este mês`, direction: 'up' }} />
        <KPICard label="Devices Fleet" value={kpis.totalDevices} icon={<HardDrive size={16} color="var(--chart-4)" />} iconBg="#f5f3ff" trend={{ value: `+${growth.newDevices} este mês`, direction: 'up' }} />
        <KPICard label="Uptime" value={`${kpis.platformUptime}%`} icon={<Shield size={16} color="var(--color-success)" />} iconBg="var(--color-success-bg)" />
        <KPICard label="Eventos Hoje" value={kpis.totalEventsToday.toLocaleString()} icon={<Activity size={16} color="var(--chart-7)" />} iconBg="#fff7ed" sparklineData={trendData} sparklineColor="var(--chart-7)" />
      </div>

      {/* Integrator Ranking */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3 className="cockpit-section-title"><Building2 size={16} color="var(--color-primary-600)" /> Ranking Integradores</h3>
          <span className="badge badge-primary">{integratorRanking.length} ativos</span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Integrador</th>
                <th>Escolas</th>
                <th>Eventos/dia</th>
                <th>Devices</th>
                <th>Saúde</th>
              </tr>
            </thead>
            <tbody>
              {integratorRanking.map((intg, i) => (
                <tr key={intg.id} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 700, color: 'var(--color-text-muted)', width: 40 }}>{i + 1}</td>
                  <td className="td-bold">{intg.name}</td>
                  <td>{intg.schools}</td>
                  <td className="td-mono">{intg.eventsToday.toLocaleString()}</td>
                  <td>
                    <span style={{ color: intg.devicesOnline === intg.devices ? 'var(--color-success)' : 'var(--color-warning)' }}>
                      {intg.devicesOnline}/{intg.devices}
                    </span>
                  </td>
                  <td style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {statusIcon(intg.healthStatus)}
                    <span style={{ fontSize: 12, textTransform: 'capitalize' }}>
                      {intg.healthStatus === 'healthy' ? 'Saudável' : intg.healthStatus === 'degraded' ? 'Degradado' : 'Crítico'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row 3: Licensing + Fleet + Growth */}
      <div className="cockpit-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        {/* Licensing */}
        <div className="card">
          <div className="card-header">
            <h3 className="cockpit-section-title"><KeyRound size={16} color="var(--chart-8)" /> Licenciamento</h3>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { label: 'Ativas', value: licensing.active, color: 'var(--color-success)' },
              { label: 'Trial', value: licensing.trial, color: 'var(--color-info)' },
              { label: 'Expirando (30d)', value: licensing.expiring, color: 'var(--color-warning)' },
              { label: 'Suspensas', value: licensing.suspended, color: 'var(--color-danger)' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} />
                  <span>{item.label}</span>
                </div>
                <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: 14 }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Fleet */}
        <div className="card">
          <div className="card-header">
            <h3 className="cockpit-section-title"><HardDrive size={16} color="var(--chart-6)" /> Fleet Global</h3>
          </div>
          <div className="card-body">
            <DonutChart
              segments={[
                { label: 'Online', value: fleetStatus.online, color: 'var(--color-success)' },
                { label: 'Instável', value: fleetStatus.unstable, color: 'var(--color-warning)' },
                { label: 'Offline', value: fleetStatus.offline, color: 'var(--color-danger)' },
              ]}
              size={120}
              thickness={16}
              centerValue={kpis.totalDevices}
              centerLabel="Total"
            />
          </div>
        </div>

        {/* Growth */}
        <div className="card">
          <div className="card-header">
            <h3 className="cockpit-section-title"><TrendingUp size={16} color="var(--chart-1)" /> Crescimento</h3>
          </div>
          <div className="card-body" style={{ textAlign: 'center' }}>
            <Sparkline data={trendData.length >= 2 ? trendData : [8200, 9400, 10100, 11800, 12847]} width={180} height={50} color="var(--chart-1)" strokeWidth={2.5} showDots fillOpacity={0.1} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-success)' }}>+{growth.newSchools}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Escolas (30d)</div>
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--chart-4)' }}>+{growth.newDevices}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Devices (30d)</div>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Total Alunos na Plataforma</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{kpis.totalStudents.toLocaleString()}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
