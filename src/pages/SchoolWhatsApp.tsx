import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, RefreshCw, Power, Send, Copy, ShieldCheck, Smartphone, Building2, Link2, CheckCircle2, XCircle, Loader2, QrCode as QrCodeIcon, Trash2 } from 'lucide-react';
import QRCode from 'react-qr-code';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ui/Toast';
import { EmptyState } from '../components/ui/EmptyState';
import { SkeletonCard } from '../components/ui/Skeleton';

const QR_POLL_INTERVAL = 5_000; // 5s auto-refresh when awaiting scan
const QR_EXPIRY_SECONDS = 60;   // QR code expires in ~60s

interface SchoolOption {
  id: string;
  name: string;
}

interface ChannelState {
  id: string;
  provider: string;
  instanceName: string;
  instanceId: string | null;
  instanceStatus: string | null;
  connectionState: string | null;
  phoneNumber: string | null;
  ownerJid: string | null;
  profileName: string | null;
  profileStatus: string | null;
  pairingCode: string | null;
  qrCodePayload: string | null;
  lastQrAt: string | null;
  lastConnectedAt: string | null;
  lastDisconnectedAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  isActive: boolean;
}

interface SchoolMessagingResponse {
  school: {
    id: string;
    name: string;
    integratorName: string;
  };
  channel: ChannelState | null;
  syncError?: string | null;
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR');
}

function StatusDot({ state }: { state: string | null | undefined }) {
  const color = state === 'open' ? '#22c55e' : state === 'connecting' ? '#f59e0b' : '#94a3b8';
  const pulse = state === 'connecting';
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: 10, height: 10, flexShrink: 0 }}>
      {pulse && (
        <span style={{
          position: 'absolute', inset: -2, borderRadius: '50%', background: color, opacity: 0.4,
          animation: 'wa-pulse 1.5s ease-in-out infinite',
        }} />
      )}
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
    </span>
  );
}

function connectionBadge(state?: string | null) {
  if (state === 'open') return (
    <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <StatusDot state={state} /> Conectado
    </span>
  );
  if (state === 'connecting') return (
    <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <StatusDot state={state} /> Aguardando scan
    </span>
  );
  if (state === 'close') return (
    <span className="badge badge-neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <StatusDot state={state} /> Desconectado
    </span>
  );
  return <span className="badge badge-neutral">Nao configurado</span>;
}

function imageLikeQr(payload?: string | null) {
  return Boolean(payload && payload.startsWith('data:image/'));
}

function QrCountdown({ lastQrAt }: { lastQrAt: string | null }) {
  const [remaining, setRemaining] = useState(QR_EXPIRY_SECONDS);

  useEffect(() => {
    if (!lastQrAt) return;
    const start = new Date(lastQrAt).getTime();
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      setRemaining(Math.max(0, QR_EXPIRY_SECONDS - elapsed));
    }, 1000);
    return () => clearInterval(timer);
  }, [lastQrAt]);

  if (!lastQrAt || remaining <= 0) return <span style={{ color: 'var(--color-danger)', fontSize: 12, fontWeight: 600 }}>QR expirado — clique em Atualizar</span>;

  const pct = (remaining / QR_EXPIRY_SECONDS) * 100;
  const barColor = remaining > 20 ? '#22c55e' : remaining > 10 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Expira em <strong>{remaining}s</strong></div>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--color-border)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: barColor, transition: 'width 1s linear, background 0.3s' }} />
      </div>
    </div>
  );
}

export default function SchoolWhatsApp({ isHubMode = false, hubSchoolId }: { isHubMode?: boolean; hubSchoolId?: string | null }) {
  const { token, profile, isDemo } = useAuth();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>(hubSchoolId || '');
  const [loadingSchools, setLoadingSchools] = useState(true);
  const [loadingChannel, setLoadingChannel] = useState(false);
  const [working, setWorking] = useState(false);
  const [data, setData] = useState<SchoolMessagingResponse | null>(null);
  const [instanceName, setInstanceName] = useState('');
  const [whatsappTemplate, setWhatsappTemplate] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [debugOutput, setDebugOutput] = useState<any>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const role = profile?.role || '';
  const lockedToOwnSchool = role === 'school_admin' && !!profile?.schoolId;

  const resolvedSchoolId = useMemo(() => {
    if (lockedToOwnSchool) return profile?.schoolId || '';
    return selectedSchoolId;
  }, [lockedToOwnSchool, profile?.schoolId, selectedSchoolId]);

  useEffect(() => {
    if (lockedToOwnSchool) {
      setSelectedSchoolId(profile?.schoolId || '');
      setLoadingSchools(false);
      return;
    }

    if (hubSchoolId) {
      if (selectedSchoolId !== hubSchoolId) {
        setSelectedSchoolId(hubSchoolId);
      }
      setLoadingSchools(false);
      return;
    }

    const requestedSchoolId = searchParams.get('schoolId') || '';
    const loadSchools = async () => {
      setLoadingSchools(true);
      if (isDemo) {
        const demoSchools = [
          { id: 'sch-1', name: 'Colegio Horizonte' },
          { id: 'sch-2', name: 'Colegio Atlas' },
        ];
        setSchools(demoSchools);
        setSelectedSchoolId(requestedSchoolId || demoSchools[0]?.id || '');
        setLoadingSchools(false);
        return;
      }

      try {
        const res = await fetch('/api/schools', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error('Nao foi possivel carregar as escolas');
        }
        const payload = await res.json();
        const list = (payload.schools || []).map((item: any) => ({ id: item.id, name: item.name }));
        setSchools(list);
        setSelectedSchoolId(requestedSchoolId || list[0]?.id || '');
      } catch (err: any) {
        toast.error(err.message || 'Falha ao carregar escolas');
      } finally {
        setLoadingSchools(false);
      }
    };

    loadSchools();
  }, [isDemo, lockedToOwnSchool, profile?.schoolId, searchParams, token, toast, hubSchoolId]);

  useEffect(() => {
    if (!resolvedSchoolId) return;
    if (!lockedToOwnSchool && !isHubMode) {
      setSearchParams({ schoolId: resolvedSchoolId });
    }

    const loadChannel = async () => {
      setLoadingChannel(true);

      if (isDemo) {
        const demo: SchoolMessagingResponse = {
          school: {
            id: resolvedSchoolId,
            name: schools.find(s => s.id === resolvedSchoolId)?.name || 'Colegio Horizonte',
            integratorName: 'TechSeg Solucoes',
          },
          channel: {
            id: 'demo-channel',
            provider: 'evolution',
            instanceName: 'school-techseg-colegio-horizonte-wa',
            instanceId: 'demo-instance',
            instanceStatus: 'created',
            connectionState: 'open',
            phoneNumber: '5511999999999',
            ownerJid: '5511999999999@s.whatsapp.net',
            profileName: 'Secretaria Colegio Horizonte',
            profileStatus: 'Canal oficial da escola',
            pairingCode: 'ABCD-EFGH',
            qrCodePayload: null,
            lastQrAt: new Date().toISOString(),
            lastConnectedAt: new Date().toISOString(),
            lastDisconnectedAt: null,
            lastSyncAt: new Date().toISOString(),
            lastError: null,
            isActive: true,
          },
        };
        setData(demo);
        setInstanceName(demo.channel?.instanceName || '');
        setWhatsappTemplate('');
        setLoadingChannel(false);
        return;
      }

      try {
        const res = await fetch(`/api/schools/${resolvedSchoolId}/messaging/whatsapp`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await res.json();
        if (!res.ok) {
          throw new Error(payload.message || 'Nao foi possivel carregar o canal WhatsApp');
        }
        setData(payload);
        setInstanceName(payload.channel?.instanceName || '');
        setWhatsappTemplate(payload.school?.whatsappTemplate || '');
        if (payload.syncError) {
          toast.warning(payload.syncError);
        }
      } catch (err: any) {
        toast.error(err.message || 'Falha ao carregar o canal WhatsApp');
      } finally {
        setLoadingChannel(false);
      }
    };

    loadChannel();
  }, [isDemo, lockedToOwnSchool, resolvedSchoolId, schools, setSearchParams, toast, token]);

  // ── Auto-poll when waiting for QR scan ──
  const silentRefresh = useCallback(async () => {
    if (!resolvedSchoolId || isDemo) return;
    try {
      const res = await fetch(`/api/schools/${resolvedSchoolId}/messaging/whatsapp`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const payload = await res.json();
      setData(payload);
      if (payload.channel?.instanceName) setInstanceName(payload.channel.instanceName);
      // Stop polling once connected
      if (payload.channel?.connectionState === 'open' && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        toast.success('WhatsApp conectado com sucesso!');
      }
    } catch { /* silent */ }
  }, [resolvedSchoolId, token, isDemo, toast]);

  useEffect(() => {
    const state = data?.channel?.connectionState;
    const shouldPoll = state === 'connecting' || (state === 'close' && data?.channel?.qrCodePayload);
    if (shouldPoll && !pollRef.current) {
      pollRef.current = setInterval(silentRefresh, QR_POLL_INTERVAL);
    } else if (!shouldPoll && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [data?.channel?.connectionState, data?.channel?.qrCodePayload, silentRefresh]);

  const executeAction = async (path: string, body?: Record<string, unknown>) => {
    if (!resolvedSchoolId) return;
    setWorking(true);
    try {
      const res = await fetch(`/api/schools/${resolvedSchoolId}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.message || 'Operacao nao concluida');
      }
      if (payload.channel) {
        setData(prev => prev ? { ...prev, channel: payload.channel } : prev);
        setInstanceName(payload.channel.instanceName || '');
      }
      return payload;
    } finally {
      setWorking(false);
    }
  };

  const copyValue = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiado`);
    } catch {
      toast.error(`Nao foi possivel copiar ${label.toLowerCase()}`);
    }
  };

  const handleCreateOrReconnect = async () => {
    try {
      await executeAction('/messaging/whatsapp/instance', instanceName ? { instanceName } : undefined);
      toast.success('Instancia da escola preparada com sucesso');
    } catch (err: any) {
      toast.error(err.message || 'Falha ao preparar a instancia');
    }
  };

  const handleRefresh = async () => {
    try {
      await executeAction('/messaging/whatsapp/refresh');
      toast.success('Codigo de pareamento atualizado');
    } catch (err: any) {
      toast.error(err.message || 'Falha ao atualizar o pareamento');
    }
  };

  const handleSendTest = async () => {
    if (!testPhone.trim()) {
      toast.warning('Informe um numero para o teste');
      return;
    }
    setDebugOutput(null);
    try {
      const payload = await executeAction('/messaging/whatsapp/test-message', {
        phoneNumber: testPhone,
        message: testMessage,
      });
      setDebugOutput(payload.debug || { _warning: "Backend API desatualizada (nao retornou debug)", rawPayload: payload });
      toast.success('Mensagem de teste enviada');
    } catch (err: any) {
      toast.error(err.message || 'Falha ao enviar a mensagem de teste');
      setDebugOutput({ error: err.message, stack: err.stack });
    }
  };

  const handleLogout = async () => {
    try {
      await executeAction('/messaging/whatsapp/logout');
      toast.success('Instancia desconectada');
    } catch (err: any) {
      toast.error(err.message || 'Falha ao desconectar a instancia');
    }
  };

  const handleDeleteInstance = async () => {
    if (!confirm('Tem certeza que deseja EXCLUIR a instancia WhatsApp desta escola?\n\nIsso ira remover completamente a instancia da Evolution API e do banco de dados. Voce podera criar uma nova depois.')) {
      return;
    }
    setWorking(true);
    try {
      const res = await fetch(`/api/schools/${resolvedSchoolId}/messaging/whatsapp/delete-instance`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.message || 'Falha ao excluir instancia');
      // Clear local state so UI resets to "no channel" mode
      setData(prev => prev ? { ...prev, channel: null } : prev);
      setInstanceName('');
      toast.success('Instancia excluida com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Falha ao excluir a instancia');
    } finally {
      setWorking(false);
    }
  };

  const handleSaveTemplate = async () => {
    setSavingTemplate(true);
    try {
      const res = await fetch(`/api/schools/${resolvedSchoolId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ whatsappTemplate }),
      });
      if (!res.ok) throw new Error('Falha ao salvar template');
      toast.success('Template salvo com sucesso');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar template');
    } finally {
      setSavingTemplate(false);
    }
  };

  if (loadingSchools) {
    return <SkeletonCard height={320} />;
  }

  const isConnected = data?.channel?.connectionState === 'open';
  const isWaiting = data?.channel?.connectionState === 'connecting' || (data?.channel?.connectionState === 'close' && !!data?.channel?.qrCodePayload);

  return (
    <div className="animate-fade-in-up" style={{ display: 'grid', gap: 18 }}>
      {/* Inline CSS for animations */}
      <style>{`
        @keyframes wa-pulse {
          0%, 100% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes wa-qr-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(37, 211, 102, 0.15); }
          50% { box-shadow: 0 0 24px 4px rgba(37, 211, 102, 0.25); }
        }
        .wa-qr-frame {
          animation: wa-qr-glow 2s ease-in-out infinite;
          border: 3px solid #25D366;
          border-radius: 16px;
          padding: 16px;
          background: #fff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          {!isHubMode && (
            <>
              <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--color-primary-800)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <MessageSquare size={22} color="#25D366" />
                WhatsApp por Escola
              </h1>
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '6px 0 0' }}>
                Cada escola opera com sua propria instancia Evolution e seu proprio numero, isolados por tenant.
              </p>
            </>
          )}
        </div>

        {(!lockedToOwnSchool && !isHubMode) && (
          <div style={{ minWidth: 280 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--color-text-secondary)' }}>
              Escola
            </label>
            <select
              value={selectedSchoolId}
              onChange={e => setSelectedSchoolId(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)' }}
            >
              {schools.map(school => (
                <option key={school.id} value={school.id}>{school.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {!resolvedSchoolId ? (
        <EmptyState icon="notifications" title="Nenhuma escola selecionada" description="Selecione uma escola para configurar o numero oficial de envio." />
      ) : loadingChannel ? (
        <SkeletonCard height={420} />
      ) : !data ? (
        <EmptyState icon="notifications" title="Canal indisponivel" description="Nao foi possivel carregar a configuracao de WhatsApp desta escola." />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <Building2 size={16} color="var(--color-primary-600)" />
                <strong>{data.school.name}</strong>
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{data.school.integratorName}</div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <Smartphone size={16} color="var(--color-primary-600)" />
                <strong>Status da Conexao</strong>
              </div>
              {connectionBadge(data.channel?.connectionState)}
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-muted)' }}>
                Ultima sincronizacao: {formatDateTime(data.channel?.lastSyncAt)}
              </div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <Link2 size={16} color="var(--color-primary-600)" />
                <strong>Numero Vinculado</strong>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14 }}>
                {data.channel?.phoneNumber || 'Nao conectado'}
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-muted)' }}>
                Perfil: {data.channel?.profileName || 'Nao identificado'}
              </div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <ShieldCheck size={16} color="var(--color-primary-600)" />
                <strong>Instancia</strong>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                {data.channel?.instanceName || 'Ainda nao provisionada'}
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-muted)' }}>
                Engine oficial: Evolution / WHATSAPP-BAILEYS
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(320px, 0.9fr)', gap: 16 }}>
            <section className="card" style={{ padding: 18, display: 'grid', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Provisionamento oficial</h2>
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
                    O app cria ou reutiliza a instancia da escola, solicita novo pareamento e sincroniza o estado real.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-primary" onClick={handleCreateOrReconnect} disabled={working}>
                    <MessageSquare size={14} /> {data.channel ? 'Reconectar/Preparar' : 'Criar Instancia'}
                  </button>
                  <button className="btn btn-secondary" onClick={handleRefresh} disabled={working || !data.channel}>
                    <RefreshCw size={14} /> Atualizar Codigo
                  </button>
                  <button className="btn btn-danger" onClick={handleLogout} disabled={working || !data.channel}>
                    <Power size={14} /> Logout
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={handleDeleteInstance}
                    disabled={working || !data.channel}
                    style={{ background: '#7f1d1d', borderColor: '#7f1d1d' }}
                    title="Excluir completamente a instancia da Evolution e do banco"
                  >
                    <Trash2 size={14} /> Excluir Instancia
                  </button>
                </div>
              </div>

              {!data.channel && (
                <div style={{ display: 'grid', gap: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)' }}>
                    Nome da instancia
                  </label>
                  <input
                    value={instanceName}
                    onChange={e => setInstanceName(e.target.value)}
                    placeholder="Deixe vazio para gerar automaticamente"
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }}
                  />
                </div>
              )}

              <div style={{ display: 'grid', gap: 8 }}>
                <strong style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <QrCodeIcon size={16} color="#25D366" /> Pareamento da escola
                  {isWaiting && (
                    <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> auto-refresh ativo
                    </span>
                  )}
                </strong>
                <div style={{ display: 'grid', gap: 14, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 20, background: 'var(--color-surface-2)' }}>
                  {/* Connected success state */}
                  {isConnected ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '20px 0' }}>
                      <CheckCircle2 size={48} color="#22c55e" />
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#22c55e' }}>WhatsApp Conectado!</div>
                      <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
                        Numero: <strong style={{ fontFamily: 'var(--font-mono)' }}>{data.channel?.phoneNumber || '—'}</strong>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                        Perfil: {data.channel?.profileName || 'Nao identificado'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                        Conectado desde: {formatDateTime(data.channel?.lastConnectedAt)}
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Pairing code */}
                      <div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 4 }}>Codigo de pareamento (digite no celular)</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', color: '#25D366' }}>
                            {data.channel?.pairingCode || '— — — —'}
                          </span>
                          {data.channel?.pairingCode && (
                            <button className="btn btn-ghost btn-sm" onClick={() => copyValue(data.channel!.pairingCode!, 'Pairing code')}>
                              <Copy size={13} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* QR Code display */}
                      {data.channel?.qrCodePayload ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                            Ou escaneie o QR Code abaixo:
                          </div>
                          <div className="wa-qr-frame" style={{ background: '#fff' }}>
                            {imageLikeQr(data.channel.qrCodePayload) ? (
                              <img
                                src={data.channel.qrCodePayload}
                                alt="QR Code WhatsApp"
                                style={{ width: 220, height: 220, objectFit: 'contain' }}
                              />
                            ) : (
                              <QRCode
                                value={data.channel.qrCodePayload}
                                size={220}
                                level="M"
                              />
                            )}
                          </div>
                          <QrCountdown lastQrAt={data.channel?.lastQrAt ?? null} />
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '16px 0', color: 'var(--color-text-muted)' }}>
                          <XCircle size={32} />
                          <span style={{ fontSize: 13 }}>Clique em <strong>"Criar Instancia"</strong> ou <strong>"Atualizar Codigo"</strong> para gerar o QR.</span>
                        </div>
                      )}
                    </>
                  )}

                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    Ultimo QR/codigo: {formatDateTime(data.channel?.lastQrAt)}
                  </div>
                </div>
              </div>

              {data.channel?.lastError && (
                <div className="badge badge-danger" style={{ justifyContent: 'flex-start', padding: '10px 12px', borderRadius: 'var(--radius-sm)' }}>
                  Ultimo erro: {data.channel.lastError}
                </div>
              )}
            </section>

            <section className="card" style={{ padding: 18, display: 'grid', gap: 14 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Teste operacional</h2>
                <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
                  Use um numero real do integrador ou da secretaria para homologar o envio antes de ativar notificacoes de entrada e saida.
                </p>
              </div>

              <div style={{ display: 'grid', gap: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)' }}>Numero de destino</label>
                <input
                  value={testPhone}
                  onChange={e => setTestPhone(e.target.value)}
                  placeholder="5511999999999"
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }}
                />
              </div>

              <div style={{ display: 'grid', gap: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)' }}>Mensagem opcional</label>
                <textarea
                  value={testMessage}
                  onChange={e => setTestMessage(e.target.value)}
                  placeholder="Se vazio, o app usa a mensagem padrao de homologacao."
                  style={{ width: '100%', minHeight: 120, resize: 'vertical', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }}
                />
              </div>

              <button className="btn btn-primary" onClick={handleSendTest} disabled={working || !data.channel}>
                <Send size={14} /> Enviar teste
              </button>

              <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 14, display: 'grid', gap: 6, fontSize: 12, color: 'var(--color-text-muted)' }}>
                <div><strong>Instancia:</strong> {data.channel?.instanceName || 'Nao provisionada'}</div>
                <div><strong>Conexao:</strong> {data.channel?.connectionState || 'Nao provisionada'}</div>
                <div><strong>Numero atual:</strong> {data.channel?.phoneNumber || 'Nao conectado'}</div>
                <div><strong>Ultima conexao:</strong> {formatDateTime(data.channel?.lastConnectedAt)}</div>
              </div>

              {debugOutput && (
                <div style={{ marginTop: 14, padding: 12, background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                    Logs de Envio (Debug API)
                    <button onClick={() => setDebugOutput(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>&times;</button>
                  </div>
                  <pre style={{ margin: 0, fontSize: 11, color: 'var(--color-text)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflowY: 'auto' }}>
                    {JSON.stringify(debugOutput, null, 2)}
                  </pre>
                </div>
              )}
            </section>

            <section className="card" style={{ padding: 18, display: 'grid', gap: 14 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Template de Mensagem</h2>
                <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
                  Personalize a mensagem enviada aos responsáveis. Deixe em branco para usar o padrão.
                </p>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 8 }}>
                  Variáveis disponíveis: <code style={{background: 'var(--color-surface-2)', padding: '2px 4px', borderRadius: 4}}>{`{{guardianName}}`}</code>, <code style={{background: 'var(--color-surface-2)', padding: '2px 4px', borderRadius: 4}}>{`{{studentName}}`}</code>, <code style={{background: 'var(--color-surface-2)', padding: '2px 4px', borderRadius: 4}}>{`{{enrollment}}`}</code>, <code style={{background: 'var(--color-surface-2)', padding: '2px 4px', borderRadius: 4}}>{`{{actionText}}`}</code>, <code style={{background: 'var(--color-surface-2)', padding: '2px 4px', borderRadius: 4}}>{`{{deviceLocation}}`}</code>, <code style={{background: 'var(--color-surface-2)', padding: '2px 4px', borderRadius: 4}}>{`{{dateText}}`}</code>, <code style={{background: 'var(--color-surface-2)', padding: '2px 4px', borderRadius: 4}}>{`{{timeText}}`}</code>, <code style={{background: 'var(--color-surface-2)', padding: '2px 4px', borderRadius: 4}}>{`{{method}}`}</code>, <code style={{background: 'var(--color-surface-2)', padding: '2px 4px', borderRadius: 4}}>{`{{schoolName}}`}</code>.
                </div>
              </div>
              <textarea
                value={whatsappTemplate}
                onChange={e => setWhatsappTemplate(e.target.value)}
                placeholder="*IA Cloud Access*&#10;&#10;Olá {{guardianName}},&#10;&#10;Registramos que o(a) aluno(a) *{{studentName}}* (Matrícula: {{enrollment}}) {{actionText}} instalação *{{deviceLocation}}* em {{dateText}} às {{timeText}}.&#10;&#10;Método: {{method}}&#10;&#10;Este é um aviso automático."
                style={{ width: '100%', minHeight: 120, resize: 'vertical', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }}
              />
              <button className="btn btn-primary" onClick={handleSaveTemplate} disabled={savingTemplate} style={{ justifySelf: 'start' }}>
                {savingTemplate ? <Loader2 size={14} className="spinning" /> : <Send size={14} />} Salvar Template
              </button>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
