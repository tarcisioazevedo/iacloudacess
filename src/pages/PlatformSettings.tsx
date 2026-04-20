import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { SkeletonTable } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import {
  Settings, Shield, Mail, FileText, Ban,
  CheckCircle, AlertTriangle, XCircle, Trash2, Send,
  Info, Clock,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlatformConfig {
  // Trial policy
  trialDays: number;
  trialMaxSchools: number;
  trialMaxDevices: number;
  trialBlockOnExpiry: boolean;
  trialGraceDays: number;
  // License
  licenseGraceDays: number;
  // SMTP
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  smtpFromName: string;
  smtpSecure: boolean;
  smtpPassConfigured: boolean;
  // Email templates
  emailTrialWelcome: string;
  emailLicenseExpiring30: string;
  emailLicenseExpiring7: string;
  emailLicenseExpiring1: string;
  emailLicenseExpired: string;
  emailLicenseGrace: string;
  emailTrialExpiring2d: string;
  emailTrialExpiring1d: string;
  emailTrialExpired: string;
  emailSchoolWarning: string;
  emailSchoolBlocked: string;
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

function getDemoConfig(): PlatformConfig {
  return {
    trialDays: 30,
    trialMaxSchools: 3,
    trialMaxDevices: 20,
    trialBlockOnExpiry: true,
    trialGraceDays: 3,
    licenseGraceDays: 7,
    smtpHost: 'smtp.sendgrid.net',
    smtpPort: 587,
    smtpUser: 'apikey',
    smtpPass: '',
    smtpFrom: 'alertas@iacloud.com.br',
    smtpFromName: 'IA Cloud Acesso',
    smtpSecure: false,
    smtpPassConfigured: true,
    emailTrialWelcome: 'Olá {{integratorName}},\n\nSeu período de trial de {{trialDays}} dias foi ativado com sucesso!\n\nAcesse a plataforma em: {{loginUrl}}\n\nEquipe IA Cloud',
    emailLicenseExpiring30: 'Olá {{integratorName}},\n\nSua licença {{planName}} expira em {{daysLeft}} dias ({{validTo}}).\n\nRenove agora para não ter interrupções.\n\n{{loginUrl}}',
    emailLicenseExpiring7: 'Atenção {{integratorName}},\n\nSua licença expira em apenas {{daysLeft}} dias!\n\nRenove em: {{loginUrl}}',
    emailLicenseExpiring1: 'URGENTE — {{integratorName}},\n\nSua licença expira AMANHÃ!\n\nAcesse agora: {{loginUrl}}',
    emailLicenseExpired: 'Olá {{integratorName}},\n\nSua licença {{planName}} expirou em {{validTo}}.\n\nEntre em contato para renovação: {{loginUrl}}',
    emailLicenseGrace: 'Olá {{integratorName}},\n\nSua licença expirou, mas você ainda tem {{daysLeft}} dias de período de graça.\n\nRenove antes de {{validTo}} para evitar bloqueio.',
    emailTrialExpiring2d: 'Olá {{integratorName}},\n\nSeu trial termina em 2 dias ({{validTo}}).\n\nConheça nossos planos: {{loginUrl}}',
    emailTrialExpiring1d: 'Olá {{integratorName}},\n\nSeu trial termina AMANHÃ!\n\nUpgrade em: {{loginUrl}}',
    emailTrialExpired: 'Olá {{integratorName}},\n\nSeu período de trial encerrou em {{validTo}}.\n\nPara continuar usando a plataforma, contrate um plano: {{loginUrl}}',
    emailSchoolWarning: 'Olá administrador,\n\nA escola foi marcada com aviso de inadimplência.\n\nAcesse o painel: {{loginUrl}}',
    emailSchoolBlocked: 'Olá administrador,\n\nA escola foi bloqueada por inadimplência.\n\nRegularize em: {{loginUrl}}',
  };
}

function getDemoBlockedDocs(): BlockedDocItem[] {
  return [
    { id: 'bd1', document: '12.345.678/0001-90', type: 'CNPJ', reason: 'trial_used', integratorId: 'int-old-1', blockedAt: '2025-11-20T14:00:00Z' },
    { id: 'bd2', document: '987.654.321-00', type: 'CPF', reason: 'abuse', integratorId: 'int-old-2', blockedAt: '2025-12-05T09:30:00Z' },
    { id: 'bd3', document: '98.765.432/0001-11', type: 'CNPJ', reason: 'manual', integratorId: 'int-old-3', blockedAt: '2026-01-15T16:45:00Z' },
  ];
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

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

const cardStyle: React.CSSProperties = {
  background: 'var(--color-surface)',
  borderRadius: 'var(--radius)',
  border: '1px solid var(--color-border)',
  padding: 24,
};

const saveButtonStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 'var(--radius-sm)',
  border: 'none',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 13,
  background: 'var(--color-primary-600)',
  color: '#fff',
};

function SaveBar({ onSave, saving, saved }: { onSave: () => void; saving: boolean; saved: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}>
      <button onClick={onSave} disabled={saving} style={{ ...saveButtonStyle, opacity: saving ? 0.7 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>
        {saving ? 'Salvando...' : 'Salvar'}
      </button>
      {saved && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-success)', fontWeight: 600 }}>
          <CheckCircle size={14} /> Salvo
        </span>
      )}
    </div>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px', background: 'var(--color-info-bg, #eff6ff)', border: '1px solid var(--color-info-border, #bfdbfe)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--color-info, #1d4ed8)' }}>
      <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{children}</span>
    </div>
  );
}

// ── Tab 1: Política Trial ─────────────────────────────────────────────────────

function TrialPolicyTab({ config, onChange, onSave, saving, saved }: {
  config: PlatformConfig;
  onChange: (patch: Partial<PlatformConfig>) => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <InfoBox>
        Essas configurações se aplicam a novos cadastros. Trials ativos não são afetados retroativamente.
      </InfoBox>

      <div style={cardStyle}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 18px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={15} color="var(--color-primary-600)" /> Período Trial
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <div>
            <label style={labelStyle}>Duração do Trial (dias)</label>
            <input type="number" min={1} max={365} value={config.trialDays}
              onChange={e => onChange({ trialDays: Number(e.target.value) })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Máx. Escolas no Trial</label>
            <input type="number" min={1} value={config.trialMaxSchools}
              onChange={e => onChange({ trialMaxSchools: Number(e.target.value) })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Máx. Dispositivos no Trial</label>
            <input type="number" min={1} value={config.trialMaxDevices}
              onChange={e => onChange({ trialMaxDevices: Number(e.target.value) })} style={inputStyle} />
          </div>
        </div>

        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16, alignItems: 'start' }}>
          <div>
            <label style={labelStyle}>Dias de graça após trial</label>
            <input type="number" min={0} value={config.trialGraceDays}
              onChange={e => onChange({ trialGraceDays: Number(e.target.value) })} style={inputStyle} />
          </div>
          <div style={{ paddingTop: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={config.trialBlockOnExpiry}
                onChange={e => onChange({ trialBlockOnExpiry: e.target.checked })}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>Bloquear automaticamente ao expirar o trial</span>
            </label>
            <p style={{ margin: '4px 0 0 26px', fontSize: 12, color: 'var(--color-text-muted)' }}>
              Quando ativado, o integrador será bloqueado logo após o período de graça.
            </p>
          </div>
        </div>
      </div>

      <SaveBar onSave={onSave} saving={saving} saved={saved} />
    </div>
  );
}

// ── Tab 2: Licenças ────────────────────────────────────────────────────────────

function LicensePolicyTab({ config, onChange, onSave, saving, saved }: {
  config: PlatformConfig;
  onChange: (patch: Partial<PlatformConfig>) => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={cardStyle}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 18px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Shield size={15} color="var(--color-primary-600)" /> Período de Graça Comercial
        </h3>
        <div style={{ maxWidth: 320 }}>
          <label style={labelStyle}>Dias de graça (licenças comerciais)</label>
          <input type="number" min={0} max={90} value={config.licenseGraceDays}
            onChange={e => onChange({ licenseGraceDays: Number(e.target.value) })} style={inputStyle} />
        </div>
        <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--color-text-muted)', maxWidth: 560 }}>
          Após o vencimento da licença comercial, o sistema aguarda esse número de dias antes de bloquear o integrador.
          Durante este período o acesso continua normalmente, mas o integrador recebe avisos por e-mail.
        </p>
      </div>

      <SaveBar onSave={onSave} saving={saving} saved={saved} />
    </div>
  );
}

// ── Tab 3: SMTP ────────────────────────────────────────────────────────────────

function SmtpTab({ config, onChange, onSave, saving, saved, token }: {
  config: PlatformConfig;
  onChange: (patch: Partial<PlatformConfig>) => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  token: string;
}) {
  const [testEmail, setTestEmail] = useState('');
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    if (!testEmail) return;
    setTesting(true); setTestResult(null);
    try {
      const res = await fetch('/api/admin/platform-config/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ to: testEmail }),
      });
      const d = await res.json();
      setTestResult({ ok: res.ok, msg: res.ok ? 'E-mail de teste enviado com sucesso!' : (d.message || 'Erro ao enviar e-mail de teste.') });
    } catch {
      setTestResult({ ok: false, msg: 'Erro de conexão ao testar SMTP.' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={cardStyle}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 18px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Mail size={15} color="var(--color-primary-600)" /> Configuração SMTP
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={labelStyle}>Host SMTP</label>
            <input value={config.smtpHost} onChange={e => onChange({ smtpHost: e.target.value })}
              placeholder="smtp.sendgrid.net" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Porta</label>
            <input type="number" value={config.smtpPort} onChange={e => onChange({ smtpPort: Number(e.target.value) })}
              placeholder="587" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Usuário</label>
            <input value={config.smtpUser} onChange={e => onChange({ smtpUser: e.target.value })}
              placeholder="apikey" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Senha</label>
            <input type="password" value={config.smtpPass} onChange={e => onChange({ smtpPass: e.target.value })}
              placeholder={config.smtpPassConfigured ? '••••••• (não alterada)' : 'Senha SMTP'} style={inputStyle} />
            {config.smtpPassConfigured && !config.smtpPass && (
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 3, display: 'block' }}>
                Senha já configurada. Deixe em branco para manter.
              </span>
            )}
          </div>
          <div>
            <label style={labelStyle}>Remetente (e-mail)</label>
            <input type="email" value={config.smtpFrom} onChange={e => onChange({ smtpFrom: e.target.value })}
              placeholder="alertas@iacloud.com.br" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Nome do Remetente</label>
            <input value={config.smtpFromName} onChange={e => onChange({ smtpFromName: e.target.value })}
              placeholder="IA Cloud Acesso" style={inputStyle} />
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={config.smtpSecure}
              onChange={e => onChange({ smtpSecure: e.target.checked })}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Conexão segura (TLS/SSL)</span>
          </label>
        </div>
      </div>

      <SaveBar onSave={onSave} saving={saving} saved={saved} />

      {/* Test SMTP */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Send size={15} color="var(--color-text-muted)" /> Testar SMTP
        </h3>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--color-text-muted)' }}>
          Envie um e-mail de teste para verificar se o SMTP está configurado corretamente.
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Endereço de destino</label>
            <input type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)}
              placeholder="teste@empresa.com.br" style={inputStyle} />
          </div>
          <button onClick={handleTest} disabled={testing || !testEmail} style={{ ...saveButtonStyle, opacity: (testing || !testEmail) ? 0.7 : 1, cursor: (testing || !testEmail) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
            <Send size={13} /> {testing ? 'Enviando...' : 'Enviar e-mail de teste'}
          </button>
        </div>
        {testResult && (
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: testResult.ok ? 'var(--color-success)' : 'var(--color-danger)' }}>
            {testResult.ok ? <CheckCircle size={14} /> : <XCircle size={14} />}
            {testResult.msg}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tab 4: Templates de E-mail ─────────────────────────────────────────────────

const EMAIL_TEMPLATES: { key: keyof PlatformConfig; label: string }[] = [
  { key: 'emailTrialWelcome', label: 'Boas-vindas Trial' },
  { key: 'emailLicenseExpiring30', label: 'Expirando em 30 dias' },
  { key: 'emailLicenseExpiring7', label: 'Expirando em 7 dias' },
  { key: 'emailLicenseExpiring1', label: 'Expirando em 1 dia' },
  { key: 'emailLicenseExpired', label: 'Licença Expirada' },
  { key: 'emailLicenseGrace', label: 'Período de Graça' },
  { key: 'emailTrialExpiring2d', label: 'Trial Expirando em 2 dias' },
  { key: 'emailTrialExpiring1d', label: 'Trial Expirando amanhã' },
  { key: 'emailTrialExpired', label: 'Trial Expirado' },
  { key: 'emailSchoolWarning', label: 'Aviso de Cobrança Escolar' },
  { key: 'emailSchoolBlocked', label: 'Escola Bloqueada por Inadimplência' },
];

function EmailTemplatesTab({ config, onChange, onSave, saving, saved }: {
  config: PlatformConfig;
  onChange: (patch: Partial<PlatformConfig>) => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <InfoBox>
        Use <code style={{ background: 'rgba(0,0,0,0.08)', padding: '1px 5px', borderRadius: 3 }}>{'{{integratorName}}'}</code>,{' '}
        <code style={{ background: 'rgba(0,0,0,0.08)', padding: '1px 5px', borderRadius: 3 }}>{'{{daysLeft}}'}</code>,{' '}
        <code style={{ background: 'rgba(0,0,0,0.08)', padding: '1px 5px', borderRadius: 3 }}>{'{{validTo}}'}</code>,{' '}
        <code style={{ background: 'rgba(0,0,0,0.08)', padding: '1px 5px', borderRadius: 3 }}>{'{{planName}}'}</code>,{' '}
        <code style={{ background: 'rgba(0,0,0,0.08)', padding: '1px 5px', borderRadius: 3 }}>{'{{loginUrl}}'}</code>{' '}
        como variáveis nos templates.
      </InfoBox>

      {EMAIL_TEMPLATES.map(({ key, label }) => {
        const isOpen = openKey === key;
        return (
          <div key={key} style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
            <button
              onClick={() => setOpenKey(isOpen ? null : key)}
              style={{ width: '100%', padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left' }}
            >
              <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text)' }}>{label}</span>
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>{key}</span>
            </button>
            {isOpen && (
              <div style={{ borderTop: '1px solid var(--color-border)', padding: '16px 20px' }}>
                <textarea
                  value={config[key] as string}
                  onChange={e => onChange({ [key]: e.target.value })}
                  rows={6}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.6 }}
                />
              </div>
            )}
          </div>
        );
      })}

      <SaveBar onSave={onSave} saving={saving} saved={saved} />
    </div>
  );
}

// ── Tab 5: Documentos Bloqueados ───────────────────────────────────────────────

function BlockedDocsTab({ token, isDemo }: { token: string; isDemo: boolean }) {
  const [items, setItems] = useState<BlockedDocItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    if (isDemo) { setItems(getDemoBlockedDocs()); setLoading(false); return; }
    try {
      const res = await fetch('/api/admin/platform-config/blocked-documents', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const d = await res.json(); setItems(d.blockedDocuments || d || []); }
      else setItems(getDemoBlockedDocs());
    } catch { setItems(getDemoBlockedDocs()); }
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

type Tab = 'trial' | 'licencas' | 'smtp' | 'templates' | 'documentos';

const TABS: { id: Tab; label: string }[] = [
  { id: 'trial', label: 'Política Trial' },
  { id: 'licencas', label: 'Licenças' },
  { id: 'smtp', label: 'SMTP' },
  { id: 'templates', label: 'Templates de E-mail' },
  { id: 'documentos', label: 'Documentos' },
];

export default function PlatformSettings() {
  const { token, isDemo, profile } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('trial');
  const [config, setConfig] = useState<PlatformConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedTab, setSavedTab] = useState<Tab | null>(null);

  // Only superadmin should access this page
  if (profile && profile.role !== 'superadmin') {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>
        <Shield size={32} style={{ opacity: 0.3, marginBottom: 10 }} />
        <div style={{ fontSize: 14, fontWeight: 600 }}>Acesso restrito a superadministradores.</div>
      </div>
    );
  }

  const loadConfig = async () => {
    setLoading(true);
    if (isDemo) { setConfig(getDemoConfig()); setLoading(false); return; }
    try {
      const res = await fetch('/api/admin/platform-config', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const d = await res.json(); setConfig(d); }
      else setConfig(getDemoConfig());
    } catch { setConfig(getDemoConfig()); }
    setLoading(false);
  };

  useEffect(() => { loadConfig(); }, []);

  const onChange = useCallback((patch: Partial<PlatformConfig>) => {
    setConfig(prev => prev ? { ...prev, ...patch } : prev);
  }, []);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    if (!isDemo) {
      try {
        await fetch('/api/admin/platform-config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(config),
        });
      } catch { /* silent */ }
    }
    setSaving(false);
    setSaved(true);
    setSavedTab(activeTab);
    setTimeout(() => { setSaved(false); setSavedTab(null); }, 3000);
  };

  if (loading || !config) {
    return (
      <div className="animate-fade-in-up">
        <div style={{ marginBottom: 24 }}>
          <div style={{ height: 28, width: 280, background: 'var(--color-border)', borderRadius: 6, marginBottom: 8 }} />
          <div style={{ height: 16, width: 360, background: 'var(--color-border)', borderRadius: 4 }} />
        </div>
        <SkeletonTable rows={5} cols={2} />
      </div>
    );
  }

  const tabSaved = saved && savedTab === activeTab;

  const sharedProps = { config, onChange, onSave: handleSave, saving, saved: tabSaved };

  return (
    <div className="animate-fade-in-up">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--color-primary-800)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Settings size={22} color="var(--color-primary-600)" /> Configurações da Plataforma
        </h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
          Gerencie políticas de trial, licenciamento, SMTP, templates e documentos bloqueados.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--color-border)', marginBottom: 24, gap: 2, flexWrap: 'wrap' }}>
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
      {activeTab === 'trial' && <TrialPolicyTab {...sharedProps} />}
      {activeTab === 'licencas' && <LicensePolicyTab {...sharedProps} />}
      {activeTab === 'smtp' && <SmtpTab {...sharedProps} token={token!} />}
      {activeTab === 'templates' && <EmailTemplatesTab {...sharedProps} />}
      {activeTab === 'documentos' && <BlockedDocsTab token={token!} isDemo={isDemo} />}
    </div>
  );
}
