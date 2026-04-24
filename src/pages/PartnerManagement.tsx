import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { SkeletonTable } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import {
  Building2, Plus, X, CheckCircle, AlertTriangle, XCircle, Clock,
  Shield, RefreshCw, Trash2, Edit2, Key,
} from 'lucide-react';
import UserManagement from './UserManagement';

// ── Types ─────────────────────────────────────────────────────────────────────

interface IntegratorItem {
  id: string;
  name: string;
  slug: string;
  cnpj: string;
  nomeFantasia: string;
  responsavelComercial: string;
  emailComercial: string;
  telefone: string;
  nContrato: string;
  endereco: string;
  observacoes: string;
  status: 'active' | 'trial' | 'blocked' | 'suspended';
  usedSchools: number;
  totalDevices: number;
  activePlan: string;
  validTo: string;
}

interface LicenseItem {
  id: string;
  integratorId: string;
  integratorName: string;
  plan: string;
  status: string;
  maxSchools: number;
  usedSchools: number;
  maxDevices: number;
  usedDevices: number;
  validTo: string;
  graceUntil: string | null;
  daysLeft: number;
}

interface BlockedDocItem {
  id: string;
  document: string;
  type: 'CNPJ' | 'CPF';
  reason: 'trial_used' | 'manual' | 'abuse';
  integratorId: string;
  blockedAt: string;
}

// ── Demo data ─────────────────────────────────────────────────────────────────

function getDemoIntegrators(): IntegratorItem[] {
  return [
    { id: '1', name: 'TechSeg Soluções', slug: 'techseg', cnpj: '11.222.333/0001-44', nomeFantasia: 'TechSeg', responsavelComercial: 'Carlos Mendes', emailComercial: 'carlos@techseg.com.br', telefone: '(11) 3322-4455', nContrato: 'CT-2025-001', endereco: 'Rua das Flores, 100 - São Paulo/SP', observacoes: 'Cliente estratégico. Contrato Enterprise.', status: 'active', usedSchools: 18, totalDevices: 126, activePlan: 'enterprise', validTo: '2027-06-30' },
    { id: '2', name: 'SecurEdu', slug: 'securedu', cnpj: '22.333.444/0001-55', nomeFantasia: 'SecurEdu Tecnologia', responsavelComercial: 'Ana Lima', emailComercial: 'ana@securedu.com.br', telefone: '(21) 3344-5566', nContrato: 'CT-2025-002', endereco: 'Av. Rio Branco, 200 - Rio de Janeiro/RJ', observacoes: '', status: 'active', usedSchools: 12, totalDevices: 84, activePlan: 'professional', validTo: '2026-12-31' },
    { id: '3', name: 'EduSafe', slug: 'edusafe', cnpj: '33.444.555/0001-66', nomeFantasia: 'EduSafe BR', responsavelComercial: 'Pedro Costa', emailComercial: 'ops@edusafe.com', telefone: '(31) 4455-6677', nContrato: 'CT-2025-003', endereco: 'Rua Bahia, 300 - Belo Horizonte/MG', observacoes: '', status: 'active', usedSchools: 9, totalDevices: 62, activePlan: 'professional', validTo: '2026-09-15' },
    { id: '4', name: 'ControleMax', slug: 'controlemax', cnpj: '55.666.777/0001-88', nomeFantasia: 'ControleMax', responsavelComercial: 'Fernanda Rocha', emailComercial: 'suporte@controlemax.com', telefone: '(51) 6677-8899', nContrato: '', endereco: 'Av. Ipiranga, 500 - Porto Alegre/RS', observacoes: 'Em período de avaliação.', status: 'trial', usedSchools: 3, totalDevices: 32, activePlan: 'trial', validTo: '2026-05-15' },
    { id: '5', name: 'SafeSchool BR', slug: 'safeschool', cnpj: '66.777.888/0001-99', nomeFantasia: 'SafeSchool', responsavelComercial: 'Marcos Alves', emailComercial: 'marcos@safeschool.com.br', telefone: '(19) 7788-9900', nContrato: 'CT-2024-010', endereco: 'Rua Campinas, 700 - Campinas/SP', observacoes: 'Suspenso por inadimplência.', status: 'suspended', usedSchools: 7, totalDevices: 45, activePlan: 'professional', validTo: '2026-03-01' },
  ];
}

function getDemoLicenses(): LicenseItem[] {
  return [
    { id: 'l1', integratorId: '1', integratorName: 'TechSeg Soluções', plan: 'enterprise', status: 'active', maxSchools: 50, usedSchools: 18, maxDevices: 500, usedDevices: 126, validTo: '2027-06-30', graceUntil: null, daysLeft: 437 },
    { id: 'l2', integratorId: '2', integratorName: 'SecurEdu', plan: 'professional', status: 'active', maxSchools: 25, usedSchools: 12, maxDevices: 250, usedDevices: 84, validTo: '2026-12-31', graceUntil: null, daysLeft: 256 },
    { id: 'l3', integratorId: '3', integratorName: 'EduSafe', plan: 'professional', status: 'expiring', maxSchools: 25, usedSchools: 9, maxDevices: 250, usedDevices: 62, validTo: '2026-05-10', graceUntil: null, daysLeft: 21 },
    { id: 'l4', integratorId: '4', integratorName: 'ControleMax', plan: 'trial', status: 'trial', maxSchools: 5, usedSchools: 3, maxDevices: 50, usedDevices: 32, validTo: '2026-05-15', graceUntil: null, daysLeft: 26 },
    { id: 'l5', integratorId: '5', integratorName: 'SafeSchool BR', plan: 'professional', status: 'grace', maxSchools: 25, usedSchools: 7, maxDevices: 250, usedDevices: 45, validTo: '2026-03-01', graceUntil: '2026-04-01', daysLeft: -49 },
  ];
}

function getDemoBlockedDocs(): BlockedDocItem[] {
  return [
    { id: 'bd1', document: '12.345.678/0001-90', type: 'CNPJ', reason: 'trial_used', integratorId: 'int-old-1', blockedAt: '2025-11-20T14:00:00Z' },
    { id: 'bd2', document: '987.654.321-00', type: 'CPF', reason: 'abuse', integratorId: 'int-old-2', blockedAt: '2025-12-05T09:30:00Z' },
    { id: 'bd3', document: '98.765.432/0001-11', type: 'CNPJ', reason: 'manual', integratorId: 'int-old-3', blockedAt: '2026-01-15T16:45:00Z' },
  ];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  fontSize: 13,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--color-text-secondary)',
  display: 'block',
  marginBottom: 4,
};

const planColors: Record<string, string> = {
  enterprise: '#7c3aed',
  professional: '#0369a1',
  starter: '#0891b2',
  trial: '#d97706',
};

function PlanBadge({ plan }: { plan: string }) {
  const color = planColors[plan] || '#6b7280';
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
      padding: '3px 10px', borderRadius: 999,
      background: `${color}18`, color,
    }}>
      {plan}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'active': return <span className="badge badge-success"><CheckCircle size={10} /> Ativo</span>;
    case 'trial': return <span className="badge badge-warning"><AlertTriangle size={10} /> Trial</span>;
    case 'blocked': return <span className="badge badge-danger"><XCircle size={10} /> Bloqueado</span>;
    case 'suspended': return <span className="badge" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999 }}><XCircle size={10} /> Suspenso</span>;
    case 'expiring': return <span className="badge badge-warning"><Clock size={10} /> Expirando</span>;
    case 'expired': return <span className="badge badge-danger"><Clock size={10} /> Expirada</span>;
    case 'grace': return <span className="badge badge-warning"><AlertTriangle size={10} /> Graça</span>;
    default: return <span className="badge">{status}</span>;
  }
}

function UsageBar({ used, max }: { used: number; max: number }) {
  const pct = max > 0 ? Math.min((used / max) * 100, 100) : 0;
  const color = pct >= 90 ? 'var(--color-danger)' : pct >= 70 ? 'var(--color-warning)' : 'var(--color-success)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 110 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--color-border)' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: color, transition: 'width 0.5s ease' }} />
      </div>
      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600, color, whiteSpace: 'nowrap' }}>{used}/{max}</span>
    </div>
  );
}

function DaysLeftBadge({ days, date }: { days: number; date: string }) {
  const formatted = new Date(date).toLocaleDateString('pt-BR');
  if (days < 0) return <><span className="badge badge-danger">Expirado</span><div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>{formatted}</div></>;
  if (days <= 30) return <><span className="badge badge-warning"><Clock size={10} /> {days}d</span><div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>{formatted}</div></>;
  if (days <= 90) return <><span className="badge badge-info">{days}d</span><div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>{formatted}</div></>;
  return <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{formatted}</span>;
}

// ── Edit Integrator Modal ─────────────────────────────────────────────────────

interface EditIntegratorModalProps {
  integrator: IntegratorItem;
  token: string;
  onClose: () => void;
  onSaved: () => void;
}

function EditIntegratorModal({ integrator, token, onClose, onSaved }: EditIntegratorModalProps) {
  const [form, setForm] = useState({
    name: integrator.name,
    slug: integrator.slug,
    status: integrator.status,
    cnpj: integrator.cnpj,
    nomeFantasia: integrator.nomeFantasia,
    responsavelComercial: integrator.responsavelComercial,
    emailComercial: integrator.emailComercial,
    telefone: integrator.telefone,
    nContrato: integrator.nContrato,
    endereco: integrator.endereco,
    observacoes: integrator.observacoes,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Nome é obrigatório'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/integrators/${integrator.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const d = await res.json(); setError(d.message || 'Erro ao salvar'); return; }
      onSaved();
    } catch { setError('Erro de conexão'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', width: '100%', maxWidth: 640, boxShadow: 'var(--shadow-xl)', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)' }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Edit2 size={16} color="var(--color-primary-600)" /> Editar Integrador
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><X size={18} /></button>
        </div>

        <form onSubmit={handleSave} style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && (
            <div style={{ background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', fontSize: 13, color: 'var(--color-danger)' }}>{error}</div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Nome *</label>
              <input value={form.name} onChange={set('name')} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Slug</label>
              <input value={form.slug} onChange={set('slug')} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Status</label>
              <select value={form.status} onChange={set('status')} style={inputStyle}>
                <option value="active">Ativo</option>
                <option value="trial">Trial</option>
                <option value="suspended">Suspenso</option>
                <option value="blocked">Bloqueado</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>CNPJ</label>
              <input value={form.cnpj} onChange={set('cnpj')} placeholder="XX.XXX.XXX/0001-XX" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Nome Fantasia</label>
              <input value={form.nomeFantasia} onChange={set('nomeFantasia')} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Responsável Comercial</label>
              <input value={form.responsavelComercial} onChange={set('responsavelComercial')} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>E-mail Comercial</label>
              <input type="email" value={form.emailComercial} onChange={set('emailComercial')} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Telefone</label>
              <input value={form.telefone} onChange={set('telefone')} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Nº Contrato</label>
              <input value={form.nContrato} onChange={set('nContrato')} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Endereço</label>
              <input value={form.endereco} onChange={set('endereco')} style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Observações</label>
            <textarea value={form.observacoes} onChange={set('observacoes')} rows={3}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: 10, background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
            <button type="submit" disabled={saving} style={{ flex: 1, padding: 10, background: 'var(--color-primary-600)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Create Integrator Modal ────────────────────────────────────────────────────

function CreateIntegratorModal({ token, onClose, onCreated }: { token: string; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: '', emailAdmin: '', senhaAdmin: '', plan: 'trial', maxSchools: '5', maxDevices: '50', validTo: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.emailAdmin) { setError('Nome e e-mail são obrigatórios'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/integrators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, maxSchools: Number(form.maxSchools), maxDevices: Number(form.maxDevices) }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.message || 'Erro ao criar'); return; }
      onCreated();
    } catch { setError('Erro de conexão'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', width: '100%', maxWidth: 500, boxShadow: 'var(--shadow-xl)' }}>
        <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)' }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Plus size={16} color="var(--color-primary-600)" /> Novo Integrador
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && (
            <div style={{ background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', fontSize: 13, color: 'var(--color-danger)' }}>{error}</div>
          )}
          <div>
            <label style={labelStyle}>Nome *</label>
            <input value={form.name} onChange={set('name')} placeholder="TechSeg Soluções" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>E-mail do Admin *</label>
            <input type="email" value={form.emailAdmin} onChange={set('emailAdmin')} placeholder="admin@empresa.com.br" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Senha do Admin <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(opcional)</span></label>
            <input type="password" value={form.senhaAdmin} onChange={set('senhaAdmin')} placeholder="••••••••" style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Plano</label>
              <select value={form.plan} onChange={set('plan')} style={inputStyle}>
                <option value="trial">Trial</option>
                <option value="starter">Starter</option>
                <option value="professional">Professional</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Máx. Escolas</label>
              <input type="number" value={form.maxSchools} onChange={set('maxSchools')} min={1} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Máx. Devices</label>
              <input type="number" value={form.maxDevices} onChange={set('maxDevices')} min={1} style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Válido Até</label>
            <input type="date" value={form.validTo} onChange={set('validTo')} style={inputStyle} />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: 10, background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
            <button type="submit" disabled={saving} style={{ flex: 1, padding: 10, background: 'var(--color-primary-600)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Criando...' : 'Criar Integrador'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Renew License Modal ────────────────────────────────────────────────────────

function RenewLicenseModal({ license, token, onClose, onSaved }: { license: LicenseItem; token: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ plan: license.plan, maxSchools: String(license.maxSchools), maxDevices: String(license.maxDevices), validTo: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.validTo) { setError('Informe a data de validade'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/licenses/${license.id}/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan: form.plan, maxSchools: Number(form.maxSchools), maxDevices: Number(form.maxDevices), validTo: form.validTo }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.message || 'Erro ao renovar'); return; }
      onSaved();
    } catch { setError('Erro de conexão'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', width: '100%', maxWidth: 460, boxShadow: 'var(--shadow-xl)' }}>
        <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)' }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <RefreshCw size={16} color="var(--color-primary-600)" /> Renovar Licença
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSave} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && <div style={{ background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', fontSize: 13, color: 'var(--color-danger)' }}>{error}</div>}
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', background: 'var(--color-bg)', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
            Renovando licença de <strong>{license.integratorName}</strong>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Plano</label>
              <select value={form.plan} onChange={set('plan')} style={inputStyle}>
                <option value="trial">Trial</option>
                <option value="starter">Starter</option>
                <option value="professional">Professional</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Máx. Escolas</label>
              <input type="number" value={form.maxSchools} onChange={set('maxSchools')} min={1} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Máx. Devices</label>
              <input type="number" value={form.maxDevices} onChange={set('maxDevices')} min={1} style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Válido Até *</label>
            <input type="date" value={form.validTo} onChange={set('validTo')} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: 10, background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
            <button type="submit" disabled={saving} style={{ flex: 1, padding: 10, background: 'var(--color-primary-600)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Renovando...' : 'Renovar Licença'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Create License Modal ───────────────────────────────────────────────────────

function CreateLicenseModal({ token, integrators, onClose, onCreated }: { token: string; integrators: IntegratorItem[]; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ integratorId: '', plan: 'starter', maxSchools: '10', maxDevices: '100', validFrom: '', validTo: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.integratorId || !form.validTo) { setError('Integrador e validade são obrigatórios'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, maxSchools: Number(form.maxSchools), maxDevices: Number(form.maxDevices) }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.message || 'Erro ao criar'); return; }
      onCreated();
    } catch { setError('Erro de conexão'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', width: '100%', maxWidth: 500, boxShadow: 'var(--shadow-xl)' }}>
        <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)' }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Key size={16} color="var(--color-primary-600)" /> Nova Licença
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && <div style={{ background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', fontSize: 13, color: 'var(--color-danger)' }}>{error}</div>}
          <div>
            <label style={labelStyle}>Integrador *</label>
            <select value={form.integratorId} onChange={set('integratorId')} style={inputStyle}>
              <option value="">Selecione o integrador...</option>
              {integrators.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Plano</label>
              <select value={form.plan} onChange={set('plan')} style={inputStyle}>
                <option value="trial">Trial</option>
                <option value="starter">Starter</option>
                <option value="professional">Professional</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Máx. Escolas</label>
              <input type="number" value={form.maxSchools} onChange={set('maxSchools')} min={1} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Máx. Devices</label>
              <input type="number" value={form.maxDevices} onChange={set('maxDevices')} min={1} style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Início</label>
              <input type="date" value={form.validFrom} onChange={set('validFrom')} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Válido Até *</label>
              <input type="date" value={form.validTo} onChange={set('validTo')} style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: 10, background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
            <button type="submit" disabled={saving} style={{ flex: 1, padding: 10, background: 'var(--color-primary-600)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Criando...' : 'Criar Licença'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Tab 1: Integradores ────────────────────────────────────────────────────────

function IntegradoresTab({ token, isDemo }: { token: string; isDemo: boolean }) {
  const [items, setItems] = useState<IntegratorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<IntegratorItem | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    if (isDemo) { setItems(getDemoIntegrators()); setLoading(false); return; }
    try {
      const res = await fetch('/api/integrators', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const d = await res.json(); setItems(d.integrators || []); }
      else { setError(`Erro ${res.status} ao carregar integradores`); }
    } catch { setError('Não foi possível conectar ao servidor'); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSuspend = async (item: IntegratorItem) => {
    const newStatus = item.status === 'suspended' ? 'active' : 'suspended';
    if (isDemo) { setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: newStatus as IntegratorItem['status'] } : i)); return; }
    try {
      await fetch(`/api/integrators/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      load();
    } catch { /* ignore */ }
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>{items.length} integrador(es) cadastrado(s)</p>
        <button onClick={() => setShowCreate(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: 'var(--color-primary-600)', color: '#fff' }}>
          <Plus size={14} /> Novo Integrador
        </button>
      </div>

      {loading ? <SkeletonTable rows={4} cols={7} /> : error ? (
        <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--color-danger)' }}>
          <p style={{ margin: '0 0 8px', fontSize: 14 }}>{error}</p>
          <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={load}>Tentar novamente</button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon="building" title="Nenhum integrador" description="Cadastre o primeiro integrador para começar." />
      ) : (
        <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome / Slug</th>
                <th>CNPJ</th>
                <th>Status</th>
                <th>Escolas</th>
                <th>Devices</th>
                <th>Licença ativa</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map(i => (
                <tr key={i.id}>
                  <td>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{i.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>{i.slug}</div>
                  </td>
                  <td style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>{i.cnpj || '—'}</td>
                  <td><StatusBadge status={i.status} /></td>
                  <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: 14, textAlign: 'center' }}>{i.usedSchools}</td>
                  <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: 14, textAlign: 'center' }}>{i.totalDevices}</td>
                  <td>
                    <PlanBadge plan={i.activePlan} />
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>{new Date(i.validTo).toLocaleDateString('pt-BR')}</div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setEditTarget(i)} style={{ padding: '5px 10px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--color-text)', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Edit2 size={11} /> Editar
                      </button>
                      <button onClick={() => handleSuspend(i)} style={{ padding: '5px 10px', background: i.status === 'suspended' ? 'var(--color-success-bg)' : 'var(--color-danger-bg)', border: `1px solid ${i.status === 'suspended' ? 'var(--color-success)' : 'var(--color-danger)'}`, borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: i.status === 'suspended' ? 'var(--color-success)' : 'var(--color-danger)', fontSize: 11, fontWeight: 600 }}>
                        {i.status === 'suspended' ? 'Reativar' : 'Suspender'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editTarget && (
        <EditIntegratorModal integrator={editTarget} token={token} onClose={() => setEditTarget(null)} onSaved={() => { setEditTarget(null); load(); }} />
      )}
      {showCreate && (
        <CreateIntegratorModal token={token} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />
      )}
    </>
  );
}

// ── Tab 2: Licenças ────────────────────────────────────────────────────────────

function LicencasTab({ token, isDemo }: { token: string; isDemo: boolean }) {
  const [items, setItems] = useState<LicenseItem[]>([]);
  const [integrators, setIntegrators] = useState<IntegratorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renewTarget, setRenewTarget] = useState<LicenseItem | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    if (isDemo) { setItems(getDemoLicenses()); setIntegrators(getDemoIntegrators()); setLoading(false); return; }
    try {
      const [lRes, iRes] = await Promise.all([
        fetch('/api/licenses', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/integrators', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (lRes.ok) { const d = await lRes.json(); setItems(d.licenses || []); }
      else { setError(`Erro ${lRes.status} ao carregar licenças`); }
      if (iRes.ok) { const d = await iRes.json(); setIntegrators(d.integrators || []); }
    } catch { setError('Não foi possível conectar ao servidor'); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>{items.length} licença(s) no sistema</p>
        <button onClick={() => setShowCreate(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: 'var(--color-primary-600)', color: '#fff' }}>
          <Plus size={14} /> Nova Licença
        </button>
      </div>

      {loading ? <SkeletonTable rows={4} cols={7} /> : error ? (
        <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--color-danger)' }}>
          <p style={{ margin: '0 0 8px', fontSize: 14 }}>{error}</p>
          <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={load}>Tentar novamente</button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon="licenses" title="Nenhuma licença" description="Crie a primeira licença para um integrador." />
      ) : (
        <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Integrador</th>
                <th>Plano</th>
                <th>Status</th>
                <th>Escolas</th>
                <th>Devices</th>
                <th>Validade</th>
                <th>Graça até</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map(l => (
                <tr key={l.id}>
                  <td>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{l.integratorName}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>{l.integratorId}</div>
                  </td>
                  <td><PlanBadge plan={l.plan} /></td>
                  <td><StatusBadge status={l.status} /></td>
                  <td><UsageBar used={l.usedSchools} max={l.maxSchools} /></td>
                  <td><UsageBar used={l.usedDevices} max={l.maxDevices} /></td>
                  <td><DaysLeftBadge days={l.daysLeft} date={l.validTo} /></td>
                  <td style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {l.graceUntil ? new Date(l.graceUntil).toLocaleDateString('pt-BR') : '—'}
                  </td>
                  <td>
                    <button onClick={() => setRenewTarget(l)} style={{ padding: '5px 10px', background: 'var(--color-primary-50)', border: '1px solid var(--color-primary-200)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--color-primary-700)', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <RefreshCw size={11} /> Renovar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {renewTarget && (
        <RenewLicenseModal license={renewTarget} token={token} onClose={() => setRenewTarget(null)} onSaved={() => { setRenewTarget(null); load(); }} />
      )}
      {showCreate && (
        <CreateLicenseModal token={token} integrators={integrators} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />
      )}
    </>
  );
}

// ── Tab 4: Documentos Bloqueados ──────────────────────────────────────────────

function BlockedDocsTab({ token, isDemo }: { token: string; isDemo: boolean }) {
  const [items, setItems] = useState<BlockedDocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    if (isDemo) { setItems(getDemoBlockedDocs()); setLoading(false); return; }
    try {
      const res = await fetch('/api/admin/platform-config/blocked-documents', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const d = await res.json(); setItems(d.blockedDocuments || d || []); }
      else { setError(`Erro ${res.status} ao carregar documentos bloqueados`); }
    } catch { setError('Não foi possível conectar ao servidor'); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleUnblock = async (item: BlockedDocItem) => {
    if (isDemo) { setItems(prev => prev.filter(b => b.id !== item.id)); return; }
    try {
      await fetch(`/api/admin/platform-config/blocked-documents/${item.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      load();
    } catch { /* ignore */ }
  };

  const reasonLabel = (r: string) => {
    if (r === 'trial_used') return 'Trial utilizado';
    if (r === 'manual') return 'Manual';
    if (r === 'abuse') return 'Abuso';
    return r;
  };

  if (loading) return <SkeletonTable rows={3} cols={6} />;

  if (error) return (
    <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--color-danger)' }}>
      <p style={{ margin: '0 0 8px', fontSize: 14 }}>{error}</p>
      <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={load}>Tentar novamente</button>
    </div>
  );

  if (items.length === 0) return (
    <EmptyState icon="shield" title="Nenhum documento bloqueado." description="Não há CPFs ou CNPJs bloqueados no momento." />
  );

  return (
    <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>Documento</th>
            <th>Tipo</th>
            <th>Motivo</th>
            <th>Integrador ID</th>
            <th>Bloqueado em</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {items.map(b => (
            <tr key={b.id}>
              <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 13 }}>{b.document}</td>
              <td>
                <span className={b.type === 'CNPJ' ? 'badge badge-info' : 'badge badge-warning'}>{b.type}</span>
              </td>
              <td style={{ fontSize: 13 }}>{reasonLabel(b.reason)}</td>
              <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-muted)' }}>{b.integratorId.slice(0, 12)}...</td>
              <td style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{new Date(b.blockedAt).toLocaleDateString('pt-BR')}</td>
              <td>
                <button onClick={() => handleUnblock(b)} style={{ padding: '5px 10px', background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--color-danger)', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Trash2 size={11} /> Desbloquear
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

type Tab = 'integradores' | 'licencas' | 'usuarios' | 'documentos';

const TABS: { id: Tab; label: string }[] = [
  { id: 'integradores', label: 'Integradores' },
  { id: 'licencas', label: 'Licenças' },
  { id: 'usuarios', label: 'Usuários' },
  { id: 'documentos', label: 'Documentos Bloq.' },
];

export default function PartnerManagement() {
  const { token, isDemo, profile } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('integradores');

  // Only superadmin should see this page
  if (profile && profile.role !== 'superadmin') {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>
        <Shield size={32} style={{ opacity: 0.3, marginBottom: 10 }} />
        <div style={{ fontSize: 14, fontWeight: 600 }}>Acesso restrito a superadministradores.</div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--color-primary-800)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Building2 size={22} color="var(--color-primary-600)" /> Gestão de Parceiros
        </h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
          Gerencie integradores, licenças, usuários e documentos da plataforma.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--color-border)', marginBottom: 24, gap: 2 }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 18px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
              borderBottom: '2px solid',
              marginBottom: -2,
              color: activeTab === tab.id ? 'var(--color-primary-600)' : 'var(--color-text-muted)',
              borderBottomColor: activeTab === tab.id ? 'var(--color-primary-600)' : 'transparent',
              transition: 'color 0.15s, border-color 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'integradores' && (
        <IntegradoresTab token={token!} isDemo={isDemo} />
      )}
      {activeTab === 'licencas' && (
        <LicencasTab token={token!} isDemo={isDemo} />
      )}
      {activeTab === 'usuarios' && (
        <div style={{ margin: 0, padding: 0 }}>
          <UserManagement />
        </div>
      )}
      {activeTab === 'documentos' && (
        <BlockedDocsTab token={token!} isDemo={isDemo} />
      )}
    </div>
  );
}
