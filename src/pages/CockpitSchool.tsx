import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { KPICard } from '../components/cockpit/KPICard';
import { HorizontalBarChart, HeatmapGrid } from '../components/charts/BarChart';
import { DonutChart } from '../components/charts/DonutChart';
import { Sparkline } from '../components/charts/Sparkline';
import { EmptyState } from '../components/ui/EmptyState';
import { SkeletonKPIRow, SkeletonCard } from '../components/ui/Skeleton';
import {
  LogIn, Users, BellOff, HardDrive, Clock, UserX, AlertTriangle, TrendingUp,
} from 'lucide-react';

interface SchoolAnalytics {
  kpis: {
    totalEvents: number;
    entries: number;
    denied: number;
    unlinked: number;
    totalStudents: number;
    studentsPresent: number;
    attendanceRate: number;
    notifSent: number;
    notifFailed: number;
    devicesOnline: number;
    devicesOffline: number;
  };
  hourlyDistribution: { hour: number; count: number }[];
  attendanceByClass: { classGroup: string; total: number; present: number; rate: number }[];
  weeklyTrend: { report_date: string; attendance_rate: number }[];
}

interface AbsentStudent {
  id: string;
  name: string;
  enrollment: string;
  classGroup: string;
  shift: string;
  grade: string;
}

// Demo data for when API is unavailable
function getDemoData(): SchoolAnalytics {
  const now = new Date();
  const currentHour = now.getHours();
  return {
    kpis: {
      totalEvents: 412, entries: 378, denied: 3, unlinked: 5,
      totalStudents: 420, studentsPresent: 406, attendanceRate: 96.7,
      notifSent: 742, notifFailed: 13, devicesOnline: 3, devicesOffline: 1,
    },
    hourlyDistribution: Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      count: h >= 6 && h <= 8 ? Math.floor(Math.random() * 120 + 40) : h >= 11 && h <= 13 ? Math.floor(Math.random() * 60 + 20) : h <= currentHour ? Math.floor(Math.random() * 15) : 0,
    })),
    attendanceByClass: [
      { classGroup: '6A', total: 35, present: 33, rate: 94 },
      { classGroup: '6B', total: 38, present: 36, rate: 95 },
      { classGroup: '7A', total: 32, present: 30, rate: 94 },
      { classGroup: '7B', total: 34, present: 30, rate: 88 },
      { classGroup: '8A', total: 36, present: 35, rate: 97 },
      { classGroup: '8B', total: 33, present: 31, rate: 94 },
      { classGroup: '9A', total: 35, present: 34, rate: 97 },
      { classGroup: '9B', total: 30, present: 25, rate: 83 },
    ],
    weeklyTrend: [
      { report_date: '2026-04-11', attendance_rate: 94.2 },
      { report_date: '2026-04-12', attendance_rate: 93.8 },
      { report_date: '2026-04-14', attendance_rate: 95.1 },
      { report_date: '2026-04-15', attendance_rate: 96.3 },
      { report_date: '2026-04-16', attendance_rate: 95.7 },
    ],
  };
}

const DEMO_ABSENT: AbsentStudent[] = [
  { id: '1', name: 'João Pedro Silva', enrollment: '2026010', classGroup: '8A', shift: 'manhã', grade: '8ª série' },
  { id: '2', name: 'Maria Clara Santos', enrollment: '2026022', classGroup: '7B', shift: 'manhã', grade: '7ª série' },
  { id: '3', name: 'Lucas Ferreira', enrollment: '2026035', classGroup: '9B', shift: 'manhã', grade: '9ª série' },
  { id: '4', name: 'Ana Beatriz Costa', enrollment: '2026041', classGroup: '6A', shift: 'tarde', grade: '6ª série' },
  { id: '5', name: 'Rafael Oliveira', enrollment: '2026048', classGroup: '9B', shift: 'manhã', grade: '9ª série' },
];

export default function CockpitSchool() {
  const { profile, token, isDemo } = useAuth();
  const { lastEvent } = useSocket();
  const [data, setData] = useState<SchoolAnalytics | null>(null);
  const [absent, setAbsent] = useState<AbsentStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMockData, setIsMockData] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  // Increment entries on live events
  useEffect(() => {
    if (!lastEvent || !data) return;
    if (lastEvent.direction === 'entry' && lastEvent.status === 'granted') {
      setData(prev => prev ? {
        ...prev,
        kpis: {
          ...prev.kpis,
          totalEvents: prev.kpis.totalEvents + 1,
          entries: prev.kpis.entries + 1,
        },
      } : prev);
    }
  }, [lastEvent]);

  const loadData = async () => {
    if (isDemo) {
      setData(getDemoData());
      setAbsent(DEMO_ABSENT);
      setIsMockData(true);
      setLoading(false);
      return;
    }

    let usedMock = false;
    try {
      const schoolId = profile?.schoolId || '';
      const [analyticsRes, absentRes] = await Promise.all([
        fetch(`/api/analytics/school/today?schoolId=${schoolId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/analytics/school/absent?schoolId=${schoolId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (analyticsRes.ok) {
        setData(await analyticsRes.json());
      } else {
        setData(getDemoData());
        usedMock = true;
      }

      if (absentRes.ok) {
        const absentData = await absentRes.json();
        setAbsent(absentData.absent || []);
      } else {
        setAbsent(DEMO_ABSENT);
        usedMock = true;
      }
    } catch {
      setData(getDemoData());
      setAbsent(DEMO_ABSENT);
      usedMock = true;
    }
    setIsMockData(usedMock);
    setLoading(false);
  };

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  if (loading) {
    return (
      <div className="animate-fade-in">
        <div style={{ marginBottom: 24 }}>
          <div className="skeleton" style={{ width: 200, height: 20 }} />
          <div className="skeleton" style={{ width: 300, height: 14, marginTop: 8 }} />
        </div>
        <SkeletonKPIRow count={4} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
          <SkeletonCard height={260} />
          <SkeletonCard height={260} />
        </div>
      </div>
    );
  }

  if (!data) {
    return <EmptyState icon="analytics" title="Sem dados disponíveis" description="Os dados de analytics serão exibidos quando houver eventos processados." />;
  }

  const { kpis, hourlyDistribution, attendanceByClass, weeklyTrend } = data;

  // Format heatmap cells (only show hours 6-18 for relevance)
  const heatmapCells = hourlyDistribution
    .filter(h => h.hour >= 6 && h.hour <= 18)
    .map(h => ({ label: `${h.hour}h`, value: h.count }));

  const weeklyData = weeklyTrend.map(w => w.attendance_rate);

  return (
    <div className="animate-fade-in-up">
      {/* Mock data warning banner */}
      {isMockData && (
        <div style={{
          background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: 'var(--radius-md)',
          padding: '10px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10,
          fontSize: 13, color: '#92400e',
        }}>
          <AlertTriangle size={16} color="#f59e0b" style={{ flexShrink: 0 }} />
          <span>
            <strong>Dados de demonstração</strong> — A API de analytics não está disponível. Os números exibidos são fictícios.
          </span>
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--color-primary-800)' }}>
          Cockpit Escolar
        </h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
          {greeting()}, {profile?.name?.split(' ')[0]} — resumo operacional do dia
        </p>
      </div>

      {/* KPI Row */}
      <div className="cockpit-grid cockpit-grid-4" style={{ marginBottom: 24 }}>
        <KPICard
          label="Entradas Hoje"
          value={kpis.entries}
          icon={<LogIn size={16} color="var(--color-primary-600)" />}
          iconBg="var(--color-primary-50)"
          trend={{ value: `${kpis.totalEvents} eventos`, direction: 'neutral' }}
          sparklineData={hourlyDistribution.slice(6, 19).map(h => h.count)}
          sparklineColor="var(--chart-1)"
        />
        <KPICard
          label="Presença"
          value={`${kpis.attendanceRate}%`}
          icon={<Users size={16} color="var(--color-success)" />}
          iconBg="var(--color-success-bg)"
          trend={{
            value: `${kpis.studentsPresent}/${kpis.totalStudents}`,
            direction: kpis.attendanceRate >= 95 ? 'up' : kpis.attendanceRate >= 85 ? 'neutral' : 'down',
          }}
          sparklineData={weeklyData}
          sparklineColor="var(--color-success)"
        />
        <KPICard
          label="Falhas Notificação"
          value={kpis.notifFailed}
          icon={<BellOff size={16} color={kpis.notifFailed > 10 ? 'var(--color-danger)' : 'var(--color-warning)'} />}
          iconBg={kpis.notifFailed > 10 ? 'var(--color-danger-bg)' : 'var(--color-warning-bg)'}
          trend={{ value: `${kpis.notifSent} enviadas`, direction: 'neutral' }}
        />
        <KPICard
          label="Dispositivos"
          value={`${kpis.devicesOnline}/${kpis.devicesOnline + kpis.devicesOffline}`}
          icon={<HardDrive size={16} color={kpis.devicesOffline > 0 ? 'var(--color-danger)' : 'var(--color-success)'} />}
          iconBg={kpis.devicesOffline > 0 ? 'var(--color-danger-bg)' : 'var(--color-success-bg)'}
          suffix="online"
          trend={{
            value: kpis.devicesOffline > 0 ? `${kpis.devicesOffline} offline` : 'Todos online',
            direction: kpis.devicesOffline > 0 ? 'down' : 'up',
          }}
        />
      </div>

      {/* Row 2: Heatmap + Attendance by Class */}
      <div className="cockpit-grid cockpit-grid-2col" style={{ marginBottom: 24 }}>
        {/* Heatmap */}
        <div className="card">
          <div className="card-header">
            <h3 className="cockpit-section-title">
              <Clock size={16} color="var(--color-primary-600)" />
              Entradas por Hora
            </h3>
          </div>
          <div className="card-body">
            <HeatmapGrid
              cells={heatmapCells}
              color="var(--color-primary-600)"
              cellSize={42}
            />
            <div style={{ marginTop: 12, fontSize: 11, color: 'var(--color-text-muted)' }}>
              Pico: {hourlyDistribution.reduce((max, h) => h.count > max.count ? h : max, { hour: 0, count: 0 }).hour}h
              ({hourlyDistribution.reduce((max, h) => h.count > max.count ? h : max, { hour: 0, count: 0 }).count} entradas)
            </div>
          </div>
        </div>

        {/* Attendance by class */}
        <div className="card">
          <div className="card-header">
            <h3 className="cockpit-section-title">
              <Users size={16} color="var(--color-success)" />
              Presença por Turma
            </h3>
          </div>
          <div className="card-body">
            <HorizontalBarChart
              items={attendanceByClass.map(c => ({
                label: c.classGroup,
                value: c.rate,
                suffix: '%',
                color: c.rate >= 95 ? 'var(--color-success)' : c.rate >= 85 ? 'var(--color-warning)' : 'var(--color-danger)',
              }))}
              maxValue={100}
              height={20}
            />
          </div>
        </div>
      </div>

      {/* Row 3: Absent Students + Weekly Trend + Incidents */}
      <div className="cockpit-grid" style={{ gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        {/* Absent students */}
        <div className="card">
          <div className="card-header">
            <h3 className="cockpit-section-title">
              <UserX size={16} color="var(--color-warning)" />
              Alunos Ausentes Hoje
            </h3>
            <span className="badge badge-warning">{absent.length}</span>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {absent.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
                ✅ Todos os alunos presentes
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Aluno</th>
                    <th>Turma</th>
                    <th>Turno</th>
                    <th>Matrícula</th>
                  </tr>
                </thead>
                <tbody>
                  {absent.slice(0, 8).map(s => (
                    <tr key={s.id}>
                      <td className="td-bold">{s.name}</td>
                      <td>{s.classGroup}</td>
                      <td>{s.shift}</td>
                      <td className="td-mono">{s.enrollment}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {absent.length > 8 && (
              <div className="card-footer" style={{ textAlign: 'center' }}>
                <button className="btn btn-ghost btn-sm">+ {absent.length - 8} alunos ausentes</button>
              </div>
            )}
          </div>
        </div>

        {/* Weekly trend + Incidents */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Weekly trend */}
          <div className="card">
            <div className="card-header">
              <h3 className="cockpit-section-title">
                <TrendingUp size={16} color="var(--chart-1)" />
                Frequência 7 Dias
              </h3>
            </div>
            <div className="card-body" style={{ textAlign: 'center' }}>
              <Sparkline
                data={weeklyData.length > 0 ? weeklyData : [92, 93, 95, 94, 96]}
                width={200}
                height={60}
                color="var(--chart-1)"
                strokeWidth={2.5}
                showDots
                fillOpacity={0.12}
              />
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 8, color: 'var(--color-text)' }}>
                {weeklyData.length > 0 ? weeklyData[weeklyData.length - 1] : '—'}%
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Média semanal</div>
            </div>
          </div>

          {/* Incidents */}
          <div className="card">
            <div className="card-header">
              <h3 className="cockpit-section-title">
                <AlertTriangle size={16} color="var(--color-warning)" />
                Incidentes
              </h3>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {kpis.devicesOffline > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-danger)', flexShrink: 0 }} />
                  <span>{kpis.devicesOffline} dispositivo{kpis.devicesOffline > 1 ? 's' : ''} offline</span>
                </div>
              )}
              {kpis.notifFailed > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-warning)', flexShrink: 0 }} />
                  <span>{kpis.notifFailed} notificações falharam</span>
                </div>
              )}
              {kpis.unlinked > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-info)', flexShrink: 0 }} />
                  <span>{kpis.unlinked} eventos sem vínculo</span>
                </div>
              )}
              {kpis.devicesOffline === 0 && kpis.notifFailed === 0 && kpis.unlinked === 0 && (
                <div style={{ fontSize: 12, color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  ✅ Nenhum incidente ativo
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
