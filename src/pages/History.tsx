import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Clock, ChevronLeft, ChevronRight, Filter, FileDown, Download } from 'lucide-react';

export default function History() {
  const { token } = useAuth();
  const [events, setEvents] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);

  const load = (p: number) => {
    if (!token) return;
    setLoading(true);
    fetch(`/api/events?page=${p}&limit=50`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => {
        setEvents(d.events || []); setTotalPages(d.pages || 1); setTotal(d.total || 0);
      }).catch(() => {}).finally(() => setLoading(false));
  };

  const generatePDF = async () => {
    if (exportingPdf) return;

    setExportingPdf(true);
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);

      const doc = new jsPDF();
      doc.text('Relatório de Acessos - Acesso Escolar', 14, 15);

      const tableData = events.map(e => [
        new Date(e.occurredAt || e.occurred_at).toLocaleString('pt-BR'),
        e.student?.name || 'Não identificado',
        e.method || '—',
        e.device?.location || e.device?.name || '—',
        e.direction === 'entry' ? 'Entrada' : e.direction === 'exit' ? 'Saída' : '—',
        e.status === 'granted' ? 'Autorizado' : e.status === 'denied' ? 'Negado' : e.status || '—',
      ]);

      autoTable(doc, {
        startY: 20,
        head: [['Data/Hora', 'Aluno', 'Método', 'Dispositivo', 'Direção', 'Status']],
        body: tableData,
      });

      doc.save('historico_acessos.pdf');
    } finally {
      setExportingPdf(false);
    }
  };

  useEffect(() => { load(page); }, [token, page]);

  return (
    <div className="animate-fade-in-up">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}><Clock size={22} /> Histórico de Acessos</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 2 }}>{total} registros na base de dados</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => {
              fetch('/api/events/export', { headers: { Authorization: `Bearer ${token}` } })
                .then(r => r.blob()).then(blob => {
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url; a.download = `eventos_${new Date().toISOString().split('T')[0]}.csv`;
                  a.click(); URL.revokeObjectURL(url);
                }).catch(() => {});
            }}
            title="Exportar CSV (últimos 30 dias)"
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'var(--color-surface)', fontSize: 13, fontWeight: 600, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
          >
            <Download size={16} /> Exportar CSV
          </button>
          <button onClick={() => { void generatePDF(); }} title="Exportar para PDF" disabled={exportingPdf} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'var(--color-surface)', fontSize: 13, fontWeight: 600, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', cursor: exportingPdf ? 'wait' : 'pointer', opacity: exportingPdf ? 0.7 : 1
          }}>
            <FileDown size={16} /> {exportingPdf ? 'Gerando PDF...' : 'Exportar PDF'}
          </button>
        </div>
      </div>

      <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              {['Data/Hora', 'Aluno', 'Método', 'Dispositivo', 'Direção', 'Status'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.map(e => (
              <tr key={e.id} style={{ borderBottom: '1px solid var(--color-border)', transition: 'background 0.1s' }}
                onMouseEnter={ev => (ev.currentTarget.style.background = 'var(--color-bg)')}
                onMouseLeave={ev => (ev.currentTarget.style.background = 'transparent')}>
                <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                  {new Date(e.occurredAt || e.occurred_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </td>
                <td style={{ padding: '10px 16px', fontWeight: 600 }}>{e.student?.name || <span style={{ color: 'var(--color-text-muted)' }}>Não identificado</span>}</td>
                <td style={{ padding: '10px 16px' }}>{e.method || '—'}</td>
                <td style={{ padding: '10px 16px' }}>{e.device?.location || e.device?.name || '—'}</td>
                <td style={{ padding: '10px 16px' }}>
                  <span className={`badge ${e.direction === 'entry' ? 'badge-success' : 'badge-neutral'}`}>
                    {e.direction === 'entry' ? '↗ Entrada' : e.direction === 'exit' ? '↙ Saída' : '—'}
                  </span>
                </td>
                <td style={{ padding: '10px 16px' }}>
                  <span className={`badge ${e.status === 'granted' ? 'badge-success' : e.status === 'denied' ? 'badge-danger' : 'badge-warning'}`}>
                    {e.status === 'granted' ? 'Autorizado' : e.status === 'denied' ? 'Negado' : e.status || '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-muted)' }}>Carregando...</div>}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 16 }}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            style={{ padding: '6px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', cursor: page <= 1 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
            <ChevronLeft size={14} /> Anterior
          </button>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Página {page} de {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
            style={{ padding: '6px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', cursor: page >= totalPages ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
            Próximo <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
