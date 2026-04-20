import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { HardDrive, Wifi, WifiOff, RefreshCw, MapPin, Clock, Users } from 'lucide-react';

interface EdgeConnectorSummary {
  id: string;
  name: string;
  status: string;
  lastSeenAt?: string | null;
}

interface DeviceData {
  id: string;
  name: string;
  model: string;
  ipAddress: string;
  port: number;
  location: string;
  status: string;
  lastHeartbeat: string;
  lastEventAt: string;
  edgeConnectorId?: string | null;
  reverseIdentifier?: string;
  connectionPolicy?: 'auto' | 'edge_only' | 'direct_only' | 'cloud_autoreg_only';
  connectivityMode?: 'direct' | 'edge';
  transport?: {
    connectionPolicy: 'auto' | 'edge_only' | 'direct_only' | 'cloud_autoreg_only';
    connectionPolicyLabel: string;
    connectionPolicyHint: string;
    effectiveTransport: 'edge_local' | 'direct_http' | 'cloud_autoreg' | 'unavailable';
    effectiveTransportLabel: string;
    deliveryMode: 'edge' | 'cloud' | 'unavailable';
    reason: string;
    autoRegisterConnected: boolean;
  };
  cloudConnection?: {
    reverseIdentifier: string;
    autoRegisterConnected: boolean;
    autoRegisterConnectUrl?: string | null;
    connectionStatusLabel: string;
  };
  intelbrasEventPush?: {
    publicBaseUrl: string;
    eventEndpointUrl: string;
    address: string;
    port: number;
    uploadPath: string;
    httpsEnabled: boolean;
    step1Command: string;
    stepContentTypeCommand: string;
    step2Command: string;
  } | null;
  edgeConnector?: EdgeConnectorSummary | null;
  schoolUnit: {
    name: string;
    school: { name: string };
    edgeConnectors?: EdgeConnectorSummary[];
  };
  _count: { studentLinks: number; syncJobs: number };
}

const CONNECTION_POLICY_OPTIONS: Array<{
  value: NonNullable<DeviceData['connectionPolicy']>;
  label: string;
}> = [
  { value: 'auto', label: 'Automatico (Recomendado)' },
  { value: 'edge_only', label: 'Via Edge Local' },
  { value: 'direct_only', label: 'Via Direto / VPN' },
  { value: 'cloud_autoreg_only', label: 'Via CGI Intelbras' },
];

export default function Devices() {
  const { token } = useAuth();
  const [devices, setDevices] = useState<DeviceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [savingRoute, setSavingRoute] = useState<string | null>(null);

  // Add Device Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [availableUnits, setAvailableUnits] = useState<{ id: string, name: string, schoolName: string }[]>([]);
  const [addForm, setAddForm] = useState({
    schoolUnitId: '',
    name: '',
    model: '',
    ipAddress: '',
    port: 80,
    username: 'admin',
    passwordEnc: '',
    location: '',
  });

  const load = () => {
    if (!token) {
      return;
    }

    fetch('/api/devices', { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => response.json())
      .then((data) => setDevices(data.devices || []))
      .catch(() => {})
      .finally(() => setLoading(false));

    // Fetch schools and extract their units to populate the dropdown
    fetch('/api/schools', { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => response.json())
      .then((data) => {
         // To get units without extra API calls, we rely on the fact that an Admin can query schools.
         // However, /api/schools doesn't return full units array. We'll fetch the units for the first school.
         // Better yet, since there is an endpoint `/api/schools/:id` let's just make it simple: 
         // If there's at least one school, we fetch its details to get its units.
         const schools = data.schools || [];
         if (schools.length > 0) {
           fetch(`/api/schools/${schools[0].id}`, { headers: { Authorization: `Bearer ${token}` } })
             .then(r => r.json())
             .then(sd => {
               if (sd.school && sd.school.units) {
                 setAvailableUnits(sd.school.units.map((u: any) => ({
                   id: u.id,
                   name: u.name,
                   schoolName: sd.school.name
                 })));
                 setAddForm(prev => ({ ...prev, schoolUnitId: sd.school.units[0]?.id || '' }));
               }
             });
         }
      })
      .catch(() => {});
  };

  useEffect(load, [token]);

  const saveDeviceRouting = async (
    deviceId: string,
    payload: {
      connectionPolicy: NonNullable<DeviceData['connectionPolicy']>;
      edgeConnectorId?: string | null;
    },
  ) => {
    setSavingRoute(deviceId);

    try {
      const response = await fetch(`/api/devices/${deviceId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Erro ao atualizar rota do dispositivo');
      }

      setDevices((current) => current.map((device) => (
        device.id === deviceId
          ? {
              ...device,
              ...data.device,
            }
          : device
      )));
    } catch (err: any) {
      alert(err.message || 'Erro ao atualizar rota do dispositivo');
      load();
    } finally {
      setSavingRoute(null);
    }
  };

  const triggerSync = async (deviceId: string) => {
    setSyncing(deviceId);
    try {
      const response = await fetch(`/api/device-sync/${deviceId}/sync-all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Erro ao criar sync jobs');
      }
      alert(data.message || 'Jobs de sincronizacao criados');
    } catch (err: any) {
      alert(err.message || 'Erro ao criar sync jobs');
    }
    setSyncing(null);
  };

  const handleAddDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...addForm, isVirtual: false, connectionPolicy: 'auto' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Erro ao criar dispositivo');
      setShowAddModal(false);
      setAddForm({ ...addForm, name: '', ipAddress: '', passwordEnc: '', location: '' });
      load();
    } catch (err: any) {
      alert(err.message || 'Erro ao criar dispositivo');
    }
  };

  const statusColor = (status: string) => (
    status === 'online'
      ? 'var(--color-success)'
      : status === 'unstable'
        ? 'var(--color-warning)'
        : 'var(--color-danger)'
  );

  return (
    <div className="animate-fade-in-up">
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <HardDrive size={22} /> Dispositivos
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 2 }}>
            {devices.length} dispositivos cadastrados
          </p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          style={{ background: 'var(--color-primary-600)', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: 'var(--radius-md)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <HardDrive size={16} /> Novo Dispositivo
        </button>
      </div>

      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="animate-fade-in-up" style={{ background: 'var(--color-surface)', width: '100%', maxWidth: 500, borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Cadastrar Dispositivo de Acesso</h2>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>✕</button>
            </div>
            <form onSubmit={handleAddDevice} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Unidade Escolar</label>
                <select 
                  required value={addForm.schoolUnitId} onChange={e => setAddForm({...addForm, schoolUnitId: e.target.value})}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
                >
                  <option value="" disabled>Selecione a Unidade</option>
                  {availableUnits.map(u => (
                    <option key={u.id} value={u.id}>{u.schoolName} - {u.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Nome de Identificação</label>
                  <input required placeholder="Ex: Catraca Principal" value={addForm.name} onChange={e => setAddForm({...addForm, name: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Modelo do Equipamento</label>
                  <input placeholder="Ex: Intelbras SS 3530" value={addForm.model} onChange={e => setAddForm({...addForm, model: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>IP na Rede Local</label>
                  <input required placeholder="Ex: 192.168.1.200" value={addForm.ipAddress} onChange={e => setAddForm({...addForm, ipAddress: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontFamily: 'var(--font-mono)' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Porta HTTP</label>
                  <input required type="number" value={addForm.port} onChange={e => setAddForm({...addForm, port: parseInt(e.target.value)})} style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontFamily: 'var(--font-mono)' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Usuário Intelbras</label>
                  <input required value={addForm.username} onChange={e => setAddForm({...addForm, username: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Senha do Equipamento</label>
                  <input type="password" placeholder="Em branco se for só AutoRegister" value={addForm.passwordEnc} onChange={e => setAddForm({...addForm, passwordEnc: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Localização do Hardware (Descritivo)</label>
                <input placeholder="Ex: Portão da direita na entrada dos alunos" value={addForm.location} onChange={e => setAddForm({...addForm, location: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }} />
              </div>
              <div style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowAddModal(false)} style={{ padding: '10px 16px', borderRadius: 'var(--radius-md)', background: 'transparent', border: '1px solid var(--color-border)', fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                <button type="submit" style={{ padding: '10px 16px', borderRadius: 'var(--radius-md)', background: 'var(--color-primary-600)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>Salvar Dispositivo</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 16 }}>
        {devices.map((device) => {
          const availableEdges = device.schoolUnit.edgeConnectors || [];
          const selectedPolicy = device.connectionPolicy || device.transport?.connectionPolicy || 'auto';
          const selectedEdgeId = device.edgeConnector?.id || device.edgeConnectorId || null;
          const selectedEdge = availableEdges.find((edge) => edge.id === selectedEdgeId) || device.edgeConnector || null;
          const requiresEdge = selectedPolicy === 'edge_only';

          const handlePolicyChange = (nextPolicy: NonNullable<DeviceData['connectionPolicy']>) => {
            const nextEdgeId = nextPolicy === 'edge_only'
              ? selectedEdgeId || availableEdges[0]?.id || null
              : nextPolicy === 'auto'
                ? selectedEdgeId
                : null;

            void saveDeviceRouting(device.id, {
              connectionPolicy: nextPolicy,
              edgeConnectorId: nextEdgeId,
            });
          };

          const handleEdgeChange = (nextEdgeId: string) => {
            void saveDeviceRouting(device.id, {
              connectionPolicy: selectedPolicy,
              edgeConnectorId: nextEdgeId || null,
            });
          };

          return (
            <div
              key={device.id}
              style={{
                background: 'var(--color-surface)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-border)',
                padding: 22,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: statusColor(device.status) }} />

              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 3 }}>{device.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{device.model || 'Sem modelo'}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {device.status === 'online'
                    ? <Wifi size={15} color="var(--color-success)" />
                    : <WifiOff size={15} color="var(--color-danger)" />}
                  <span className={`badge ${device.status === 'online' ? 'badge-success' : device.status === 'unstable' ? 'badge-warning' : 'badge-danger'}`}>
                    {device.status === 'online' ? 'Online' : device.status === 'unstable' ? 'Instavel' : 'Offline'}
                  </span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14, fontSize: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-secondary)' }}>
                  <MapPin size={13} /> {device.location || 'Sem local'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-secondary)' }}>
                  <HardDrive size={13} /> <span style={{ fontFamily: 'var(--font-mono)' }}>{device.ipAddress}:{device.port}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-secondary)' }}>
                  <Users size={13} /> {device._count?.studentLinks || 0} alunos vinculados
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-secondary)' }}>
                  <Clock size={13} /> {device.lastHeartbeat ? new Date(device.lastHeartbeat).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'Sem heartbeat'}
                </div>
              </div>

              <div style={{ marginBottom: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span className={`badge ${device.transport?.deliveryMode === 'edge' ? 'badge-warning' : device.transport?.deliveryMode === 'cloud' ? 'badge-success' : 'badge-danger'}`}>
                  {device.transport?.effectiveTransportLabel || (device.connectivityMode === 'edge' ? 'Modo Edge' : 'Modo Direto')}
                </span>
                <span className="badge" style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)' }}>
                  Politica: {device.transport?.connectionPolicyLabel || 'Automatico'}
                </span>
                {selectedEdge?.name && (
                  <span className="badge" style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)' }}>
                    Edge: {selectedEdge.name}
                  </span>
                )}
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)' }}>
                  Politica de conexao
                </label>
                <select
                  value={selectedPolicy}
                  disabled={savingRoute === device.id}
                  onChange={(event) => handlePolicyChange(event.target.value as NonNullable<DeviceData['connectionPolicy']>)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface-2)',
                    color: 'var(--color-text-primary)',
                    fontSize: 12,
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  {CONNECTION_POLICY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.45 }}>
                  {savingRoute === device.id ? 'Salvando rota...' : device.transport?.reason || device.transport?.connectionPolicyHint}
                </div>
              </div>

              {(selectedPolicy === 'cloud_autoreg_only' || device.transport?.effectiveTransport === 'cloud_autoreg') && (
                <div
                  style={{
                    marginBottom: 14,
                    padding: 12,
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-primary-200)',
                    background: 'linear-gradient(180deg, var(--color-primary-50), rgba(255,255,255,0.75))',
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-primary-700)', marginBottom: 8 }}>
                    Configuracao CGI sem edge
                  </div>
                  <div style={{ display: 'grid', gap: 6, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    <div>
                      DeviceID no equipamento:{' '}
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
                        {device.cloudConnection?.reverseIdentifier || device.reverseIdentifier || device.id}
                      </span>
                    </div>
                    <div>
                      Status do tunel:{' '}
                      <strong>
                        {device.cloudConnection?.connectionStatusLabel || (device.transport?.autoRegisterConnected ? 'Tunel CGI ativo' : 'Aguardando conexao CGI')}
                      </strong>
                    </div>
                    {device.cloudConnection?.autoRegisterConnectUrl && (
                      <div>
                        Endpoint de registro:{' '}
                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', wordBreak: 'break-all' }}>
                          {device.cloudConnection.autoRegisterConnectUrl}
                        </span>
                      </div>
                    )}
                    <div style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
                      Use este DeviceID na tela AutoRegister do Intelbras. Isso evita colisao entre escolas com IPs locais iguais e faz a nuvem identificar o dispositivo com seguranca.
                    </div>
                  </div>
                </div>
              )}

              {device.intelbrasEventPush && (
                <div
                  style={{
                    marginBottom: 14,
                    padding: 12,
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface-2)',
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                    Post Eventos 2.0
                  </div>
                  <div style={{ display: 'grid', gap: 6, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    <div>
                      Servidor: <strong>{device.intelbrasEventPush.address}:{device.intelbrasEventPush.port}</strong>
                    </div>
                    <div>
                      UploadPath:{' '}
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', wordBreak: 'break-all' }}>
                        {device.intelbrasEventPush.uploadPath}
                      </span>
                    </div>
                    <div>
                      HTTPS: <strong>{device.intelbrasEventPush.httpsEnabled ? 'habilitado' : 'desabilitado'}</strong>
                    </div>
                    <div>
                      Endpoint final:{' '}
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', wordBreak: 'break-all' }}>
                        {device.intelbrasEventPush.eventEndpointUrl}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
                      Configure no Intelbras `OfflineRetransmission=true`, `ReportPicture=true`, `Intelbras_UploadContentType.ContentType=jsonv2` e `DeviceMode=3`.
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 4 }}>
                        Passo 1 - Configurar servidor
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.45, color: 'var(--color-text-primary)', wordBreak: 'break-all' }}>
                        {device.intelbrasEventPush.step1Command}
                      </div>
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 4 }}>
                        Passo 2 - Forcar Content-Type jsonv2
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.45, color: 'var(--color-text-primary)', wordBreak: 'break-all' }}>
                        {device.intelbrasEventPush.stepContentTypeCommand}
                      </div>
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 4 }}>
                        Passo 3 - Ativar DeviceMode 3
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.45, color: 'var(--color-text-primary)', wordBreak: 'break-all' }}>
                        {device.intelbrasEventPush.step2Command}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)' }}>
                  Edge preferencial
                </label>
                <select
                  value={selectedEdgeId || ''}
                  disabled={savingRoute === device.id || (requiresEdge && availableEdges.length === 0)}
                  onChange={(event) => handleEdgeChange(event.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface-2)',
                    color: 'var(--color-text-primary)',
                    fontSize: 12,
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  {!requiresEdge && <option value="">Sem edge fixo</option>}
                  {requiresEdge && availableEdges.length === 0 && <option value="">Nenhum edge disponivel</option>}
                  {availableEdges.map((edge) => (
                    <option key={edge.id} value={edge.id}>
                      {edge.name} {edge.status === 'online' ? '(online)' : edge.status === 'degraded' ? '(degradado)' : '(offline)'}
                    </option>
                  ))}
                </select>
                <div style={{ marginTop: 8, fontSize: 11, color: requiresEdge && availableEdges.length === 0 ? 'var(--color-warning)' : 'var(--color-text-muted)', lineHeight: 1.45 }}>
                  {requiresEdge && availableEdges.length === 0
                    ? 'Esta unidade ainda nao tem edge provisionado. Cadastre ou faca claim de um edge antes de usar o modo edge.'
                    : selectedEdge?.lastSeenAt
                      ? `Ultimo heartbeat do edge selecionado: ${new Date(selectedEdge.lastSeenAt).toLocaleString('pt-BR')}`
                      : 'No modo automatico, definir um edge aqui faz a plataforma priorizar esse appliance sempre que ele estiver disponivel.'}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => triggerSync(device.id)}
                  disabled={syncing === device.id}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    fontSize: 12,
                    fontWeight: 600,
                    border: '1.5px solid var(--color-primary-400)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'transparent',
                    color: 'var(--color-primary-700)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <RefreshCw size={14} className={syncing === device.id ? 'spinning' : ''} />
                  {syncing === device.id ? 'Sincronizando...' : 'Sincronizar'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {loading && <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-muted)' }}>Carregando...</div>}
      {!loading && devices.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>Nenhum dispositivo cadastrado</div>}
    </div>
  );
}
