import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/ui/Toast';
import {
  School, MapPin, Cpu, Users, ChevronRight, ChevronLeft, CheckCircle, Plus, X,
  FileSpreadsheet, Download, Loader, AlertTriangle, Zap
} from 'lucide-react';

type Step = 'school' | 'devices' | 'students' | 'done';
const STEPS: { key: Step; label: string; icon: React.ReactNode }[] = [
  { key: 'school', label: 'Escola', icon: <School size={18} /> },
  { key: 'devices', label: 'Dispositivos', icon: <Cpu size={18} /> },
  { key: 'students', label: 'Alunos', icon: <Users size={18} /> },
  { key: 'done', label: 'Concluído', icon: <CheckCircle size={18} /> },
];

// ─── Styles ──────────────────────────────────
const card: React.CSSProperties = {
  background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)',
  border: '1px solid var(--color-border)', padding: 32, boxShadow: 'var(--shadow-sm)',
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', fontSize: 13, fontFamily: 'var(--font-sans)',
  border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', outline: 'none',
};
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 };
const btnPrimary: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '12px 24px', fontSize: 14, fontWeight: 700,
  background: 'linear-gradient(135deg, var(--color-primary-600), var(--color-primary-800))', color: '#fff',
  border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer',
};
const btnSecondary: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '12px 24px', fontSize: 13, fontWeight: 600,
  background: 'var(--color-surface)', color: 'var(--color-text-secondary)',
  border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', cursor: 'pointer',
};

interface DeviceForm {
  name: string;
  model: string;
  ipAddress: string;
  location: string;
  connectionPolicy: 'auto' | 'edge_only' | 'direct_only' | 'cloud_autoreg_only';
}

const CONNECTION_POLICY_CARDS: Array<{
  value: DeviceForm['connectionPolicy'];
  title: string;
  description: string;
  disabled?: boolean;
}> = [
  {
    value: 'auto',
    title: 'Automático',
    description: 'Usa a melhor rota disponível sem exigir ajuste manual em cada operação.',
  },
  {
    value: 'edge_only',
    title: 'Via Edge Local',
    description: 'Requer edge provisionado. Durante o onboarding inicial, habilite isso depois na tela de Dispositivos.',
    disabled: true,
  },
  {
    value: 'direct_only',
    title: 'Direto / VPN',
    description: 'Usa a nuvem com rota privada controlada até o dispositivo.',
  },
  {
    value: 'cloud_autoreg_only',
    title: 'CGI Intelbras',
    description: 'Usa o fluxo AutoRegister CGI do dispositivo Intelbras.',
  },
];

type CloudMode = 'outbound_only' | 'wireguard_management';

interface EnrollmentPayload {
  enrollmentToken: string;
  enrollment: {
    id: string;
    expiresAt: string;
  };
  bootstrap?: {
    provisioningPackUrl?: string;
  };
}

interface EnrollmentStatusPayload {
  id: string;
  cloudMode: CloudMode;
  status: 'pending_claim' | 'expired' | 'claimed_waiting_heartbeat' | 'online' | 'degraded' | 'offline';
  statusLabel: string;
  message: string;
  ready: boolean;
  expiresAt: string;
  usedAt?: string | null;
  actionRequired?: 'claim_edge' | 'wait_heartbeat' | 'check_connectivity' | null;
  steps: {
    tokenCreated: boolean;
    claimed: boolean;
    heartbeatSeen: boolean;
    operational: boolean;
  };
  connector?: {
    id: string;
    name: string;
    status: string;
    hostname?: string | null;
    version?: string | null;
    lastSeenAt?: string | null;
    heartbeatAgeSeconds?: number | null;
    deviceCount: number;
    onlineDeviceCount: number;
  } | null;
}

export default function Onboarding() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState<Step>('school');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // School data
  const [schoolName, setSchoolName] = useState('');
  const [schoolAddress, setSchoolAddress] = useState('');
  const [createdSchool, setCreatedSchool] = useState<any>(null);
  const [createdUnit, setCreatedUnit] = useState<any>(null);
  const [cloudMode, setCloudMode] = useState<CloudMode>('outbound_only');
  const [provisioning, setProvisioning] = useState(false);
  const [enrollment, setEnrollment] = useState<EnrollmentPayload | null>(null);
  const [enrollmentStatus, setEnrollmentStatus] = useState<EnrollmentStatusPayload | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  // Device data
  const [devices, setDevices] = useState<DeviceForm[]>([
    {
      name: 'Portão Principal',
      model: 'SS 5530 MF FACE',
      ipAddress: '192.168.1.100',
      location: 'Entrada principal',
      connectionPolicy: 'auto',
    }
  ]);

  // Students data
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<string[][] | null>(null);
  const [importResult, setImportResult] = useState<any>(null);
  const csvRef = useRef<HTMLInputElement>(null);

  const stepIndex = STEPS.findIndex(s => s.key === step);

  const formatRelativeTime = (value?: string | null) => {
    if (!value) return 'Sem heartbeat';
    const diffMs = Date.now() - new Date(value).getTime();
    const diffMin = Math.max(0, Math.round(diffMs / 60000));
    if (diffMin < 1) return 'Agora mesmo';
    if (diffMin < 60) return `${diffMin} min atras`;
    const diffHours = Math.round(diffMin / 60);
    if (diffHours < 24) return `${diffHours} h atras`;
    const diffDays = Math.round(diffHours / 24);
    return `${diffDays} d atras`;
  };

  const loadEnrollmentStatus = async (enrollmentId: string, silent = false) => {
    if (!enrollmentId) return;

    if (!silent) setStatusLoading(true);
    try {
      const response = await fetch(`/api/edge/enrollment-tokens/${enrollmentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Falha ao consultar o status do enrollment');
      }
      setEnrollmentStatus(data.enrollmentStatus || null);
    } catch (err: any) {
      if (!silent) {
        const message = err.message || 'Nao foi possivel consultar o status do edge';
        setError(message);
        toast.error(message);
      }
    } finally {
      if (!silent) setStatusLoading(false);
    }
  };

  useEffect(() => {
    if (!enrollment?.enrollment?.id || step !== 'devices') return;

    let active = true;
    const run = async (silent = false) => {
      if (!active) return;
      await loadEnrollmentStatus(enrollment.enrollment.id, silent);
    };

    void run(false);
    const timer = window.setInterval(() => {
      void run(true);
    }, 10000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [enrollment?.enrollment?.id, step, token]);

  // ─── Step 1: Create School ─────────────────
  const handleCreateSchool = async () => {
    if (!schoolName.trim()) { setError('Nome da escola é obrigatório'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/schools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: schoolName, address: schoolAddress }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setCreatedSchool(data.school);
      setCreatedUnit(data.unit);
      setEnrollment(null);
      setEnrollmentStatus(null);
      setCloudMode('outbound_only');
      setStep('devices');
    } catch (err: any) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  // ─── Step 2: Add Devices ───────────────────
  const addDevice = () => setDevices([...devices, {
    name: '',
    model: 'SS 5530 MF FACE',
    ipAddress: '',
    location: '',
    connectionPolicy: 'auto',
  }]);
  const removeDevice = (i: number) => setDevices(devices.filter((_, idx) => idx !== i));
  const updateDevice = (i: number, field: keyof DeviceForm, value: string) => {
    const updated = [...devices];
    updated[i] = { ...updated[i], [field]: value };
    setDevices(updated);
  };

  const handleProvisionEdge = async () => {
    if (!createdUnit?.id) return;

    setProvisioning(true);
    setError('');
    try {
      const response = await fetch('/api/edge/enrollment-tokens', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          schoolUnitId: createdUnit.id,
          label: `${createdSchool?.name || 'escola'}-onboarding-edge`,
          expiresInHours: 24,
          cloudMode,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Falha ao gerar token de provisionamento do edge');
      setEnrollment(data);
      setEnrollmentStatus(null);
      toast.success('Token de provisionamento gerado');
      if (data.enrollment?.id) {
        void loadEnrollmentStatus(data.enrollment.id, true);
      }
    } catch (err: any) {
      const message = err.message || 'Nao foi possivel gerar o token de provisionamento do edge';
      setError(message);
      toast.error(message);
    } finally {
      setProvisioning(false);
    }
  };

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado`);
    } catch {
      toast.error(`Nao foi possivel copiar ${label.toLowerCase()}`);
    }
  };

  const handleCreateDevices = async () => {
    const validDevices = devices.filter(d => d.name && d.ipAddress);
    if (validDevices.length === 0) { setStep('students'); return; }

    setLoading(true); setError('');
    let errors = 0;
    for (const d of validDevices) {
      const connectionPolicy = d.connectionPolicy === 'edge_only' ? 'auto' : d.connectionPolicy;
      try {
        const response = await fetch('/api/devices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            ...d,
            connectionPolicy,
            schoolUnitId: createdUnit.id,
            port: 80,
            username: 'admin',
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.message || 'Falha ao cadastrar dispositivo');
        }
      } catch { errors++; }
    }
    if (errors > 0) setError(`${errors} dispositivo(s) falharam`);
    setStep('students');
    setLoading(false);
  };

  // ─── Step 3: Import Students ───────────────
  const handleCsvFile = (f: File) => {
    setCsvFile(f);
    const reader = new FileReader();
    reader.onload = (e) => {
      const csv = (e.target?.result as string).replace(/^\uFEFF/, '');
      const sep = csv.includes(';') ? ';' : ',';
      const lines = csv.split(/\r?\n/).filter(l => l.trim()).slice(0, 6);
      setCsvPreview(lines.map(l => l.split(sep).map(c => c.trim().replace(/^"|"$/g, ''))));
    };
    reader.readAsText(f);
  };

  const handleImport = async () => {
    if (!csvFile) { setStep('done'); return; }
    setLoading(true); setError('');
    const formData = new FormData();
    formData.append('file', csvFile);
    formData.append('schoolId', createdSchool.id);
    try {
      const res = await fetch('/api/students/import-csv', {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData,
      });
      const data = await res.json();
      setImportResult(data);
      setStep('done');
    } catch (err: any) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  const downloadTemplate = () => {
    const csv = 'Nome;Matrícula;Série;Turma;Turno\nAna Julia Oliveira;2026001;8º ano;8A;manhã\nPedro Henrique;2026002;7º ano;7B;tarde\n';
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'modelo_alunos.csv'; a.click();
  };

  return (
    <div className="animate-fade-in-up" style={{ maxWidth: 720, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <Zap size={24} color="var(--color-primary-500)" /> Onboarding de Escola
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginTop: 4 }}>
          Configure uma nova escola em 3 passos simples
        </p>
      </div>

      {/* Progress Steps */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, marginBottom: 32 }}>
        {STEPS.map((s, i) => (
          <React.Fragment key={s.key}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 'var(--radius-lg)',
              background: i <= stepIndex ? 'var(--color-primary-50)' : 'transparent',
              border: i === stepIndex ? '2px solid var(--color-primary-400)' : '2px solid transparent',
              transition: 'all 0.3s',
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: i < stepIndex ? 'var(--color-success-500)' : i === stepIndex ? 'var(--color-primary-600)' : 'var(--color-border)',
                color: i <= stepIndex ? '#fff' : 'var(--color-text-muted)', fontSize: 12, fontWeight: 700,
                transition: 'all 0.3s',
              }}>
                {i < stepIndex ? <CheckCircle size={14} /> : s.icon}
              </div>
              <span style={{
                fontSize: 12, fontWeight: i === stepIndex ? 700 : 500,
                color: i <= stepIndex ? 'var(--color-primary-700)' : 'var(--color-text-muted)',
                display: i === stepIndex || (typeof window !== 'undefined' && window.innerWidth > 640) ? 'inline' : 'none',
              }}>{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ width: 30, height: 2, background: i < stepIndex ? 'var(--color-success-400)' : 'var(--color-border)', borderRadius: 1, transition: 'background 0.3s' }} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '10px 16px', marginBottom: 16, borderRadius: 'var(--radius-md)', background: 'var(--color-danger-50)', border: '1px solid var(--color-danger-200)', color: 'var(--color-danger-700)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {/* ─── Step 1: School ─────────────────── */}
      {step === 'school' && (
        <div style={card} className="animate-fade-in-up">
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <School size={20} /> Dados da Escola
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <label>
              <span style={labelStyle}>Nome da Escola *</span>
              <input value={schoolName} onChange={e => setSchoolName(e.target.value)} placeholder="Ex: Colégio Horizonte" style={inputStyle}
                onFocus={e => e.target.style.borderColor = 'var(--color-primary-400)'}
                onBlur={e => e.target.style.borderColor = 'var(--color-border)'} />
            </label>
            <label>
              <span style={labelStyle}>Endereço</span>
              <input value={schoolAddress} onChange={e => setSchoolAddress(e.target.value)} placeholder="Rua, número, bairro, cidade" style={inputStyle}
                onFocus={e => e.target.style.borderColor = 'var(--color-primary-400)'}
                onBlur={e => e.target.style.borderColor = 'var(--color-border)'} />
            </label>
          </div>
          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={handleCreateSchool} disabled={loading} style={{ ...btnPrimary, opacity: loading ? 0.7 : 1 }}>
              {loading ? <Loader size={16} className="spin" /> : <ChevronRight size={16} />} Próximo
            </button>
          </div>
        </div>
      )}

      {/* ─── Step 2: Devices ───────────────── */}
      {step === 'devices' && (
        <div style={card} className="animate-fade-in-up">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Cpu size={20} /> Dispositivos — {createdSchool?.name}
            </h2>
            <button onClick={addDevice} style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', fontSize: 12, fontWeight: 600,
              background: 'var(--color-primary-50)', color: 'var(--color-primary-700)',
              border: '1px solid var(--color-primary-200)', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            }}><Plus size={14} /> Adicionar</button>
          </div>

          <div style={{
            marginBottom: 20,
            padding: 16,
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface-2)',
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              Preparacao do edge local
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
              Se esta escola vai usar edge local, ja deixe pronto o primeiro token de provisionamento. Isso permite registrar o appliance depois sem repetir o onboarding.
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <button
                type="button"
                onClick={() => { setCloudMode('outbound_only'); setEnrollment(null); setEnrollmentStatus(null); }}
                style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: cloudMode === 'outbound_only' ? '1.5px solid var(--color-primary-400)' : '1px solid var(--color-border)',
                  background: cloudMode === 'outbound_only' ? 'var(--color-primary-50)' : 'var(--color-surface)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Saida para nuvem
              </button>
              <button
                type="button"
                onClick={() => { setCloudMode('wireguard_management'); setEnrollment(null); setEnrollmentStatus(null); }}
                style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: cloudMode === 'wireguard_management' ? '1.5px solid var(--color-primary-400)' : '1px solid var(--color-border)',
                  background: cloudMode === 'wireguard_management' ? 'var(--color-primary-50)' : 'var(--color-surface)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                WireGuard de gestao
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => { void handleProvisionEdge(); }} disabled={provisioning} style={{ ...btnPrimary, padding: '10px 16px', fontSize: 12, opacity: provisioning ? 0.7 : 1 }}>
                {provisioning ? <Loader size={14} className="spin" /> : <Zap size={14} />}
                {provisioning ? 'Gerando token...' : 'Gerar token do edge'}
              </button>
              <button onClick={() => navigate('/edges')} style={{ ...btnSecondary, padding: '10px 16px', fontSize: 12 }}>
                Abrir Edges
              </button>
            </div>

            {enrollment && (
              <div style={{
                marginTop: 14,
                padding: 14,
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-primary-200)',
                background: 'var(--color-surface)',
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)', marginBottom: 8 }}>
                  Token de provisionamento
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.5, wordBreak: 'break-all', marginBottom: 8 }}>
                  {enrollment.enrollmentToken}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
                  Expira em {enrollment.enrollment?.expiresAt ? new Date(enrollment.enrollment.expiresAt).toLocaleString('pt-BR') : '24 horas'}.
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => { void handleCopy(enrollment.enrollmentToken, 'Token'); }} style={{ ...btnSecondary, padding: '8px 12px', fontSize: 12 }}>
                    Copiar token
                  </button>
                  {enrollment.bootstrap?.provisioningPackUrl && (
                    <button
                      onClick={() => {
                        const provisioningPackUrl = enrollment.bootstrap?.provisioningPackUrl;
                        if (provisioningPackUrl) {
                          void handleCopy(`${window.location.origin}${provisioningPackUrl}`, 'URL do pacote');
                        }
                      }}
                      style={{ ...btnSecondary, padding: '8px 12px', fontSize: 12 }}
                    >
                      Copiar URL do pacote
                    </button>
                  )}
                  <button
                    onClick={() => { void loadEnrollmentStatus(enrollment.enrollment.id); }}
                    disabled={statusLoading}
                    style={{ ...btnSecondary, padding: '8px 12px', fontSize: 12, opacity: statusLoading ? 0.7 : 1 }}
                  >
                    {statusLoading ? 'Atualizando...' : 'Atualizar status'}
                  </button>
                </div>

                <div style={{
                  marginTop: 14,
                  padding: 14,
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface-2)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>
                        Acompanhamento do edge
                      </div>
                      <div style={{ marginTop: 4, fontSize: 14, fontWeight: 700 }}>
                        {enrollmentStatus?.statusLabel || 'Consultando status do edge'}
                      </div>
                    </div>
                    {enrollmentStatus && (
                      <span
                        className={`badge ${
                          enrollmentStatus.status === 'online'
                            ? 'badge-success'
                            : enrollmentStatus.status === 'degraded'
                              ? 'badge-warning'
                              : enrollmentStatus.status === 'expired' || enrollmentStatus.status === 'offline'
                                ? 'badge-danger'
                                : 'badge-info'
                        }`}
                      >
                        {enrollmentStatus.statusLabel}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginTop: 12 }}>
                    {[
                      { key: 'tokenCreated', label: 'Token gerado' },
                      { key: 'claimed', label: 'Claim realizado' },
                      { key: 'heartbeatSeen', label: 'Heartbeat visto' },
                      { key: 'operational', label: 'Pronto para operar' },
                    ].map((item) => {
                      const active = Boolean(enrollmentStatus?.steps?.[item.key as keyof EnrollmentStatusPayload['steps']]);
                      return (
                        <div
                          key={item.key}
                          style={{
                            padding: 10,
                            borderRadius: 'var(--radius-sm)',
                            border: active ? '1px solid var(--color-success-300)' : '1px solid var(--color-border)',
                            background: active ? 'var(--color-success-50)' : 'var(--color-surface)',
                          }}
                        >
                          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Etapa
                          </div>
                          <div style={{ marginTop: 4, fontSize: 12, fontWeight: 700 }}>
                            {item.label}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ marginTop: 12, fontSize: 12, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>
                    {enrollmentStatus?.message || 'Assim que o edge fizer o claim, esta area passa a mostrar heartbeat e prontidao operacional.'}
                  </div>

                  {enrollmentStatus?.connector && (
                    <div style={{
                      marginTop: 12,
                      padding: 12,
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-surface)',
                      display: 'grid',
                      gap: 6,
                      fontSize: 12,
                      color: 'var(--color-text-secondary)',
                    }}>
                      <div>
                        Edge: <strong>{enrollmentStatus.connector.name}</strong>
                        {enrollmentStatus.connector.hostname ? ` (${enrollmentStatus.connector.hostname})` : ''}
                      </div>
                      <div>
                        Heartbeat: {formatRelativeTime(enrollmentStatus.connector.lastSeenAt)}
                      </div>
                      <div>
                        Devices online via edge: {enrollmentStatus.connector.onlineDeviceCount}/{enrollmentStatus.connector.deviceCount}
                      </div>
                      {enrollmentStatus.connector.version && (
                        <div>Versao reportada: {enrollmentStatus.connector.version}</div>
                      )}
                    </div>
                  )}

                  {enrollmentStatus?.ready && (
                    <div style={{
                      marginTop: 12,
                      padding: 12,
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-success-300)',
                      background: 'var(--color-success-50)',
                      fontSize: 12,
                      lineHeight: 1.55,
                    }}>
                      Edge pronto. O proximo passo e revisar a associacao dos dispositivos na tela de Dispositivos e validar sincronizacao/coleta.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {devices.map((d, i) => (
              <div key={i} style={{ padding: 16, borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', position: 'relative' }}>
                {devices.length > 1 && (
                  <button onClick={() => removeDevice(i)} style={{
                    position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)',
                  }}><X size={16} /></button>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <label>
                    <span style={labelStyle}>Nome *</span>
                    <input value={d.name} onChange={e => updateDevice(i, 'name', e.target.value)} placeholder="Portão Principal" style={inputStyle} />
                  </label>
                  <label>
                    <span style={labelStyle}>Modelo</span>
                    <select value={d.model} onChange={e => updateDevice(i, 'model', e.target.value)} style={inputStyle}>
                      <option value="SS 5530 MF FACE">SS 5530 MF FACE</option>
                      <option value="SS 3540 MF FACE">SS 3540 MF FACE</option>
                      <option value="VIP 3230 B">VIP 3230 B</option>
                      <option value="VIP 1230 B G2">VIP 1230 B G2</option>
                      <option value="Outro">Outro</option>
                    </select>
                  </label>
                  <label>
                    <span style={labelStyle}>IP do Dispositivo *</span>
                    <input value={d.ipAddress} onChange={e => updateDevice(i, 'ipAddress', e.target.value)} placeholder="192.168.1.100" style={inputStyle} />
                  </label>
                  <label>
                    <span style={labelStyle}>Localização</span>
                    <input value={d.location} onChange={e => updateDevice(i, 'location', e.target.value)} placeholder="Entrada principal" style={inputStyle} />
                  </label>
                </div>

                <div style={{ marginTop: 14 }}>
                  <span style={labelStyle}>Estratégia de conexão</span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                    {CONNECTION_POLICY_CARDS.map((option) => {
                      const active = d.connectionPolicy === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          disabled={option.disabled}
                          onClick={() => {
                            if (!option.disabled) {
                              updateDevice(i, 'connectionPolicy', option.value);
                            }
                          }}
                          style={{
                            textAlign: 'left',
                            padding: 14,
                            borderRadius: 'var(--radius-md)',
                            border: active ? '1.5px solid var(--color-primary-400)' : '1px solid var(--color-border)',
                            background: active ? 'var(--color-primary-50)' : 'var(--color-surface)',
                            cursor: option.disabled ? 'not-allowed' : 'pointer',
                            opacity: option.disabled ? 0.6 : 1,
                          }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4, color: active ? 'var(--color-primary-700)' : 'var(--color-text-primary)' }}>
                            {option.title}
                          </div>
                          <div style={{ fontSize: 11, lineHeight: 1.45, color: 'var(--color-text-secondary)' }}>
                            {option.description}
                          </div>
                          {option.disabled && (
                            <div style={{ marginTop: 8, fontSize: 10, fontWeight: 700, color: 'var(--color-warning-700)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              Disponível após provisionar um edge
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 12 }}>
            💡 Você pode pular esta etapa e cadastrar dispositivos depois. O modo edge dedicado fica disponível após provisionar o appliance local na área de Edges.
          </p>

          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={() => setStep('school')} style={btnSecondary}><ChevronLeft size={16} /> Voltar</button>
            <button onClick={handleCreateDevices} disabled={loading} style={{ ...btnPrimary, opacity: loading ? 0.7 : 1 }}>
              {loading ? <Loader size={16} className="spin" /> : <ChevronRight size={16} />}
              {devices.some(d => d.name && d.ipAddress) ? 'Cadastrar e Avançar' : 'Pular'}
            </button>
          </div>
        </div>
      )}

      {/* ─── Step 3: Students ──────────────── */}
      {step === 'students' && (
        <div style={card} className="animate-fade-in-up">
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={20} /> Importar Alunos — {createdSchool?.name}
          </h2>

          <button onClick={downloadTemplate} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 12, fontWeight: 600,
            background: 'var(--color-primary-50)', color: 'var(--color-primary-700)',
            border: '1px solid var(--color-primary-200)', borderRadius: 'var(--radius-md)', cursor: 'pointer', marginBottom: 16,
          }}><Download size={14} /> Baixar modelo CSV</button>

          <div onClick={() => csvRef.current?.click()} style={{
            border: '2px dashed var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 30,
            textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.2s',
          }} onMouseOver={e => (e.currentTarget.style.borderColor = 'var(--color-primary-400)')}
             onMouseOut={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}>
            <FileSpreadsheet size={28} style={{ color: 'var(--color-text-muted)', marginBottom: 6 }} />
            <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{csvFile ? `📄 ${csvFile.name}` : 'Clique para selecionar o CSV'}</p>
            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>Colunas: Nome, Matrícula, Série, Turma, Turno</p>
            <input ref={csvRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleCsvFile(e.target.files[0])} />
          </div>

          {csvPreview && (
            <div style={{ marginTop: 16, overflow: 'auto' }}>
              <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>📋 Prévia:</p>
              <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                <thead>
                  <tr>{csvPreview[0].map((h, i) => (
                    <th key={i} style={{ padding: '6px 8px', textAlign: 'left', background: 'var(--color-primary-50)', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', borderBottom: '2px solid var(--color-primary-200)' }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {csvPreview.slice(1).map((row, ri) => (
                    <tr key={ri} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      {row.map((cell, ci) => <td key={ci} style={{ padding: '6px 8px' }}>{cell}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 12 }}>
            💡 Você pode pular e cadastrar alunos manualmente depois.
          </p>

          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={() => setStep('devices')} style={btnSecondary}><ChevronLeft size={16} /> Voltar</button>
            <button onClick={handleImport} disabled={loading} style={{ ...btnPrimary, opacity: loading ? 0.7 : 1 }}>
              {loading ? <Loader size={16} className="spin" /> : <ChevronRight size={16} />}
              {csvFile ? `Importar e Finalizar` : 'Pular e Finalizar'}
            </button>
          </div>
        </div>
      )}

      {/* ─── Done ──────────────────────────── */}
      {step === 'done' && (
        <div style={{ ...card, textAlign: 'center' }} className="animate-fade-in-up">
          <div style={{
            width: 80, height: 80, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, var(--color-success-100), var(--color-success-200))',
            margin: '0 auto 20px',
          }}>
            <CheckCircle size={40} color="var(--color-success-600)" />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px' }}>🎉 Escola Configurada!</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: 8 }}>
            <strong>{createdSchool?.name}</strong> está pronta para uso.
          </p>

          {importResult && (
            <div style={{ padding: 16, background: 'var(--color-success-50)', borderRadius: 'var(--radius-md)', margin: '16px 0', textAlign: 'left' }}>
              <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{importResult.message}</p>
              {importResult.errors?.length > 0 && (
                <p style={{ fontSize: 11, color: 'var(--color-warning-600)', marginTop: 4 }}>
                  ⚠️ {importResult.errors.length} erro(s) na importação
                </p>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' }}>
            <button onClick={() => navigate('/students')} style={btnPrimary}>
              <Users size={16} /> Ver Alunos
            </button>
            <button onClick={() => navigate('/devices')} style={btnSecondary}>
              <Cpu size={16} /> Ver Dispositivos
            </button>
            <button onClick={() => { setStep('school'); setCreatedSchool(null); setCreatedUnit(null); setSchoolName(''); setSchoolAddress(''); setCloudMode('outbound_only'); setEnrollment(null); setEnrollmentStatus(null); setDevices([{ name: 'Portão Principal', model: 'SS 5530 MF FACE', ipAddress: '192.168.1.100', location: 'Entrada principal', connectionPolicy: 'auto' }]); setCsvFile(null); setCsvPreview(null); setImportResult(null); }} style={btnSecondary}>
              <Plus size={16} /> Nova Escola
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
