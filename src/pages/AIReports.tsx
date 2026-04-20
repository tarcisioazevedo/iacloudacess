import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import AIPeriodSelector, { type Period } from '../components/ai/AIPeriodSelector';
import AIDrillDown, { type DrillLevel } from '../components/ai/AIDrillDown';
import AIInsightCard from '../components/ai/AIInsightCard';
import AIQueryBox from '../components/ai/AIQueryBox';
import AIUsageBar from '../components/ai/AIUsageBar';
import AIFilterSidebar, { type AIFilters } from '../components/ai/AIFilterSidebar';
import AIConfigModal from '../components/ai/AIConfigModal';
import { type Anomaly } from '../components/ai/AIAnomalyBadge';
import {
  Brain, Settings, TrendingUp, AlertTriangle, BarChart3,
  GitCompareArrows, Filter, RefreshCw,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface DrillPathItem {
  level: DrillLevel;
  label: string;
  id?: string;
  name?: string;
}

interface InsightState {
  text: string | null;
  cached: boolean;
  latencyMs: number;
}

const EMPTY_INSIGHT: InsightState = { text: null, cached: false, latencyMs: 0 };

// ── Period → days mapping ─────────────────────────────────────────────────────
function periodToDates(period: Period, customStart: string, customEnd: string) {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  const daysBefore = (n: number) => new Date(now.getTime() - n * 86_400_000);
  switch (period) {
    case 'today':   return { startDate: fmt(now), endDate: fmt(now) };
    case 'week':    return { startDate: fmt(daysBefore(7)), endDate: fmt(now) };
    case 'month':   return { startDate: fmt(daysBefore(30)), endDate: fmt(now) };
    case 'quarter': return { startDate: fmt(daysBefore(90)), endDate: fmt(now) };
    case 'custom':  return { startDate: customStart, endDate: customEnd };
    default:        return { startDate: fmt(daysBefore(7)), endDate: fmt(now) };
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AIReports() {
  const { profile, token } = useAuth();
  const role = profile?.role ?? '';

  // Layout
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showConfig, setShowConfig] = useState(false);

  // Drill-down path
  const [drillPath, setDrillPath] = useState<DrillPathItem[]>(() => {
    if (role === 'superadmin')      return [{ level: 'platform', label: 'Plataforma', name: 'Plataforma' }];
    if (role === 'integrator_admin' || role === 'integrator_support')
                                    return [{ level: 'integrator', label: 'Integradora', name: 'Integradora' }];
    return [{ level: 'school', label: 'Escola', name: profile?.schoolId ? 'Escola' : 'Escola' }];
  });

  // Filters and period
  const [period, setPeriod]           = useState<Period>('week');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd]     = useState('');
  const [filters, setFilters]         = useState<AIFilters>({
    schoolId: profile?.schoolId ?? undefined,
  });

  // Schools list (for sidebar + drill)
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);

  // Insights state
  const [summary, setSummary]     = useState<InsightState>(EMPTY_INSIGHT);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [nlAnswer, setNlAnswer]   = useState<string | null>(null);
  const [compare, setCompare]     = useState<InsightState>(EMPTY_INSIGHT);
  const [attendance, setAttendance] = useState<InsightState>(EMPTY_INSIGHT);

  // Loading state
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const setLoad = (key: string, v: boolean) => setLoading(p => ({ ...p, [key]: v }));

  // Not configured banner
  const [notConfigured, setNotConfigured] = useState(false);

  // Load schools list
  useEffect(() => {
    if (!token) return;
    fetch('/api/schools', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setSchools((d.schools ?? []).map((s: any) => ({ id: s.id, name: s.name }))))
      .catch(() => {});
  }, [token]);

  // Resolve schoolId from filters or drill path
  const resolvedSchoolId = filters.schoolId
    ?? drillPath.find(p => p.level === 'school')?.id
    ?? profile?.schoolId
    ?? undefined;

  // ── API helper ─────────────────────────────────────────────────────────────
  const apiCall = useCallback(async (
    method: 'GET' | 'POST',
    path: string,
    body?: object,
  ) => {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 403) setNotConfigured(true);
      throw new Error(data.message ?? 'Erro');
    }
    setNotConfigured(false);
    return data;
  }, [token]);

  // ── Fetch summary ──────────────────────────────────────────────────────────
  const fetchSummary = useCallback(async () => {
    setLoad('summary', true);
    try {
      const params = new URLSearchParams({ period });
      if (resolvedSchoolId) params.set('schoolId', resolvedSchoolId);
      const d = await apiCall('GET', `/api/ai/reports/summary/${period}?${params}`);
      setSummary({ text: d.text, cached: d.cached, latencyMs: d.latencyMs });
    } catch (e: any) {
      setSummary({ text: `❌ ${e.message}`, cached: false, latencyMs: 0 });
    } finally {
      setLoad('summary', false);
    }
  }, [period, resolvedSchoolId, apiCall]);

  // ── Fetch attendance insight ───────────────────────────────────────────────
  const fetchAttendance = useCallback(async () => {
    if (!resolvedSchoolId) return;
    setLoad('attendance', true);
    try {
      const dates = periodToDates(period, customStart, customEnd);
      const d = await apiCall('POST', '/api/ai/reports/attendance', {
        schoolId: resolvedSchoolId, period, ...dates,
      });
      setAttendance({ text: d.text, cached: d.cached, latencyMs: d.latencyMs });
    } catch (e: any) {
      setAttendance({ text: `❌ ${e.message}`, cached: false, latencyMs: 0 });
    } finally {
      setLoad('attendance', false);
    }
  }, [resolvedSchoolId, period, customStart, customEnd, apiCall]);

  // ── Fetch anomalies ────────────────────────────────────────────────────────
  const fetchAnomalies = useCallback(async () => {
    if (!resolvedSchoolId) return;
    setLoad('anomalies', true);
    try {
      const dayMap: Record<Period, number> = { today: 1, week: 7, month: 30, quarter: 90, custom: 30 };
      const d = await apiCall('POST', '/api/ai/reports/anomalies', {
        schoolId: resolvedSchoolId, days: dayMap[period],
      });
      setAnomalies(d.anomalies ?? []);
    } catch {
      setAnomalies([]);
    } finally {
      setLoad('anomalies', false);
    }
  }, [resolvedSchoolId, period, apiCall]);

  // ── Fetch compare ──────────────────────────────────────────────────────────
  const fetchCompare = useCallback(async () => {
    if (!resolvedSchoolId) return;
    setLoad('compare', true);
    try {
      const now = new Date();
      const dayMap: Record<Period, number> = { today: 1, week: 7, month: 30, quarter: 90, custom: 7 };
      const days = dayMap[period];
      const fmt = (d: Date) => d.toISOString().split('T')[0];
      const d = await apiCall('POST', '/api/ai/reports/compare', {
        schoolId:      resolvedSchoolId,
        currentStart:  fmt(new Date(now.getTime() - days * 86_400_000)),
        currentEnd:    fmt(now),
        previousStart: fmt(new Date(now.getTime() - 2 * days * 86_400_000)),
        previousEnd:   fmt(new Date(now.getTime() - days * 86_400_000)),
        period,
      });
      setCompare({ text: d.text, cached: d.cached, latencyMs: d.latencyMs });
    } catch (e: any) {
      setCompare({ text: `❌ ${e.message}`, cached: false, latencyMs: 0 });
    } finally {
      setLoad('compare', false);
    }
  }, [resolvedSchoolId, period, apiCall]);

  // ── Natural language query ─────────────────────────────────────────────────
  const handleNLQuery = useCallback(async (question: string) => {
    setLoad('nl', true);
    try {
      const d = await apiCall('POST', '/api/ai/query', {
        question,
        schoolId: resolvedSchoolId,
        context: { period, filters },
      });
      setNlAnswer(d.text);
    } catch (e: any) {
      setNlAnswer(`❌ ${e.message}`);
    } finally {
      setLoad('nl', false);
    }
  }, [resolvedSchoolId, period, filters, apiCall]);

  // ── Drill-down navigation ──────────────────────────────────────────────────
  const navigateDrill = (item: DrillPathItem, index: number) => {
    setDrillPath(prev => prev.slice(0, index + 1));
    if (item.level === 'school' && item.id) {
      setFilters(p => ({ ...p, schoolId: item.id }));
    }
  };

  const drillInto = (level: DrillLevel, id: string, name: string) => {
    setDrillPath(prev => [...prev, { level, id, name, label: name }]);
    if (level === 'school') setFilters(p => ({ ...p, schoolId: id }));
  };

  // ── Refresh all ───────────────────────────────────────────────────────────
  const refreshAll = () => {
    fetchSummary();
    fetchAttendance();
    fetchAnomalies();
    fetchCompare();
  };

  const anyLoading = Object.values(loading).some(Boolean);

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)', overflow: 'hidden', margin: '-24px -20px' }}>

      {/* Filter sidebar */}
      {sidebarOpen && (
        <AIFilterSidebar
          filters={filters}
          onChange={setFilters}
          schools={schools}
          onToggle={() => setSidebarOpen(false)}
        />
      )}

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Top bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          padding: '10px 18px', borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-surface)', flexShrink: 0,
        }}>
          {/* Sidebar toggle */}
          {!sidebarOpen && (
            <button onClick={() => setSidebarOpen(true)}
              style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 7, padding: '5px 8px', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Filter size={13} />
            </button>
          )}

          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Brain size={18} style={{ color: '#7c3aed' }} />
            <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-text)' }}>IA Analytics</span>
          </div>

          {/* Drill-down breadcrumb */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <AIDrillDown
              path={drillPath}
              onNavigate={navigateDrill}
              userRole={role}
            />
          </div>

          {/* Period selector */}
          <AIPeriodSelector
            value={period}
            onChange={setPeriod}
            customStart={customStart}
            customEnd={customEnd}
            onCustomChange={(s, e) => { setCustomStart(s); setCustomEnd(e); }}
          />

          {/* Token usage */}
          {token && <AIUsageBar token={token} />}

          {/* Refresh all */}
          <button
            onClick={refreshAll}
            disabled={anyLoading}
            title="Atualizar todos os insights"
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 12px', background: 'var(--color-bg)', border: '1px solid var(--color-border)',
              borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: anyLoading ? 'not-allowed' : 'pointer',
              color: 'var(--color-text-secondary)', opacity: anyLoading ? 0.6 : 1,
            }}
          >
            <RefreshCw size={12} style={{ animation: anyLoading ? 'spin 1s linear infinite' : 'none' }} />
            Atualizar
          </button>

          {/* Config button — admins only; end users see a read-only status badge */}
          {['superadmin', 'integrator_admin'].includes(role) ? (
            <button onClick={() => setShowConfig(true)}
              title="Configurar chaves de API"
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 12px', background: '#7c3aed', color: '#fff',
                border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>
              <Settings size={12} /> Configurar IA
            </button>
          ) : (
            /* school_admin / coordinator: read-only status indicator */
            <button onClick={() => setShowConfig(true)}
              title="Ver status da IA"
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 10px', background: 'var(--color-bg)',
                border: '1px solid var(--color-border)', borderRadius: 7,
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                color: 'var(--color-text-muted)',
              }}>
              <Brain size={12} style={{ color: '#7c3aed' }} /> Status IA
            </button>
          )}
        </div>

        {/* Not configured banner */}
        {notConfigured && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px',
            background: '#fef9c3', borderBottom: '1px solid #fde68a',
          }}>
            <AlertTriangle size={15} style={{ color: '#d97706', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: '#92400e' }}>
              IA não configurada. Clique em <strong>Configurar IA</strong> para adicionar sua chave API (Gemini ou OpenAI).
            </span>
            <button onClick={() => setShowConfig(true)}
              style={{ marginLeft: 'auto', padding: '4px 12px', background: '#d97706', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              Configurar agora
            </button>
          </div>
        )}

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px' }}>

          {/* School drill-down pills (for integrator/superadmin) */}
          {(role === 'integrator_admin' || role === 'superadmin') && schools.length > 0
            && drillPath[drillPath.length - 1]?.level !== 'school' && (
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>
                Drill-down por escola
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {schools.map(s => (
                  <button key={s.id}
                    onClick={() => drillInto('school', s.id, s.name)}
                    style={{
                      padding: '4px 12px', fontSize: 12, fontWeight: 500,
                      background: resolvedSchoolId === s.id ? '#f3e8ff' : 'var(--color-bg)',
                      color: resolvedSchoolId === s.id ? '#7c3aed' : 'var(--color-text-secondary)',
                      border: `1px solid ${resolvedSchoolId === s.id ? '#ddd6fe' : 'var(--color-border)'}`,
                      borderRadius: 99, cursor: 'pointer', transition: 'all 0.15s',
                    }}>
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* NL Query box */}
          <div style={{ marginBottom: 14 }}>
            <AIQueryBox
              onSubmit={handleNLQuery}
              loading={loading.nl ?? false}
              answer={nlAnswer}
            />
          </div>

          {/* Insights grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 14 }}>

            {/* Summary */}
            <AIInsightCard
              title="Resumo Executivo"
              icon={<TrendingUp size={15} style={{ color: '#7c3aed' }} />}
              text={summary.text}
              loading={loading.summary ?? false}
              cached={summary.cached}
              latencyMs={summary.latencyMs}
              onRefresh={fetchSummary}
              emptyLabel="Clique em atualizar para gerar resumo executivo do período"
            />

            {/* Anomalies */}
            <AIInsightCard
              title="Anomalias Detectadas"
              icon={<AlertTriangle size={15} style={{ color: '#d97706' }} />}
              anomalies={anomalies}
              loading={loading.anomalies ?? false}
              cached={false}
              onRefresh={fetchAnomalies}
              emptyLabel="Clique em atualizar para detectar anomalias"
            />

            {/* Attendance insight */}
            {resolvedSchoolId && (
              <AIInsightCard
                title="Análise de Presença"
                icon={<BarChart3 size={15} style={{ color: '#0369a1' }} />}
                text={attendance.text}
                loading={loading.attendance ?? false}
                cached={attendance.cached}
                latencyMs={attendance.latencyMs}
                onRefresh={fetchAttendance}
                emptyLabel="Selecione uma escola para análise de presença"
              />
            )}

            {/* Comparative */}
            {resolvedSchoolId && (
              <AIInsightCard
                title={`Comparativo de Período (${period === 'week' ? '7 dias' : period === 'month' ? '30 dias' : period === 'quarter' ? '90 dias' : 'período'})`}
                icon={<GitCompareArrows size={15} style={{ color: '#059669' }} />}
                text={compare.text}
                loading={loading.compare ?? false}
                cached={compare.cached}
                latencyMs={compare.latencyMs}
                onRefresh={fetchCompare}
                emptyLabel="Clique para comparar período atual com anterior"
              />
            )}
          </div>

          {/* Empty state when no school selected and is school_admin */}
          {!resolvedSchoolId && (role === 'school_admin' || role === 'coordinator') && (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--color-text-muted)' }}>
              <Brain size={40} style={{ opacity: 0.2, marginBottom: 12 }} />
              <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 8px', color: 'var(--color-text-secondary)' }}>
                Nenhuma escola vinculada ao seu perfil
              </p>
              <p style={{ fontSize: 13, margin: 0 }}>
                Entre em contato com o administrador do integrador.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Config modal */}
      {showConfig && token && (
        <AIConfigModal token={token} userRole={role} onClose={() => setShowConfig(false)} />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
