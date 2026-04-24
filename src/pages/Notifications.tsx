import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { SkeletonTable } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import {
  Bell, BellOff, Check, Clock, AlertTriangle, Filter, RefreshCcw,
  Send, XCircle, ChevronDown, Search,
} from 'lucide-react';

type NotifStatus = 'all' | 'sent' | 'pending' | 'failed';

interface NotificationItem {
  id: string;
  guardianName: string;
  guardianPhone: string;
  studentName: string;
  channel: string;
  status: string;
  message: string;
  sentAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

function getDemoNotifications(): NotificationItem[] {
  const now = new Date();
  const base = [
    { guardianName: 'Ana Costa', guardianPhone: '(11) 99876-5432', studentName: 'Pedro Costa', channel: 'whatsapp', status: 'sent', message: 'Entrada registrada às 07:32', sentAt: new Date(now.getTime() - 3600000).toISOString(), errorMessage: null },
    { guardianName: 'Carlos Santos', guardianPhone: '(11) 98765-4321', studentName: 'Julia Santos', channel: 'whatsapp', status: 'sent', message: 'Entrada registrada às 07:35', sentAt: new Date(now.getTime() - 3500000).toISOString(), errorMessage: null },
    { guardianName: 'Maria Oliveira', guardianPhone: '(11) 97654-3210', studentName: 'Lucas Oliveira', channel: 'sms', status: 'failed', message: 'Entrada registrada às 07:38', sentAt: null, errorMessage: 'Número inválido' },
    { guardianName: 'Roberto Lima', guardianPhone: '(11) 96543-2109', studentName: 'Amanda Lima', channel: 'whatsapp', status: 'sent', message: 'Saída registrada às 12:15', sentAt: new Date(now.getTime() - 1800000).toISOString(), errorMessage: null },
    { guardianName: 'Fernanda Souza', guardianPhone: '(11) 95432-1098', studentName: 'Gabriel Souza', channel: 'whatsapp', status: 'pending', message: 'Entrada registrada às 07:42', sentAt: null, errorMessage: null },
    { guardianName: 'José Pereira', guardianPhone: '(11) 94321-0987', studentName: 'Beatriz Pereira', channel: 'whatsapp', status: 'sent', message: 'Entrada registrada às 07:45', sentAt: new Date(now.getTime() - 3000000).toISOString(), errorMessage: null },
    { guardianName: 'Juliana Ferreira', guardianPhone: '(11) 93210-9876', studentName: 'Thiago Ferreira', channel: 'sms', status: 'failed', message: 'Entrada registrada às 07:50', sentAt: null, errorMessage: 'Timeout do provedor' },
    { guardianName: 'Marcos Rodrigues', guardianPhone: '(11) 92109-8765', studentName: 'Larissa Rodrigues', channel: 'whatsapp', status: 'sent', message: 'Entrada registrada às 07:52', sentAt: new Date(now.getTime() - 2700000).toISOString(), errorMessage: null },
  ];
  return base.map((n, i) => ({ ...n, id: `notif-${i}`, createdAt: new Date(now.getTime() - (base.length - i) * 600000).toISOString() }));
}

export default function Notifications() {
  const { token, isDemo } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<NotifStatus>('all');
  const [search, setSearch] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    if (isDemo) {
      setNotifications(getDemoNotifications());
      setLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/notifications', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      } else {
        setError(`Erro ${res.status} ao carregar notificações`);
      }
    } catch {
      setError('Não foi possível conectar ao servidor');
    }
    setLoading(false);
  };

  const filtered = notifications.filter(n => {
    if (statusFilter !== 'all' && n.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return n.guardianName.toLowerCase().includes(q) || n.studentName.toLowerCase().includes(q) || n.guardianPhone.includes(q);
    }
    return true;
  });

  const stats = {
    total: notifications.length,
    sent: notifications.filter(n => n.status === 'sent').length,
    pending: notifications.filter(n => n.status === 'pending').length,
    failed: notifications.filter(n => n.status === 'failed').length,
  };

  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const formatDateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  const statusBadge = (status: string) => {
    switch (status) {
      case 'sent': return <span className="badge badge-success"><Check size={10} /> Enviada</span>;
      case 'pending': return <span className="badge badge-warning"><Clock size={10} /> Em fila</span>;
      case 'failed': return <span className="badge badge-danger"><XCircle size={10} /> Falhou</span>;
      default: return <span className="badge">{status}</span>;
    }
  };

  const channelBadge = (ch: string) => {
    switch (ch) {
      case 'whatsapp': return <span style={{ fontSize: 11, color: '#25D366', fontWeight: 600 }}>WhatsApp</span>;
      case 'sms': return <span style={{ fontSize: 11, color: 'var(--color-info)', fontWeight: 600 }}>SMS</span>;
      case 'email': return <span style={{ fontSize: 11, color: 'var(--color-warning)', fontWeight: 600 }}>E-mail</span>;
      default: return <span style={{ fontSize: 11 }}>{ch}</span>;
    }
  };

  return (
    <div className="animate-fade-in-up">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--color-primary-800)' }}>Notificações</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>Pipeline de notificações para responsáveis</p>
        </div>
        <button onClick={loadData} className="btn btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <RefreshCcw size={14} /> Atualizar
        </button>
      </div>

      {/* Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total', value: stats.total, icon: <Bell size={14} />, color: 'var(--color-primary-600)' },
          { label: 'Enviadas', value: stats.sent, icon: <Send size={14} />, color: 'var(--color-success)' },
          { label: 'Em Fila', value: stats.pending, icon: <Clock size={14} />, color: 'var(--color-warning)' },
          { label: 'Falhas', value: stats.failed, icon: <BellOff size={14} />, color: 'var(--color-danger)' },
        ].map((s, i) => (
          <div key={i} className="card" style={{ padding: '14px 16px', cursor: 'pointer', border: statusFilter === ['all', 'sent', 'pending', 'failed'][i] ? `2px solid ${s.color}` : undefined }}
            onClick={() => setStatusFilter(['all', 'sent', 'pending', 'failed'][i] as NotifStatus)}>
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
          <input type="text" placeholder="Buscar por responsável, aluno ou telefone..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '9px 12px 9px 34px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--color-surface)' }} />
        </div>
      </div>

      {/* Table */}
      {loading ? <SkeletonTable rows={6} cols={6} /> : error ? (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--color-danger)' }}>
          <XCircle size={24} style={{ marginBottom: 8 }} />
          <p style={{ margin: 0, fontSize: 14 }}>{error}</p>
          <button className="btn btn-secondary" style={{ marginTop: 12, fontSize: 13 }} onClick={loadData}>Tentar novamente</button>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="notifications" title="Nenhuma notificação" description="Não há notificações para exibir com os filtros aplicados." />
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Hora</th>
                <th>Responsável</th>
                <th>Aluno</th>
                <th>Canal</th>
                <th>Mensagem</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(n => (
                <tr key={n.id}>
                  <td className="td-mono" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{formatDateTime(n.createdAt)}</td>
                  <td>
                    <div className="td-bold">{n.guardianName}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{n.guardianPhone}</div>
                  </td>
                  <td>{n.studentName}</td>
                  <td>{channelBadge(n.channel)}</td>
                  <td style={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.message}</td>
                  <td>
                    {statusBadge(n.status)}
                    {n.errorMessage && <div style={{ fontSize: 10, color: 'var(--color-danger)', marginTop: 2 }}>{n.errorMessage}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
