import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { FileDown, Search, RefreshCw, AlertTriangle, Shield } from 'lucide-react';

interface AuditEntry {
  id: string;
  action: string;
  entity: string;
  entityId?: string;
  profileId?: string;
  ipAddress?: string;
  createdAt: string;
  details?: any;
  integrator?: { name: string };
}

const ACTION_BADGE: Record<string, string> = {
  CREATE: 'badge-success',
  UPDATE: 'badge-warning',
  DELETE: 'badge-danger',
};

export default function AuditTrail() {
  const { token, profile } = useAuth();
  const isSuperadmin = profile?.role === 'superadmin';

  const [logs, setLogs]         = useState<AuditEntry[]>([]);
  const [stats, setStats]       = useState<{ action: string; count: number }[]>([]);
  const [integrators, setIntegrators] = useState<{ id: string; name: string }[]>([]);
  const [total, setTotal]       = useState(0);
  const [pages, setPages]       = useState(1);
  const [page, setPage]         = useState(1);
  const [search, setSearch]     = useState('');
  const [entity, setEntity]     = useState('');
  const [integratorId, setIntegratorId] = useState('');
  const [loading, setLoading]   = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };

  // Load integrator list for superadmin filter
  useEffect(() => {
    if (!isSuperadmin || !token) return;
    fetch('/api/integrators', { headers })
      .then(r => r.json())
      .then(d => setIntegrators((d.integrators || []).map((i: any) => ({ id: i.id, name: i.name }))))
      .catch(() => {});
  }, [isSuperadmin, token]);

  const load = (p = page) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), limit: '30' });
    if (search) params.set('search', search);
    if (entity) params.set('entity', entity);
    if (isSuperadmin && integratorId) params.set('integratorId', integratorId);

    Promise.all([
      fetch(`/api/audit-trail?${params}`, { headers }).then(r => r.json()),
      fetch('/api/audit-trail/stats', { headers }).then(r => r.json()),
    ])
      .then(([logsData, statsData]) => {
        setLogs(logsData.logs || []);
        setTotal(logsData.total || 0);
        setPages(logsData.pages || 1);
        setStats(Array.isArray(statsData) ? statsData : []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(1); }, [token]);
  // Re-run when superadmin changes integrator filter
  useEffect(() => { if (isSuperadmin) { setPage(1); load(1); } }, [integratorId]);

  const handleSearch = () => { setPage(1); load(1); };

  const exportPDF = async () => {
    if (exportingPdf) return;

    setExportingPdf(true);
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);

      const doc = new jsPDF();
      doc.text('Audit Trail — Acesso Escolar', 14, 15);
      doc.setFontSize(9);
      doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 22);
      autoTable(doc, {
        startY: 28,
        head: [['Data', 'Ação', 'Entidade', 'ID Entidade', 'IP', 'Integrador']],
        body: logs.map(l => [
          new Date(l.createdAt).toLocaleString('pt-BR'),
          l.action, l.entity, l.entityId || '—', l.ipAddress || '—',
          l.integrator?.name || '—',
        ]),
        styles: { fontSize: 8 },
      });
      doc.save('audit_trail.pdf');
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="animate-fade-in-up">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Shield size={22} color="var(--color-primary-500)" /> Audit Trail
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 2 }}>
            Rastreamento completo de todas as ações críticas do sistema
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => load(page)} style={btnStyle}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
          </button>
          <button onClick={() => { void exportPDF(); }} disabled={exportingPdf} style={{ ...btnStyle, background: 'var(--color-primary-600)', color: '#fff', border: 'none', cursor: exportingPdf ? 'wait' : 'pointer', opacity: exportingPdf ? 0.7 : 1 }}>
            <FileDown size={14} /> {exportingPdf ? 'Gerando PDF...' : 'Exportar PDF'}
          </button>
        </div>
      </div>

      {/* Stats row */}
      {stats.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {stats.slice(0, 5).map(s => (
            <div key={s.action} style={{
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)', padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span className={`badge ${ACTION_BADGE[s.action] || 'badge-neutral'}`}>{s.action}</span>
              <span style={{ fontSize: 20, fontWeight: 800 }}>{s.count}</span>
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>últimos 30 dias</span>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{
        display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center',
        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)', padding: '12px 16px',
      }}>
        <Search size={16} color="var(--color-text-muted)" />
        <input
          placeholder="Buscar ação, entidade, ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--color-text)' }}
        />
        <select value={entity} onChange={e => setEntity(e.target.value)}
          style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '4px 8px', fontSize: 12, background: 'var(--color-surface)', color: 'var(--color-text)' }}>
          <option value="">Todas as entidades</option>
          <option value="Student">Student</option>
          <option value="Device">Device</option>
          <option value="School">School</option>
          <option value="Profile">Profile</option>
        </select>
        {isSuperadmin && integrators.length > 0 && (
          <select value={integratorId} onChange={e => setIntegratorId(e.target.value)}
            style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '4px 8px', fontSize: 12, background: 'var(--color-surface)', color: 'var(--color-text)' }}>
            <option value="">Todos os integradores</option>
            {integrators.map(i => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>
        )}
        <button onClick={handleSearch} style={{ padding: '6px 14px', background: 'var(--color-primary-600)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          Filtrar
        </button>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'auto' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>Carregando logs de auditoria...</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>
            <AlertTriangle size={28} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
            Nenhum registro de auditoria encontrado.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--color-bg)', borderBottom: '2px solid var(--color-border)' }}>
                {['Data/Hora', 'Ação', 'Entidade', 'ID Referência', 'Endereço IP', 'Integrador'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id}
                  style={{ borderBottom: '1px solid var(--color-border)', transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '9px 14px', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    {new Date(log.createdAt).toLocaleString('pt-BR')}
                  </td>
                  <td style={{ padding: '9px 14px' }}>
                    <span className={`badge ${ACTION_BADGE[log.action] || 'badge-neutral'}`}>{log.action}</span>
                  </td>
                  <td style={{ padding: '9px 14px', fontWeight: 600 }}>{log.entity}</td>
                  <td style={{ padding: '9px 14px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-muted)' }}>
                    {log.entityId ? log.entityId.slice(0, 8) + '…' : '—'}
                  </td>
                  <td style={{ padding: '9px 14px', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{log.ipAddress || '—'}</td>
                  <td style={{ padding: '9px 14px', color: 'var(--color-text-secondary)' }}>{log.integrator?.name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 16 }}>
          <button disabled={page <= 1} onClick={() => { setPage(p => p - 1); load(page - 1); }} style={pageBtnStyle(page > 1)}>
            ← Anterior
          </button>
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Página {page} de {pages} · {total} registros
          </span>
          <button disabled={page >= pages} onClick={() => { setPage(p => p + 1); load(page + 1); }} style={pageBtnStyle(page < pages)}>
            Próximo →
          </button>
        </div>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
};

const pageBtnStyle = (enabled: boolean): React.CSSProperties => ({
  padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: enabled ? 'pointer' : 'default',
  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)', opacity: enabled ? 1 : 0.4,
});
