import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { KPICard } from '../components/cockpit/KPICard';
import { DonutChart } from '../components/charts/DonutChart';
import { EmptyState } from '../components/ui/EmptyState';
import { SkeletonKPIRow, SkeletonTable } from '../components/ui/Skeleton';
import {
  School, HardDrive, Activity, Shield, AlertTriangle, Bell, BellOff,
  CheckCircle, XCircle, Clock, Send,
} from 'lucide-react';

interface IntegratorAnalytics {
  kpis: {
    totalSchools: number;
    totalDevices: number;
    totalEventsToday: number;
    fleetUptime: number;
    alertsCount: number;
  };
  schools: {
    id: string; name: string; slug: string;
    totalStudents: number; eventsToday: number;
    devicesTotal: number; devicesOnline: number;
    healthStatus: string;
  }[];
  fleetStatus: { online: number; unstable: number; offline: number };
  notificationPipeline: { sent: number; pending: number; failed: number };
}

function getDemoData(): IntegratorAnalytics {
  return {
    kpis: { totalSchools: 18, totalDevices: 126, totalEventsToday: 4283, fleetUptime: 97.1, alertsCount: 3 },
    schools: [
      { id: '1', name: 'Colégio Horizonte', slug: 'horizonte', totalStudents: 420, eventsToday: 412, devicesTotal: 8, devicesOnline: 7, healthStatus: 'degraded' },
      { id: '2', name: 'Colégio Atlas', slug: 'atlas', totalStudents: 380, eventsToday: 238, devicesTotal: 6, devicesOnline: 5, healthStatus: 'degraded' },
      { id: '3', name: 'Colégio Prisma', slug: 'prisma', totalStudents: 290, eventsToday: 187, devicesTotal: 4, devicesOnline: 4, healthStatus: 'healthy' },
      { id: '4', name: 'Colégio Delta', slug: 'delta', totalStudents: 0, eventsToday: 0, devicesTotal: 3, devicesOnline: 0, healthStatus: 'critical' },
      { id: '5', name: 'Escola Lume', slug: 'lume', totalStudents: 180, eventsToday: 92, devicesTotal: 3, devicesOnline: 3, healthStatus: 'healthy' },
    ],
    fleetStatus: { online: 118, unstable: 5, offline: 3 },
    notificationPipeline: { sent: 3218, pending: 12, failed: 47 },
  };
}

export default function CockpitIntegrator() {
  const { profile, token, isDemo } = useAuth();
  const [data, setData] = useState<IntegratorAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMockData, setIsMockData] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    if (isDemo) { setData(getDemoData()); setIsMockData(true); setLoading(false); return; }
    try {
      const res = await fetch('/api/analytics/integrator/today', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { setData(await res.json()); setIsMockData(false); }
      else { setData(getDemoData()); setIsMockData(true); }
    } catch { setData(getDemoData()); setIsMockData(true); }
    setLoading(false);
  };

  const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };

  if (loading) return (
    <div className="animate-fade-in">
      <div className="skeleton" style={{ width: 250, height: 20, marginBottom: 8 }} />
      <div className="skeleton" style={{ width: 350, height: 14, marginBottom: 24 }} />
      <SkeletonKPIRow count={5} />
      <div style={{ marginTop: 16 }}><SkeletonTable rows={6} cols={5} /></div>
    </div>
  );

  if (!data) return <EmptyState icon="analytics" title="Sem dados" description="Nenhuma métrica disponível para o integrador." />;

  const { kpis, schools, fleetStatus, notificationPipeline } = data;
  const statusIcon = (s: string) => s === 'healthy' ? <CheckCircle size={14} color="var(--color-success)" /> : s === 'degraded' ? <AlertTriangle size={14} color="var(--color-warning)" /> : <XCircle size={14} color="var(--color-danger)" />;

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
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--color-primary-800)' }}>Cockpit Integrador</h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>{greeting()}, equipe {profile?.name?.split(' ')[0]} — saúde operacional do portfólio</p>
      </div>

      {/* KPIs */}
      <div className="cockpit-grid cockpit-grid-5" style={{ marginBottom: 24 }}>
        <KPICard label="Escolas Ativas" value={kpis.totalSchools} icon={<School size={16} color="var(--color-primary-600)" />} iconBg="var(--color-primary-50)" />
        <KPICard label="Fleet Devices" value={kpis.totalDevices} icon={<HardDrive size={16} color="var(--chart-6)" />} iconBg="#f0fdfa" />
        <KPICard label="Eventos Hoje" value={kpis.totalEventsToday.toLocaleString()} icon={<Activity size={16} color="var(--chart-4)" />} iconBg="#f5f3ff" />
        <KPICard label="Uptime Fleet" value={`${kpis.fleetUptime}%`} icon={<Shield size={16} color="var(--color-success)" />} iconBg="var(--color-success-bg)" trend={{ value: kpis.fleetUptime >= 95 ? 'Saudável' : 'Degradado', direction: kpis.fleetUptime >= 95 ? 'up' : 'down' }} />
        <KPICard label="Alertas Ativos" value={kpis.alertsCount} icon={<AlertTriangle size={16} color="var(--color-danger)" />} iconBg="var(--color-danger-bg)" trend={{ value: kpis.alertsCount === 0 ? 'Nenhum' : 'Atenção', direction: kpis.alertsCount === 0 ? 'up' : 'down' }} />
      </div>

      {/* Schools Table */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3 className="cockpit-section-title"><School size={16} color="var(--color-primary-600)" /> Saúde das Escolas</h3>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Escola</th>
                <th>Alunos</th>
                <th>Eventos Hoje</th>
                <th>Devices</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {schools.map(s => (
                <tr key={s.id} style={{ cursor: 'pointer' }}>
                  <td className="td-bold">{s.name}</td>
                  <td>{s.totalStudents}</td>
                  <td className="td-mono">{s.eventsToday.toLocaleString()}</td>
                  <td>
                    <span style={{ color: s.devicesOnline === s.devicesTotal ? 'var(--color-success)' : 'var(--color-warning)' }}>
                      {s.devicesOnline}/{s.devicesTotal}
                    </span>
                  </td>
                  <td>{statusIcon(s.healthStatus)} <span style={{ fontSize: 12, marginLeft: 4, textTransform: 'capitalize' }}>{s.healthStatus === 'healthy' ? 'Saudável' : s.healthStatus === 'degraded' ? 'Degradado' : 'Crítico'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row 3: Fleet + Notifications */}
      <div className="cockpit-grid cockpit-grid-2col">
        {/* Fleet Donut */}
        <div className="card">
          <div className="card-header">
            <h3 className="cockpit-section-title"><HardDrive size={16} color="var(--chart-6)" /> Fleet Device Status</h3>
          </div>
          <div className="card-body">
            <DonutChart
              segments={[
                { label: 'Online', value: fleetStatus.online, color: 'var(--color-success)' },
                { label: 'Instável', value: fleetStatus.unstable, color: 'var(--color-warning)' },
                { label: 'Offline', value: fleetStatus.offline, color: 'var(--color-danger)' },
              ]}
              size={130}
              thickness={18}
              centerValue={`${Math.round((fleetStatus.online / (fleetStatus.online + fleetStatus.unstable + fleetStatus.offline || 1)) * 100)}%`}
              centerLabel="Online"
            />
          </div>
        </div>

        {/* Notification Pipeline */}
        <div className="card">
          <div className="card-header">
            <h3 className="cockpit-section-title"><Bell size={16} color="var(--chart-4)" /> Pipeline de Notificações</h3>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--color-success)' }}>{notificationPipeline.sent.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}><Send size={11} /> Enviadas</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--color-warning)' }}>{notificationPipeline.pending}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}><Clock size={11} /> Em Fila</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--color-danger)' }}>{notificationPipeline.failed}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}><BellOff size={11} /> Falhadas</div>
              </div>
            </div>
            {notificationPipeline.failed > 0 && (
              <div style={{ fontSize: 12, padding: '8px 12px', background: 'var(--color-danger-bg)', borderRadius: 'var(--radius-sm)', color: 'var(--color-danger)' }}>
                Taxa de falha: {((notificationPipeline.failed / (notificationPipeline.sent + notificationPipeline.failed || 1)) * 100).toFixed(1)}%
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
