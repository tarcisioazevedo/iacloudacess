import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { HardDrive, Wifi, WifiOff, RefreshCw, MapPin, Clock, Users, Building2, GraduationCap, Filter, X, Trash2, Activity, Power, Link2, MoreVertical, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

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
  operationStatus?: {
    ok: boolean;
    isSchoolBlocked: boolean;
    isIntegratorBlocked: boolean;
  };
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

export default function Devices({ isHubMode = false, hubSchoolId }: { isHubMode?: boolean; hubSchoolId?: string | null }) {
  const { token, user, profile } = useAuth() as any;

  // Role-based permission: only integrator/superadmin can operate hardware directly
  const isDeviceAdmin = ['superadmin', 'integrator_admin', 'integrator_support'].includes(profile?.role);
  const canReboot = ['superadmin', 'integrator_admin'].includes(profile?.role);

  const [devices, setDevices] = useState<DeviceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [savingRoute, setSavingRoute] = useState<string | null>(null);
  const [pinging, setPinging] = useState<string | null>(null);
  const [rebooting, setRebooting] = useState<string | null>(null);
  const [autoLinking, setAutoLinking] = useState<string | null>(null);
  const [pingResults, setPingResults] = useState<Record<string, { status: string; latency?: string; deviceInfo?: any }>>({});
  const [syncStatuses, setSyncStatuses] = useState<Record<string, { pending: number; synced: number; failed: number }>>({});
  const [actionsOpen, setActionsOpen] = useState<string | null>(null);

  // Filters State
  const [filterSchoolId, setFilterSchoolId] = useState<string>('');
  const [filterIntegratorId, setFilterIntegratorId] = useState<string>('');
  const [schools, setSchools] = useState<any[]>([]);
  const [integrators, setIntegrators] = useState<any[]>([]);
  const [isFilterOpen, setIsFilterOpen] = useState(!isHubMode);

  // Sync hubSchoolId filter if inside Hub Mode
  useEffect(() => {
    if (isHubMode && hubSchoolId) {
      setFilterSchoolId(hubSchoolId);
    }
  }, [hubSchoolId, isHubMode]);

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

  const isSuperadmin = profile?.role === 'superadmin';

  const load = () => {
    if (!token) {
      return;
    }

    setLoading(true);
    let qs = new URLSearchParams();
    if (filterSchoolId) qs.append('schoolId', filterSchoolId);
    if (filterIntegratorId) qs.append('integratorId', filterIntegratorId);
    
    const queryString = qs.toString() ? `?${qs.toString()}` : '';

    fetch(`/api/devices${queryString}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => response.json())
      .then((data) => setDevices(data.devices || []))
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch('/api/schools', { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => response.json())
      .then((data) => {
         const fetchedSchools = data.schools || [];
         setSchools(fetchedSchools);

         // Fetch limits the units available to the currently selected school (or the first one)
         const targetSchoolIdToLoadUnits = filterSchoolId || (fetchedSchools.length > 0 ? fetchedSchools[0].id : null);

         if (targetSchoolIdToLoadUnits) {
           fetch(`/api/schools/${targetSchoolIdToLoadUnits}`, { headers: { Authorization: `Bearer ${token}` } })
             .then(r => r.json())
             .then(sd => {
               if (sd.school && sd.school.units) {
                 setAvailableUnits(sd.school.units.map((u: any) => ({
                   id: u.id,
                   name: u.name,
                   schoolName: sd.school.name
                 })));
                 setAddForm(prev => ({ ...prev, schoolUnitId: sd.school.units[0]?.id || '' }));
               } else {
                 setAvailableUnits([]);
                 setAddForm(prev => ({ ...prev, schoolUnitId: '' }));
               }
             });
         } else {
            setAvailableUnits([]);
         }
      })
      .catch(() => {});

    // For Superadmin, fetch integrators
    if (isSuperadmin) {
      fetch('/api/integrators', { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.json())
        .then(data => {
          setIntegrators(data.integrators || []);
        })
        .catch(() => {});
    }
  };

  useEffect(() => {
    load();
  }, [token, filterSchoolId, filterIntegratorId, isSuperadmin]);

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

  const handleRemoveDevice = async (deviceId: string, deviceName: string) => {
    if (!window.confirm(`Tem certeza que deseja remover o dispositivo "${deviceName}"? Essa ação não pode ser desfeita e removerá também todos os logs atrelados ao dispositivo.`)) {
      return;
    }
    try {
      const response = await fetch(`/api/devices/${deviceId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Erro ao remover dispositivo');
      load();
    } catch (err: any) {
      alert(err.message || 'Erro ao remover dispositivo');
    }
  };

  const handlePing = async (deviceId: string) => {
    setPinging(deviceId);
    try {
      const response = await fetch(`/api/device-sync/${deviceId}/ping`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setPingResults(prev => ({ ...prev, [deviceId]: data }));
      if (data.status === 'online') {
        load(); // refresh to update heartbeat
      }
    } catch (err: any) {
      setPingResults(prev => ({ ...prev, [deviceId]: { status: 'error' } }));
    }
    setPinging(null);
  };

  const handleReboot = async (deviceId: string, deviceName: string) => {
    if (!window.confirm(`Tem certeza que deseja reiniciar o dispositivo "${deviceName}"?\n\nO equipamento ficará offline por alguns segundos durante o processo.`)) return;
    setRebooting(deviceId);
    try {
      const response = await fetch(`/api/device-sync/${deviceId}/reboot`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      alert(data.message || 'Reboot enviado com sucesso');
      load();
    } catch (err: any) {
      alert(err.message || 'Erro ao reiniciar dispositivo');
    }
    setRebooting(null);
  };

  const handleAutoLink = async (deviceId: string) => {
    if (!window.confirm('Vincular automaticamente todos os usuários ativos a este dispositivo?\n\nIsso criará jobs de sincronização para cada usuário não vinculado.')) return;
    setAutoLinking(deviceId);
    try {
      const response = await fetch(`/api/device-sync/${deviceId}/auto-link`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      alert(data.message || 'Auto-link concluído');
      load();
    } catch (err: any) {
      alert(err.message || 'Erro ao vincular usuários');
    }
    setAutoLinking(null);
  };

  const handleWipe = async (deviceId: string, deviceName: string) => {
    const confirmInput = window.prompt(`ATENÇÃO: Operação Destrutiva!\n\nVocê está prestes a apagar TODOS os usuários, cartões e faces do dispositivo "${deviceName}".\nIsso limpará 100% da base física.\n\nPara confirmar, digite "CONFIRMAR":`);
    if (confirmInput !== 'CONFIRMAR') {
      if (confirmInput !== null) alert('Operação cancelada: confirmação incorreta.');
      return;
    }
    setSyncing(deviceId);
    try {
      const response = await fetch(`/api/device-sync/${deviceId}/wipe`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      alert(data.message || 'Comandos de limpeza (wipe) enviados com sucesso.');
    } catch (err: any) {
      alert(err.message || 'Erro ao executar wipe');
    }
    setSyncing(null);
  };

  const handleRestore = async (deviceId: string, deviceName: string) => {
    const confirmInput = window.prompt(`ATENÇÃO: Restauração Completa!\n\nVocê vai zerar a memória do dispositivo "${deviceName}" e re-enviar todos os alunos ativos da escola para ele.\n\nPara confirmar, digite "CONFIRMAR":`);
    if (confirmInput !== 'CONFIRMAR') {
      if (confirmInput !== null) alert('Operação cancelada: confirmação incorreta.');
      return;
    }
    setSyncing(deviceId);
    try {
      const response = await fetch(`/api/device-sync/${deviceId}/restore`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      alert(data.message || 'Restauração em massa iniciada com sucesso.');
      load();
    } catch (err: any) {
      alert(err.message || 'Erro ao executar restauração');
    }
    setSyncing(null);
  };

  const handleSyncTime = async (deviceId: string) => {
    try {
      const response = await fetch(`/api/device-sync/${deviceId}/sync-time`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      alert(data.message || 'Relógio sincronizado com sucesso.');
    } catch (err: any) {
      alert(err.message || 'Erro ao sincronizar relógio');
    }
  };

  const fetchDiagnostics = async (deviceId: string) => {
    try {
      const response = await fetch(`/api/device-sync/${deviceId}/diagnostics`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok && data.firmwareVersion) {
        setPingResults(prev => ({ 
          ...prev, 
          [deviceId]: { ...prev[deviceId], status: 'online', deviceInfo: data.firmwareVersion } 
        }));
      }
    } catch (err: any) {
      // ignore silently
    }
  };

  const fetchSyncStatus = async (deviceId: string) => {
    try {
      const response = await fetch(`/api/device-sync/${deviceId}/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.summary) {
        setSyncStatuses(prev => ({ ...prev, [deviceId]: data.summary }));
      }
    } catch {}
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

  const displayedSchools = filterIntegratorId 
    ? schools.filter(s => s.integratorId === filterIntegratorId) 
    : schools;

  const handleClearFilters = () => {
    setFilterIntegratorId('');
    setFilterSchoolId('');
  };

  const activeFiltersCount = (filterIntegratorId ? 1 : 0) + (filterSchoolId ? 1 : 0);

  return (
    <div className="animate-fade-in-up">
      <div style={{ marginBottom: isFilterOpen ? 16 : 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          {!isHubMode && (
            <>
              <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                <HardDrive size={22} /> Dispositivos
              </h1>
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                {devices.length} dispositivos cadastrados
              </p>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button 
            onClick={() => { if (!isHubMode) setIsFilterOpen(!isFilterOpen); }}
            style={{ 
              background: isFilterOpen && !isHubMode ? 'var(--color-primary-50)' : 'var(--color-surface)', 
              color: isFilterOpen && !isHubMode ? 'var(--color-primary-700)' : 'var(--color-text-primary)', 
              border: `1px solid ${isFilterOpen && !isHubMode ? 'var(--color-primary-200)' : 'var(--color-border)'}`, 
              padding: '9px 14px', 
              borderRadius: 'var(--radius-md)', 
              fontWeight: 600, 
              cursor: isHubMode ? 'default' : 'pointer',
              opacity: isHubMode ? 0.5 : 1,
              display: 'flex', 
              alignItems: 'center', 
              gap: 8,
              transition: 'all 0.2s'
            }}
          >
            <Filter size={16} /> 
            Filtros
            {(activeFiltersCount > 0 && !isHubMode) && (
              <span style={{ background: 'var(--color-primary-600)', color: 'white', fontSize: 11, padding: '2px 6px', borderRadius: 10 }}>
                {activeFiltersCount}
              </span>
            )}
          </button>
          {isDeviceAdmin && (
            <button 
              onClick={() => setShowAddModal(true)}
              style={{ background: 'var(--color-primary-600)', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: 'var(--radius-md)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <HardDrive size={16} /> Novo Dispositivo
            </button>
          )}
        </div>
      </div>

      {(isFilterOpen && !isHubMode) && (
        <div 
          className="animate-fade-in-up" 
          style={{ 
            marginBottom: 24, 
            padding: 16, 
            background: 'rgba(255, 255, 255, 0.4)', 
            backdropFilter: 'blur(12px)',
            border: '1px solid var(--color-border)', 
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            alignItems: 'flex-end',
            gap: 16,
            flexWrap: 'wrap'
          }}
        >
          {isSuperadmin && (
            <div style={{ flex: '1 1 200px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                <Building2 size={13} /> Integrador
              </label>
              <select
                value={filterIntegratorId}
                onChange={(e) => {
                  setFilterIntegratorId(e.target.value);
                  setFilterSchoolId(''); // Reset school when integrator changes
                }}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  fontSize: 13,
                  outline: 'none',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  transition: 'border-color 0.2s',
                  appearance: 'none',
                  backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23131313%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 12px top 50%',
                  backgroundSize: '10px auto'
                }}
              >
                <option value="">Todos os integradores</option>
                {integrators.map(intg => (
                  <option key={intg.id} value={intg.id}>{intg.name}</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ flex: '1 1 200px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
              <GraduationCap size={13} /> Escola (Filial)
            </label>
            <select
              value={filterSchoolId}
              onChange={(e) => setFilterSchoolId(e.target.value)}
              disabled={isSuperadmin && !filterIntegratorId && schools.length > 50} // Disable if too many and no drill-down
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                fontSize: 13,
                outline: 'none',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                transition: 'border-color 0.2s',
                appearance: 'none',
                backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23131313%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 12px top 50%',
                backgroundSize: '10px auto',
                opacity: (isSuperadmin && !filterIntegratorId && schools.length > 50) ? 0.5 : 1
              }}
            >
              <option value="">Todas as escolas</option>
              {displayedSchools.map(school => (
                <option key={school.id} value={school.id}>{school.name}</option>
              ))}
            </select>
          </div>

          {(filterIntegratorId || filterSchoolId) && (
            <button
              onClick={handleClearFilters}
              style={{
                background: 'transparent',
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-border)',
                padding: '9px 12px',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                height: 'fit-content'
              }}
            >
              <X size={14} /> Limpar
            </button>
          )}
        </div>
      )}

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
                border: device.operationStatus?.ok === false ? '2px solid var(--color-danger)' : '1px solid var(--color-border)',
                padding: 22,
                position: 'relative',
                overflow: 'hidden',
                opacity: device.operationStatus?.ok === false ? 0.75 : 1,
              }}
            >
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: statusColor(device.status) }} />

              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 3 }}>{device.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    {device.model || 'Sem modelo'}
                    {device.operationStatus?.ok === false && (
                      <span className="badge badge-danger" style={{ marginLeft: 6, fontWeight: 'bold' }}>
                        {device.operationStatus.isSchoolBlocked ? 'Escola Inadimplente' : 'Licença do Integrador Expirada'}
                      </span>
                    )}
                  </div>
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
                  <Users size={13} /> {device._count?.studentLinks || 0} usuários vinculados
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

              {/* ─── Diagnostics & Operations ─── */}
              <div style={{ marginBottom: 14, padding: '10px 12px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)' }}>
                    Diagnósticos & Operações
                  </label>
                  <button onClick={() => fetchDiagnostics(device.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary-600)', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <RefreshCw size={11} /> Atualizar Info
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-primary)' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Firmware:</span> {pingResults[device.id]?.deviceInfo || 'Desconhecido'}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <button onClick={() => handleSyncTime(device.id)} style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', color: 'var(--color-text-primary)', fontSize: 10, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={10} /> Sincronizar Relógio
                    </button>
                  </div>
                </div>

                {isDeviceAdmin && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    <button
                      onClick={() => handleRestore(device.id, device.name)}
                      disabled={syncing === device.id}
                      style={{ flex: 1, padding: '6px', background: 'var(--color-primary-50)', color: 'var(--color-primary-700)', border: '1px solid var(--color-primary-200)', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                    >
                      Restore em Massa
                    </button>
                    <button
                      onClick={() => handleWipe(device.id, device.name)}
                      disabled={syncing === device.id}
                      style={{ flex: 1, padding: '6px', background: 'rgba(239,68,68,0.05)', color: 'var(--color-danger)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                    >
                      Wipe (Zerar)
                    </button>
                  </div>
                )}
              </div>

              {/* ─── Sync Status Mini-Bar ─── */}
              {syncStatuses[device.id] && (
                <div style={{ marginBottom: 10, display: 'flex', gap: 8, fontSize: 11, color: 'var(--color-text-muted)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Loader2 size={11} /> {syncStatuses[device.id].pending} pendentes
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--color-success)' }}>
                    <CheckCircle2 size={11} /> {syncStatuses[device.id].synced} sincronizados
                  </span>
                  {syncStatuses[device.id].failed > 0 && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--color-danger)' }}>
                      <XCircle size={11} /> {syncStatuses[device.id].failed} falhas
                    </span>
                  )}
                </div>
              )}

              {/* ─── Ping Result Feedback ─── */}
              {pingResults[device.id] && (
                <div style={{
                  marginBottom: 10, padding: '8px 12px', borderRadius: 'var(--radius-md)', fontSize: 12,
                  background: pingResults[device.id].status === 'online'
                    ? 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(16,185,129,0.02))'
                    : 'linear-gradient(135deg, rgba(239,68,68,0.08), rgba(239,68,68,0.02))',
                  border: `1px solid ${pingResults[device.id].status === 'online' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  {pingResults[device.id].status === 'online' ? (
                    <><CheckCircle2 size={14} color="var(--color-success)" /> <span>Conectado — latência {pingResults[device.id].latency || '?'}</span></>
                  ) : (
                    <><XCircle size={14} color="var(--color-danger)" /> <span>Falha na conexão</span></>
                  )}
                </div>
              )}

              {/* ─── Premium Action Toolbar ─── */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {isDeviceAdmin && (
                <button
                  onClick={() => handlePing(device.id)}
                  disabled={pinging === device.id}
                  title="Testar conectividade"
                  style={{
                    padding: '8px 12px', fontSize: 11, fontWeight: 600,
                    border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-surface)', color: 'var(--color-text-secondary)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-primary-400)'; e.currentTarget.style.color = 'var(--color-primary-700)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
                >
                  {pinging === device.id ? <Loader2 size={13} className="spinning" /> : <Activity size={13} />}
                  Ping
                </button>
                )}

                {/* Sync All */}
                <button
                  onClick={() => { triggerSync(device.id); fetchSyncStatus(device.id); }}
                  disabled={syncing === device.id || device.operationStatus?.ok === false}
                  title="Sincronizar todos os usuários com o dispositivo"
                  style={{
                    flex: 1, minWidth: 110, padding: '8px 12px', fontSize: 11, fontWeight: 600,
                    border: '1.5px solid var(--color-primary-400)', borderRadius: 'var(--radius-sm)',
                    background: 'transparent', color: 'var(--color-primary-700)',
                    cursor: device.operationStatus?.ok === false ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    opacity: device.operationStatus?.ok === false ? 0.5 : 1,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <RefreshCw size={13} className={syncing === device.id ? 'spinning' : ''} />
                  {syncing === device.id ? 'Sincronizando...' : 'Sincronizar'}
                </button>

                {/* Auto-Link Users */}
                <button
                  onClick={() => handleAutoLink(device.id)}
                  disabled={autoLinking === device.id || device.operationStatus?.ok === false}
                  title="Vincular automaticamente todos os usuários ativos"
                  style={{
                    padding: '8px 12px', fontSize: 11, fontWeight: 600,
                    border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-surface)', color: 'var(--color-text-secondary)',
                    cursor: device.operationStatus?.ok === false ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: 5,
                    opacity: device.operationStatus?.ok === false ? 0.5 : 1,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => { if (device.operationStatus?.ok !== false) { e.currentTarget.style.borderColor = 'var(--color-success)'; e.currentTarget.style.color = 'var(--color-success)'; } }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
                >
                  {autoLinking === device.id ? <Loader2 size={13} className="spinning" /> : <Link2 size={13} />}
                  Auto-Link
                </button>

                {/* Reboot — danger action, role-gated */}
                {canReboot && (
                  <button
                    onClick={() => handleReboot(device.id, device.name)}
                    disabled={rebooting === device.id}
                    title="Reiniciar dispositivo remotamente"
                    style={{
                      padding: '8px 12px', fontSize: 11, fontWeight: 600,
                      border: '1.5px solid var(--color-warning)', borderRadius: 'var(--radius-sm)',
                      background: 'transparent', color: 'var(--color-warning)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.08)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    {rebooting === device.id ? <Loader2 size={13} className="spinning" /> : <Power size={13} />}
                    Reboot
                  </button>
                )}

                {/* Delete — only device admins */}
                {isDeviceAdmin && (
                <button
                  onClick={() => handleRemoveDevice(device.id, device.name)}
                  title="Remover dispositivo"
                  style={{
                    padding: '8px 10px',
                    border: '1.5px solid var(--color-danger)', borderRadius: 'var(--radius-sm)',
                    background: 'transparent', color: 'var(--color-danger)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <Trash2 size={13} />
                </button>
                )}
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
