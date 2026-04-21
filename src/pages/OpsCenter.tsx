import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  Activity,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
  TriangleAlert,
  Filter,
  Database,
} from 'lucide-react';

interface OpsLogRow {
  id: string;
  createdAt: string;
  level: 'debug' | 'info' | 'warn' | 'error' | string;
  source: string;
  category: string | null;
  outcome: string | null;
  message: string;
  requestId: string | null;
  correlationId: string | null;
  integratorId: string | null;
  schoolId: string | null;
  schoolUnitId: string | null;
  schoolName: string | null;
  deviceId: string | null;
  deviceName: string | null;
  deviceRef: string | null;
  eventId: string | null;
  eventCode: string | null;
  transport: string | null;
  metadata: Record<string, unknown> | null;
}

interface OpsLogSummary {
  total: number;
  last24h: number;
  errors24h: number;
  warnings24h: number;
  bySource: Array<{ source: string; count: number }>;
  byOutcome: Array<{ outcome: string; count: number }>;
}

interface DeviceOption {
  id: string;
  name: string;
  location?: string | null;
}

interface OpsDeviceHealthRow {
  deviceId: string;
  deviceName: string;
  deviceRef: string | null;
  location: string | null;
  schoolName: string;
  deviceStatus: string;
  connectionPolicy: string;
  connectivityMode: string;
  lastHeartbeat: string | null;
  lastEventAt: string | null;
  lastLogAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  logs24h: number;
  errors24h: number;
  warnings24h: number;
  success24h: number;
  snapshotFailures24h: number;
  parserFailures24h: number;
  notificationFailures24h: number;
  duplicates24h: number;
  healthStatus: 'healthy' | 'attention' | 'critical' | 'idle';
  healthLabel: string;
  reasons: string[];
}

interface OpsDeviceAlert {
  severity: 'critical' | 'attention' | 'info';
  deviceId: string;
  deviceName: string;
  schoolName: string;
  title: string;
  message: string;
  reasons: string[];
  lastLogAt: string | null;
  lastHeartbeat: string | null;
  lastEventAt: string | null;
}

interface OpsHealthDashboard {
  totals: Record<'healthy' | 'attention' | 'critical' | 'idle', number>;
  alerts: OpsDeviceAlert[];
  devices: OpsDeviceHealthRow[];
}

const EMPTY_SUMMARY: OpsLogSummary = {
  total: 0,
  last24h: 0,
  errors24h: 0,
  warnings24h: 0,
  bySource: [],
  byOutcome: [],
};

const EMPTY_HEALTH_DASHBOARD: OpsHealthDashboard = {
  totals: {
    healthy: 0,
    attention: 0,
    critical: 0,
    idle: 0,
  },
  alerts: [],
  devices: [],
};

const LEVEL_BADGE: Record<string, string> = {
  debug: 'badge-neutral',
  info: 'badge-info',
  warn: 'badge-warning',
  error: 'badge-danger',
};

const HEALTH_BADGE: Record<OpsDeviceHealthRow['healthStatus'], string> = {
  healthy: 'badge-success',
  attention: 'badge-warning',
  critical: 'badge-danger',
  idle: 'badge-neutral',
};

const SEVERITY_BADGE: Record<OpsDeviceAlert['severity'], string> = {
  critical: 'badge-danger',
  attention: 'badge-warning',
  info: 'badge-neutral',
};

export default function OpsCenter() {
  const { token } = useAuth();

  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [summary, setSummary] = useState<OpsLogSummary>(EMPTY_SUMMARY);
  const [healthDashboard, setHealthDashboard] = useState<OpsHealthDashboard>(EMPTY_HEALTH_DASHBOARD);
  const [logs, setLogs] = useState<OpsLogRow[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [requestId, setRequestId] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [level, setLevel] = useState('');
  const [source, setSource] = useState('');
  const [outcome, setOutcome] = useState('');

  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const selectedLog = logs.find((log) => log.id === selectedLogId) || logs[0] || null;

  const buildParams = (nextPage: number) => {
    const params = new URLSearchParams({
      page: String(nextPage),
      limit: '40',
    });

    if (search) params.set('search', search);
    if (requestId) params.set('requestId', requestId);
    if (deviceId) params.set('deviceId', deviceId);
    if (level) params.set('level', level);
    if (source) params.set('source', source);
    if (outcome) params.set('outcome', outcome);

    return params;
  };

  const fetchJson = async (url: string) => {
    const response = await fetch(url, { headers });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Falha ao carregar dados operacionais');
    }
    return data;
  };

  const loadDevices = async () => {
    if (!token) return;

    try {
      const data = await fetchJson('/api/devices');
      setDevices((data.devices || []).map((device: any) => ({
        id: device.id,
        name: device.name,
        location: device.location,
      })));
    } catch {
      setDevices([]);
    }
  };

  const loadOps = async (nextPage = page, opts?: { silent?: boolean }) => {
    if (!token) return;

    if (opts?.silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const params = buildParams(nextPage);
      const [summaryData, logsData, healthData] = await Promise.all([
        fetchJson(`/api/ops-logs/summary?${params}`),
        fetchJson(`/api/ops-logs?${params}`),
        fetchJson(`/api/ops-logs/health?${params}`),
      ]);

      setSummary(summaryData || EMPTY_SUMMARY);
      setHealthDashboard(healthData || EMPTY_HEALTH_DASHBOARD);
      setLogs(logsData.logs || []);
      setTotal(logsData.total || 0);
      setPages(logsData.pages || 1);
      setPage(logsData.page || nextPage);
      setLastUpdatedAt(new Date().toISOString());
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar centro operacional');
      setLogs([]);
      setSummary(EMPTY_SUMMARY);
      setHealthDashboard(EMPTY_HEALTH_DASHBOARD);
      setTotal(0);
      setPages(1);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    void loadDevices();
    void loadOps(1);
  }, [token]);

  useEffect(() => {
    if (!logs.length) {
      setSelectedLogId(null);
      return;
    }

    if (!selectedLogId || !logs.some((log) => log.id === selectedLogId)) {
      setSelectedLogId(logs[0].id);
    }
  }, [logs, selectedLogId]);

  useEffect(() => {
    if (!token || !autoRefresh) return;

    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void loadOps(page, { silent: true });
    }, 20000);

    return () => window.clearInterval(timer);
  }, [token, autoRefresh, page, search, requestId, deviceId, level, source, outcome]);

  const handleApplyFilters = () => {
    void loadOps(1);
  };

  const handleRefresh = () => {
    void loadDevices();
    void loadOps(page, { silent: true });
  };

  const clearFilters = () => {
    setSearch('');
    setRequestId('');
    setDeviceId('');
    setLevel('');
    setSource('');
    setOutcome('');
    setTimeout(() => {
      void loadOps(1);
    }, 0);
  };

  const formatDate = (value: string | null | undefined) => {
    if (!value) return '-';
    return new Date(value).toLocaleString('pt-BR');
  };

  const shortText = (value: string | null | undefined, max = 18) => {
    if (!value) return '-';
    return value.length > max ? `${value.slice(0, max)}...` : value;
  };

  const attentionDevices = healthDashboard.devices.filter((device) => device.healthStatus !== 'healthy');

  const renderMetric = (
    label: string,
    value: number,
    helper: string,
    icon: React.ReactNode,
  ) => (
    <div className="kpi-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span className="kpi-card-label">{label}</span>
        <span style={{ color: 'var(--color-text-muted)' }}>{icon}</span>
      </div>
      <div className="kpi-card-value">{value}</div>
      <div className="kpi-card-trend neutral">{helper}</div>
    </div>
  );

  return (
    <div className="animate-fade-in-up">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShieldAlert size={24} color="var(--color-primary-500)" /> Ops Center
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 4, maxWidth: 820 }}>
            Painel operacional para integradores e administradores acompanharem a saude da integracao Intelbras,
            ingestao de eventos, snapshots e diagnosticos ativos por dispositivo.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => setAutoRefresh((current) => !current)}
            style={{
              ...toolbarButtonStyle,
              background: autoRefresh ? 'var(--color-primary-50)' : 'var(--color-surface)',
              color: autoRefresh ? 'var(--color-primary-700)' : 'var(--color-text)',
            }}
          >
            Auto 20s: {autoRefresh ? 'On' : 'Off'}
          </button>
          <button onClick={handleRefresh} style={toolbarButtonStyle}>
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Atualizar
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 20 }}>
        {renderMetric('Total de Logs', summary.total, 'Base operacional filtrada', <Database size={18} />)}
        {renderMetric('Ultimas 24h', summary.last24h, 'Atividade recente', <Activity size={18} />)}
        {renderMetric('Erros 24h', summary.errors24h, 'Falhas com impacto', <TriangleAlert size={18} />)}
        {renderMetric('Avisos 24h', summary.warnings24h, 'Sinais para analise', <Server size={18} />)}
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
            <Filter size={16} /> Filtros operacionais
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {total} registros encontrados{lastUpdatedAt ? ` • Atualizado ${formatDate(lastUpdatedAt)}` : ''}
          </div>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>Busca livre</span>
              <div style={inputShellStyle}>
                <Search size={14} color="var(--color-text-muted)" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && handleApplyFilters()}
                  placeholder="mensagem, evento, request"
                  style={inputStyle}
                />
              </div>
            </label>

            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>Request ID</span>
              <input
                value={requestId}
                onChange={(event) => setRequestId(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && handleApplyFilters()}
                placeholder="x-request-id"
                style={selectStyle}
              />
            </label>

            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>Dispositivo</span>
              <select value={deviceId} onChange={(event) => setDeviceId(event.target.value)} style={selectStyle}>
                <option value="">Todos</option>
                {devices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name}{device.location ? ` - ${device.location}` : ''}
                  </option>
                ))}
              </select>
            </label>

            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>Nivel</span>
              <select value={level} onChange={(event) => setLevel(event.target.value)} style={selectStyle}>
                <option value="">Todos</option>
                <option value="debug">debug</option>
                <option value="info">info</option>
                <option value="warn">warn</option>
                <option value="error">error</option>
              </select>
            </label>

            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>Origem</span>
              <select value={source} onChange={(event) => setSource(event.target.value)} style={selectStyle}>
                <option value="">Todas</option>
                <option value="intelbras_webhook">intelbras_webhook</option>
                <option value="intelbras_autoreg">intelbras_autoreg (TCP Tunnel)</option>
                <option value="device_diagnostics">device_diagnostics</option>
              </select>
            </label>

            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>Outcome</span>
              <input
                value={outcome}
                onChange={(event) => setOutcome(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && handleApplyFilters()}
                placeholder="event_persisted, ping_failed..."
                style={selectStyle}
              />
            </label>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button onClick={handleApplyFilters} style={{ ...toolbarButtonStyle, background: 'var(--color-primary-600)', color: '#fff', border: 'none' }}>
              Aplicar filtros
            </button>
            <button onClick={clearFilters} style={toolbarButtonStyle}>
              Limpar filtros
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 18 }}>
        <div className="card">
          <div className="card-header">
            <div style={{ fontWeight: 700 }}>Fontes mais ativas</div>
          </div>
          <div className="card-body" style={{ display: 'grid', gap: 10 }}>
            {summary.bySource.length === 0 ? (
              <div style={emptyMiniStateStyle}>Sem dados para a selecao atual.</div>
            ) : summary.bySource.map((item) => (
              <div key={item.source} style={{ display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <span className="badge badge-neutral">{item.source}</span>
                  <strong style={{ fontSize: 13 }}>{item.count}</strong>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: 'var(--color-bg)' }}>
                  <div
                    style={{
                      width: `${summary.total ? Math.max(8, (item.count / summary.total) * 100) : 0}%`,
                      height: '100%',
                      borderRadius: 999,
                      background: 'linear-gradient(90deg, var(--color-primary-500), var(--color-primary-700))',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div style={{ fontWeight: 700 }}>Outcomes recorrentes</div>
          </div>
          <div className="card-body" style={{ display: 'grid', gap: 8 }}>
            {summary.byOutcome.length === 0 ? (
              <div style={emptyMiniStateStyle}>Sem ocorrencias nesta selecao.</div>
            ) : summary.byOutcome.map((item) => (
              <div key={`${item.outcome}-${item.count}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span className="badge badge-primary">{item.outcome}</span>
                <strong style={{ fontSize: 13 }}>{item.count}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="ops-health-layout" style={{ display: 'grid', gap: 14, marginBottom: 18 }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-header">
            <div style={{ fontWeight: 700 }}>Saude da frota</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              {healthDashboard.devices.length} dispositivos avaliados
            </div>
          </div>
          <div className="card-body" style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
              <HealthPill label="Criticos" value={healthDashboard.totals.critical} tone="badge-danger" />
              <HealthPill label="Sob atencao" value={healthDashboard.totals.attention} tone="badge-warning" />
              <HealthPill label="Ociosos" value={healthDashboard.totals.idle} tone="badge-neutral" />
              <HealthPill label="Saudaveis" value={healthDashboard.totals.healthy} tone="badge-success" />
            </div>

            {attentionDevices.length === 0 ? (
              <div style={emptyMiniStateStyle}>Nenhum dispositivo com alerta operacional no momento.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Dispositivo</th>
                      <th>Saude</th>
                      <th>Erros 24h</th>
                      <th>Heartbeat</th>
                      <th>Ultimo evento</th>
                      <th>Motivo principal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attentionDevices.slice(0, 8).map((device) => (
                      <tr key={device.deviceId}>
                        <td>
                          <div className="td-bold">{device.deviceName}</div>
                          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                            {device.location || device.schoolName}
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${HEALTH_BADGE[device.healthStatus]}`}>{device.healthLabel}</span>
                        </td>
                        <td className="td-mono">{device.errors24h}</td>
                        <td className="td-mono">{formatDate(device.lastHeartbeat)}</td>
                        <td className="td-mono">{formatDate(device.lastEventAt)}</td>
                        <td>
                          <div style={{ maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {device.reasons[0] || '-'}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div style={{ fontWeight: 700 }}>Alertas ativos</div>
          </div>
          <div className="card-body" style={{ display: 'grid', gap: 10 }}>
            {healthDashboard.alerts.length === 0 ? (
              <div style={emptyMiniStateStyle}>Sem alertas ativos para a selecao atual.</div>
            ) : healthDashboard.alerts.map((alert) => (
              <div
                key={`${alert.deviceId}-${alert.title}`}
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: 12,
                  display: 'grid',
                  gap: 8,
                  background: 'var(--color-bg)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{alert.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                      {alert.schoolName} • {alert.deviceName}
                    </div>
                  </div>
                  <span className={`badge ${SEVERITY_BADGE[alert.severity]}`}>{alert.severity}</span>
                </div>

                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{alert.message}</div>

                <div style={{ display: 'grid', gap: 4 }}>
                  {alert.reasons.slice(0, 2).map((reason) => (
                    <div key={reason} style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                      • {reason}
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, color: 'var(--color-text-muted)' }}>
                  <span>Ultimo log: {formatDate(alert.lastLogAt)}</span>
                  <span>Heartbeat: {formatDate(alert.lastHeartbeat)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="card" style={{ marginBottom: 18, borderColor: 'rgba(220, 38, 38, 0.2)' }}>
          <div className="card-body" style={{ color: 'var(--color-danger)', fontWeight: 600 }}>
            {error}
          </div>
        </div>
      )}

      <div className="ops-center-layout" style={{ display: 'grid', gap: 16, alignItems: 'start' }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-header">
            <div style={{ fontWeight: 700 }}>Linha do tempo operacional</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              Pagina {page} de {pages}
            </div>
          </div>

          {loading ? (
            <div className="card-body" style={{ color: 'var(--color-text-muted)' }}>
              Carregando eventos operacionais...
            </div>
          ) : logs.length === 0 ? (
            <div className="card-body" style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
              Nenhum log operacional encontrado para os filtros aplicados.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Data/Hora</th>
                    <th>Nivel</th>
                    <th>Origem</th>
                    <th>Dispositivo</th>
                    <th>Outcome</th>
                    <th>Mensagem</th>
                    <th>Request</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const isSelected = selectedLog?.id === log.id;

                    return (
                      <tr
                        key={log.id}
                        onClick={() => setSelectedLogId(log.id)}
                        style={{
                          cursor: 'pointer',
                          background: isSelected ? 'var(--color-primary-50)' : undefined,
                        }}
                      >
                        <td className="td-mono">{formatDate(log.createdAt)}</td>
                        <td>
                          <span className={`badge ${LEVEL_BADGE[log.level] || 'badge-neutral'}`}>{log.level}</span>
                        </td>
                        <td>
                          <div className="td-bold">{log.source}</div>
                          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{log.category || '-'}</div>
                        </td>
                        <td>
                          <div className="td-bold">{log.deviceName || '-'}</div>
                          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{shortText(log.deviceRef)}</div>
                        </td>
                        <td>
                          <span className="badge badge-primary">{log.outcome || 'unspecified'}</span>
                        </td>
                        <td>
                          <div style={{ maxWidth: 340, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {log.message}
                          </div>
                        </td>
                        <td className="td-mono">{shortText(log.requestId, 14)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="card-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              Total filtrado: {total}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                disabled={page <= 1}
                onClick={() => void loadOps(page - 1)}
                style={pageButtonStyle(page > 1)}
              >
                Anterior
              </button>
              <button
                disabled={page >= pages}
                onClick={() => void loadOps(page + 1)}
                style={pageButtonStyle(page < pages)}
              >
                Proxima
              </button>
            </div>
          </div>
        </div>

        <div className="card" style={{ position: 'sticky', top: 84 }}>
          <div className="card-header">
            <div style={{ fontWeight: 700 }}>Detalhe tecnico</div>
          </div>
          <div className="card-body" style={{ display: 'grid', gap: 14 }}>
            {!selectedLog ? (
              <div style={{ color: 'var(--color-text-muted)' }}>
                Selecione um log para analisar os detalhes.
              </div>
            ) : (
              <>
                <div className="ops-detail-grid" style={detailGridStyle}>
                  <Detail label="Mensagem" value={selectedLog.message} wide />
                  <Detail label="Nivel" value={selectedLog.level} />
                  <Detail label="Origem" value={selectedLog.source} />
                  <Detail label="Categoria" value={selectedLog.category || '-'} />
                  <Detail label="Outcome" value={selectedLog.outcome || '-'} />
                  <Detail label="Dispositivo" value={selectedLog.deviceName || '-'} />
                  <Detail label="Device Ref" value={selectedLog.deviceRef || '-'} mono />
                  <Detail label="Evento" value={selectedLog.eventCode || '-'} />
                  <Detail label="Event ID" value={selectedLog.eventId || '-'} mono />
                  <Detail label="Request ID" value={selectedLog.requestId || '-'} mono />
                  <Detail label="Correlation" value={selectedLog.correlationId || '-'} mono />
                  <Detail label="Transporte" value={selectedLog.transport || '-'} />
                  <Detail label="Escola" value={selectedLog.schoolName || '-'} wide />
                  <Detail label="Criado em" value={formatDate(selectedLog.createdAt)} />
                </div>

                <div>
                  <div style={{ ...fieldLabelStyle, marginBottom: 8 }}>Metadata JSON</div>
                  <pre
                    style={{
                      margin: 0,
                      padding: 14,
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-bg)',
                      fontSize: 12,
                      lineHeight: 1.5,
                      overflowX: 'auto',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--color-text-secondary)',
                      maxHeight: 420,
                    }}
                  >
                    {JSON.stringify(selectedLog.metadata || {}, null, 2)}
                  </pre>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .ops-health-layout {
          grid-template-columns: minmax(0, 1.4fr) minmax(320px, 1fr);
        }
        .ops-center-layout {
          grid-template-columns: minmax(0, 1.7fr) minmax(320px, 1fr);
        }
        @media (max-width: 1100px) {
          .ops-health-layout {
            grid-template-columns: 1fr;
          }
          .ops-center-layout {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 720px) {
          .ops-detail-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

function Detail({
  label,
  value,
  mono,
  wide,
}: {
  label: string;
  value: string;
  mono?: boolean;
  wide?: boolean;
}) {
  return (
    <div style={{ display: 'grid', gap: 4, gridColumn: wide ? '1 / -1' : undefined }}>
      <span style={fieldLabelStyle}>{label}</span>
      <span
        style={{
          fontSize: 13,
          color: 'var(--color-text)',
          fontFamily: mono ? 'var(--font-mono)' : undefined,
          wordBreak: 'break-word',
        }}
      >
        {value}
      </span>
    </div>
  );
}

function HealthPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: '12px 14px',
        display: 'grid',
        gap: 6,
        background: 'var(--color-bg)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={fieldLabelStyle}>{label}</span>
        <span className={`badge ${tone}`}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

const toolbarButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
};

const fieldStyle: React.CSSProperties = {
  display: 'grid',
  gap: 6,
};

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--color-text-muted)',
};

const inputShellStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  padding: '0 10px',
  background: 'var(--color-surface)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 38,
  border: 'none',
  outline: 'none',
  background: 'transparent',
  fontSize: 13,
  color: 'var(--color-text)',
};

const selectStyle: React.CSSProperties = {
  minHeight: 38,
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  padding: '0 10px',
  background: 'var(--color-surface)',
  fontSize: 13,
  color: 'var(--color-text)',
};

const emptyMiniStateStyle: React.CSSProperties = {
  color: 'var(--color-text-muted)',
  fontSize: 13,
};

const detailGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 12,
};

const pageButtonStyle = (enabled: boolean): React.CSSProperties => ({
  padding: '7px 12px',
  fontSize: 12,
  fontWeight: 600,
  cursor: enabled ? 'pointer' : 'default',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  opacity: enabled ? 1 : 0.45,
});
