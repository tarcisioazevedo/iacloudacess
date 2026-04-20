import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ui/Toast';
import { SkeletonTable } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock3,
  Copy,
  FileJson,
  HardDrive,
  KeyRound,
  ListChecks,
  MapPin,
  Network,
  RefreshCw,
  School,
  Shield,
  Wifi,
  WifiOff,
} from 'lucide-react';

interface UnitItem {
  id: string;
  name: string;
  address?: string | null;
  school: {
    id: string;
    name: string;
    slug: string;
    status: string;
    integratorId: string;
  };
  edgeCount: number;
  onlineEdgeCount: number;
  deviceCount: number;
  requiresEdgeProvisioning: boolean;
  createdAt: string;
}

interface ConnectorItem {
  id: string;
  name: string;
  hostname?: string | null;
  version?: string | null;
  status: string;
  cloudMode: string;
  lastSeenAt?: string | null;
  lastIp?: string | null;
  localSubnets: string[];
  createdAt: string;
  deviceCount: number;
  onlineDeviceCount: number;
  schoolUnit: {
    id: string;
    name: string;
    address?: string | null;
    school: {
      id: string;
      name: string;
      integratorId: string;
    };
  };
  management?: {
    mode: string;
    wireguard?: {
      status: string;
      endpoint: string | null;
      tunnelAddress: string | null;
      tunnelCidr: string;
      allowedIps: string[];
      dns: string[];
      profileName: string | null;
      generatedAt: string | null;
      lastRotationAt: string | null;
      reasons: string[];
      notes: string[];
    } | null;
  };
}

interface EnrollmentPayload {
  enrollmentToken: string;
  enrollment: {
    id: string;
    expiresAt: string;
    schoolUnit: { id: string; name: string };
    school: { id: string; name: string; integratorId: string };
  };
  bootstrap: {
    enrollUrl: string;
    heartbeatUrl: string;
    syncJobsUrl: string;
    eventsUrl: string;
    provisioningPackUrl?: string;
  };
  management?: {
    mode: string;
    wireguard?: {
      infrastructure: {
        configured: boolean;
        endpoint: string | null;
        tunnelCidr: string;
        allowedIps: string[];
        dns: string[];
        persistentKeepalive: number;
        reasons: string[];
        notes: string[];
      };
      profile?: {
        profileName: string;
        generatedAt: string;
        tunnelAddress: string;
        endpoint: string;
        serverPublicKey: string;
        clientPublicKey: string;
        clientPrivateKey: string;
        presharedKey: string;
        allowedIps: string[];
        dns: string[];
        persistentKeepalive: number;
        configText: string;
      } | null;
      metadata?: {
        status: string;
        tunnelAddress: string | null;
        profileName: string | null;
        endpoint?: string | null;
        tunnelCidr?: string;
        allowedIps?: string[];
        dns?: string[];
        persistentKeepalive?: number;
        generatedAt?: string;
        lastRotationAt?: string | null;
        reasons: string[];
        notes?: string[];
      };
    };
  };
  provisioningPack?: ProvisioningPack | null;
}

interface ProvisioningPack {
  generatedAt: string;
  schoolUnit: {
    id: string;
    name: string;
    address?: string | null;
  };
  school: {
    id: string;
    name: string;
    slug: string;
    status: string;
  };
  integrator: {
    id: string;
    name: string;
    slug: string;
    status: string;
  };
  licensing: {
    plan?: string | null;
    status: string;
    validTo?: string | null;
    edgeAllowed: boolean;
    reasons: string[];
  };
  readiness: {
    deviceCount: number;
    edgeCount: number;
    onlineEdgeCount: number;
    autoRegisterReadyCount: number;
    autoRegisterNeedsFirmwareReviewCount: number;
    suggestedCloudMode: 'outbound_only' | 'wireguard_management';
    stage: 'planning' | 'ready_for_field' | 'edge_present';
  };
  networkProfile: {
    localUiPort: number;
    intakePort: number;
    requiredOutbound: string[];
    optionalManagement: string[];
  };
  management: {
    selectedCloudMode: 'outbound_only' | 'wireguard_management';
    wireguard: {
      configured: boolean;
      endpoint: string | null;
      tunnelCidr: string;
      allowedIps: string[];
      dns: string[];
      persistentKeepalive: number;
      reasons: string[];
      notes: string[];
    };
  };
  devices: Array<{
    id: string;
    name: string;
    model?: string | null;
    firmwareVer?: string | null;
    ipAddress: string;
    port: number;
    location?: string | null;
    connectivityMode: string;
    autoRegister: {
      supportedModel: boolean;
      minimumFirmwareBuild: string;
      detectedFirmwareBuild: string | null;
      firmwareSupported: boolean | null;
      ready: boolean;
      notes: string[];
    };
  }>;
  connectors: Array<{
    id: string;
    name: string;
    status: string;
    cloudMode: string;
    lastSeenAt?: string | null;
    hostname?: string | null;
  }>;
  rolloutSteps: string[];
}

interface EnrollmentTrackerItem {
  id: string;
  label?: string | null;
  cloudMode: string;
  status: 'pending_claim' | 'expired' | 'claimed_waiting_heartbeat' | 'online' | 'degraded' | 'offline';
  statusLabel: string;
  message: string;
  ready: boolean;
  expiresAt: string;
  usedAt?: string | null;
  schoolUnit: {
    id: string;
    name: string;
  };
  school: {
    id: string;
    name: string;
    integratorId: string;
  };
  connector?: {
    id: string;
    name: string;
    lastSeenAt?: string | null;
    deviceCount: number;
    onlineDeviceCount: number;
  } | null;
}

function getDemoUnits(): UnitItem[] {
  return [
    {
      id: 'unit-1',
      name: 'Sede Principal',
      address: 'Rua da Educação, 100 - Centro',
      school: { id: 'sch-1', name: 'Colégio Horizonte', slug: 'horizonte', status: 'active', integratorId: 'int-1' },
      edgeCount: 1,
      onlineEdgeCount: 1,
      deviceCount: 4,
      requiresEdgeProvisioning: false,
      createdAt: '2026-03-02T10:00:00.000Z',
    },
    {
      id: 'unit-2',
      name: 'Campus Norte',
      address: 'Av. dos Estudantes, 220',
      school: { id: 'sch-1', name: 'Colégio Horizonte', slug: 'horizonte', status: 'active', integratorId: 'int-1' },
      edgeCount: 0,
      onlineEdgeCount: 0,
      deviceCount: 3,
      requiresEdgeProvisioning: true,
      createdAt: '2026-03-18T10:00:00.000Z',
    },
    {
      id: 'unit-3',
      name: 'Unidade Centro',
      address: 'Rua das Acácias, 55',
      school: { id: 'sch-2', name: 'Escola Lume', slug: 'lume', status: 'active', integratorId: 'int-1' },
      edgeCount: 1,
      onlineEdgeCount: 0,
      deviceCount: 2,
      requiresEdgeProvisioning: false,
      createdAt: '2026-04-02T10:00:00.000Z',
    },
  ];
}

function getDemoConnectors(): ConnectorItem[] {
  return [
    {
      id: 'edge-1',
      name: 'edge-horizonte-sede',
      hostname: 'edge-horizonte-01',
      version: '1.0.3',
      status: 'online',
      cloudMode: 'outbound_only',
      lastSeenAt: new Date().toISOString(),
      lastIp: '179.221.10.8',
      localSubnets: ['192.168.0.0/24', '192.168.10.0/24'],
      createdAt: '2026-04-10T08:00:00.000Z',
      deviceCount: 4,
      onlineDeviceCount: 4,
      schoolUnit: {
        id: 'unit-1',
        name: 'Sede Principal',
        address: 'Rua da Educação, 100 - Centro',
        school: { id: 'sch-1', name: 'Colégio Horizonte', integratorId: 'int-1' },
      },
    },
    {
      id: 'edge-2',
      name: 'edge-lume-centro',
      hostname: 'edge-lume-01',
      version: '1.0.1',
      status: 'degraded',
      cloudMode: 'wireguard_management',
      lastSeenAt: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
      lastIp: '177.41.22.19',
      localSubnets: ['192.168.0.0/24'],
      createdAt: '2026-04-11T10:00:00.000Z',
      deviceCount: 2,
      onlineDeviceCount: 1,
      schoolUnit: {
        id: 'unit-3',
        name: 'Unidade Centro',
        address: 'Rua das Acácias, 55',
        school: { id: 'sch-2', name: 'Escola Lume', integratorId: 'int-1' },
      },
      management: {
        mode: 'wireguard_management',
        wireguard: {
          status: 'ready',
          endpoint: 'vpn.exemplo.com:51820',
          tunnelAddress: '100.96.0.12/32',
          tunnelCidr: '100.96.0.0/16',
          allowedIps: ['100.96.0.0/16'],
          dns: ['1.1.1.1'],
          profileName: 'escola-lume-edge-lume-01-wg',
          generatedAt: new Date().toISOString(),
          lastRotationAt: new Date().toISOString(),
          reasons: [],
          notes: ['VPN de gestao remota do edge local.'],
        },
      },
    },
  ];
}

function getDemoProvisioningPack(unit?: UnitItem): ProvisioningPack | null {
  if (!unit) return null;

  const planningDevices = unit.id === 'unit-2'
    ? [
      {
        id: 'dev-1',
        name: 'Facial Portao Principal',
        model: 'SS 5532 MF W',
        firmwareVer: '20251215',
        ipAddress: '192.168.0.201',
        port: 80,
        location: 'Portao Principal',
        connectivityMode: 'edge',
        autoRegister: {
          supportedModel: true,
          minimumFirmwareBuild: '20251201',
          detectedFirmwareBuild: '20251215',
          firmwareSupported: true,
          ready: true,
          notes: ['Elegivel para fluxo AutoRegister CGI do edge local.'],
        },
      },
      {
        id: 'dev-2',
        name: 'Facial Recepcao',
        model: 'SS 3532 MF',
        firmwareVer: '20251028',
        ipAddress: '192.168.0.202',
        port: 80,
        location: 'Recepcao',
        connectivityMode: 'edge',
        autoRegister: {
          supportedModel: true,
          minimumFirmwareBuild: '20251201',
          detectedFirmwareBuild: '20251028',
          firmwareSupported: false,
          ready: false,
          notes: ['Firmware abaixo da build minima 20251201.'],
        },
      },
      {
        id: 'dev-3',
        name: 'Leitor Biblioteca',
        model: 'SS 3531 MF Lite',
        firmwareVer: null,
        ipAddress: '192.168.0.203',
        port: 80,
        location: 'Biblioteca',
        connectivityMode: 'edge',
        autoRegister: {
          supportedModel: true,
          minimumFirmwareBuild: '20251201',
          detectedFirmwareBuild: null,
          firmwareSupported: null,
          ready: true,
          notes: ['Firmware nao informado; validar build minima antes da ativacao.'],
        },
      },
    ]
    : [];

  return {
    generatedAt: new Date().toISOString(),
    schoolUnit: {
      id: unit.id,
      name: unit.name,
      address: unit.address,
    },
    school: {
      id: unit.school.id,
      name: unit.school.name,
      slug: unit.school.slug,
      status: unit.school.status,
    },
    integrator: {
      id: unit.school.integratorId,
      name: 'TechSeg Integracoes',
      slug: 'techseg',
      status: 'active',
    },
    licensing: {
      plan: 'professional',
      status: 'active',
      validTo: new Date(Date.now() + 120 * 86400000).toISOString(),
      edgeAllowed: true,
      reasons: [],
    },
    readiness: {
      deviceCount: planningDevices.length || unit.deviceCount,
      edgeCount: unit.edgeCount,
      onlineEdgeCount: unit.onlineEdgeCount,
      autoRegisterReadyCount: planningDevices.filter((device) => device.autoRegister.ready).length,
      autoRegisterNeedsFirmwareReviewCount: planningDevices.filter((device) => device.autoRegister.firmwareSupported !== true).length,
      suggestedCloudMode: planningDevices.length >= 3 ? 'wireguard_management' : 'outbound_only',
      stage: unit.edgeCount > 0 ? 'edge_present' : 'ready_for_field',
    },
    networkProfile: {
      localUiPort: 4500,
      intakePort: 4500,
      requiredOutbound: ['TCP 443 para a plataforma em nuvem'],
      optionalManagement: ['WireGuard opcional para suporte remoto controlado'],
    },
    management: {
      selectedCloudMode: planningDevices.length >= 3 ? 'wireguard_management' : 'outbound_only',
      wireguard: {
        configured: planningDevices.length >= 3,
        endpoint: planningDevices.length >= 3 ? 'vpn.exemplo.com:51820' : null,
        tunnelCidr: '100.96.0.0/16',
        allowedIps: ['100.96.0.0/16'],
        dns: ['1.1.1.1'],
        persistentKeepalive: 25,
        reasons: planningDevices.length >= 3 ? [] : ['Infra VPN nao exigida para este site no momento'],
        notes: ['A VPN fica entre nuvem e edge, nao entre nuvem e toda a LAN escolar.'],
      },
    },
    devices: planningDevices,
    connectors: [],
    rolloutSteps: [
      'Validar licenca e janela de instalacao.',
      'Confirmar saida HTTPS e a rede local dos devices.',
      'Atualizar firmware dos devices que ainda nao atingem o minimo.',
      'Gerar token de enrollment perto da ida a campo.',
      'Executar claim do edge e validar heartbeat/eventos.',
    ],
  };
}

function getStatusBadge(status: string) {
  if (status === 'online') {
    return <span className="badge badge-success"><CheckCircle2 size={10} /> Online</span>;
  }
  if (status === 'degraded' || status === 'unstable') {
    return <span className="badge badge-warning"><AlertTriangle size={10} /> Degradado</span>;
  }
  if (status === 'provisioning') {
    return <span className="badge badge-info"><KeyRound size={10} /> Provisionando</span>;
  }
  if (status === 'suspended') {
    return <span className="badge badge-danger"><WifiOff size={10} /> Suspenso</span>;
  }
  return <span className="badge badge-danger"><WifiOff size={10} /> Offline</span>;
}

function formatRelativeTime(value?: string | null) {
  if (!value) return 'Sem heartbeat';
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMin = Math.max(0, Math.round(diffMs / 60000));
  if (diffMin < 1) return 'Agora mesmo';
  if (diffMin < 60) return `${diffMin} min atrás`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `${diffHours} h atrás`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} d atrás`;
}

function buildDemoWireGuardManagement(includeProfile = false): NonNullable<EnrollmentPayload['management']> {
  const generatedAt = new Date().toISOString();
  const infrastructure = {
    configured: true,
    endpoint: 'vpn.exemplo.com:51820',
    tunnelCidr: '100.96.0.0/16',
    allowedIps: ['100.96.0.0/16'],
    dns: ['1.1.1.1'],
    persistentKeepalive: 25,
    reasons: [] as string[],
    notes: [
      'A VPN termina no edge local, nao na LAN inteira da escola.',
      'Use a VPN apenas para gestao remota controlada e suporte.',
    ],
  };

  return {
    mode: 'wireguard_management',
    wireguard: {
      infrastructure,
      profile: includeProfile ? {
        profileName: 'demo-edge-wireguard',
        generatedAt,
        tunnelAddress: '100.96.0.50/32',
        endpoint: infrastructure.endpoint,
        serverPublicKey: 'demo_server_public_key_base64=',
        clientPublicKey: 'demo_client_public_key_base64=',
        clientPrivateKey: 'demo_client_private_key_base64=',
        presharedKey: 'demo_preshared_key_base64=',
        allowedIps: infrastructure.allowedIps,
        dns: infrastructure.dns,
        persistentKeepalive: infrastructure.persistentKeepalive,
        configText: '[Interface]\nPrivateKey = demo_client_private_key_base64=\nAddress = 100.96.0.50/32\nDNS = 1.1.1.1\n\n[Peer]\nPublicKey = demo_server_public_key_base64=\nPresharedKey = demo_preshared_key_base64=\nAllowedIPs = 100.96.0.0/16\nEndpoint = vpn.exemplo.com:51820\nPersistentKeepalive = 25',
      } : null,
      metadata: {
        status: includeProfile ? 'ready' : 'pending_infra',
        tunnelAddress: includeProfile ? '100.96.0.50/32' : null,
        profileName: 'demo-edge-wireguard',
        endpoint: infrastructure.endpoint,
        tunnelCidr: infrastructure.tunnelCidr,
        allowedIps: infrastructure.allowedIps,
        dns: infrastructure.dns,
        persistentKeepalive: infrastructure.persistentKeepalive,
        generatedAt,
        lastRotationAt: includeProfile ? generatedAt : null,
        reasons: includeProfile ? [] : ['O perfil final e gerado depois do claim do edge ou por rotacao manual.'],
        notes: infrastructure.notes,
      },
    },
  };
}

export default function Edges() {
  const { token, isDemo } = useAuth();
  const toast = useToast();
  const [units, setUnits] = useState<UnitItem[]>([]);
  const [connectors, setConnectors] = useState<ConnectorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [provisioning, setProvisioning] = useState(false);
  const [rotatingConnectorId, setRotatingConnectorId] = useState<string | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [connectorName, setConnectorName] = useState('');
  const [expiresInHours, setExpiresInHours] = useState('24');
  const [cloudMode, setCloudMode] = useState('outbound_only');
  const [enrollment, setEnrollment] = useState<EnrollmentPayload | null>(null);
  const [recentEnrollments, setRecentEnrollments] = useState<EnrollmentTrackerItem[]>([]);
  const [managementPreview, setManagementPreview] = useState<EnrollmentPayload['management'] | null>(null);
  const [provisioningPack, setProvisioningPack] = useState<ProvisioningPack | null>(null);

  const loadData = async () => {
    setLoading(true);

    if (isDemo) {
      const demoUnits = getDemoUnits();
      setUnits(demoUnits);
      setConnectors(getDemoConnectors());
      setRecentEnrollments([]);
      setSelectedUnitId(demoUnits.find((unit) => unit.requiresEdgeProvisioning)?.id || demoUnits[0]?.id || '');
      setLoading(false);
      return;
    }

    try {
      const [unitsRes, connectorsRes, enrollmentsRes] = await Promise.all([
        fetch('/api/school-units', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/edge/connectors', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/edge/enrollment-tokens?limit=12', { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const unitsData = unitsRes.ok ? await unitsRes.json() : { units: [] };
      const connectorsData = connectorsRes.ok ? await connectorsRes.json() : { connectors: [] };
      const enrollmentsData = enrollmentsRes.ok ? await enrollmentsRes.json() : { enrollmentTokens: [] };

      const nextUnits = unitsData.units || [];
      setUnits(nextUnits);
      setConnectors(connectorsData.connectors || []);
      setRecentEnrollments(enrollmentsData.enrollmentTokens || []);
      setSelectedUnitId((current) => current || nextUnits.find((unit: UnitItem) => unit.requiresEdgeProvisioning)?.id || nextUnits[0]?.id || '');
    } catch {
      toast.error('Não foi possível carregar o inventário de edges');
    } finally {
      setLoading(false);
    }
  };

  const loadProvisioningPack = async (schoolUnitId: string) => {
    if (!schoolUnitId) {
      setProvisioningPack(null);
      return;
    }

    if (isDemo) {
      setProvisioningPack(getDemoProvisioningPack(units.find((unit) => unit.id === schoolUnitId)));
      return;
    }

    try {
      const response = await fetch(`/api/edge/provisioning-pack/${schoolUnitId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Falha ao carregar pacote de provisionamento');
      }

      setProvisioningPack(data.provisioningPack || null);
    } catch (err: any) {
      setProvisioningPack(null);
      toast.error(err.message || 'Nao foi possivel carregar o pacote de provisionamento');
    }
  };

  useEffect(() => {
    loadData();
  }, [token, isDemo]);

  useEffect(() => {
    if (selectedUnitId) {
      loadProvisioningPack(selectedUnitId);
    }
  }, [selectedUnitId, token, isDemo, units]);

  const handleProvision = async () => {
    if (!selectedUnitId) {
      toast.warning('Selecione uma unidade escolar para provisionar o edge');
      return;
    }

    setProvisioning(true);
    try {
      if (isDemo) {
        const demoProvisioningPack = getDemoProvisioningPack(units.find((unit) => unit.id === selectedUnitId));
        setEnrollment({
          enrollmentToken: 'edge_enroll_demo_token_123',
          enrollment: {
            id: 'demo-enrollment',
            expiresAt: new Date(Date.now() + Number(expiresInHours) * 3600000).toISOString(),
            schoolUnit: { id: selectedUnitId, name: units.find((unit) => unit.id === selectedUnitId)?.name || 'Unidade' },
            school: {
              id: units.find((unit) => unit.id === selectedUnitId)?.school.id || 'sch-1',
              name: units.find((unit) => unit.id === selectedUnitId)?.school.name || 'Escola',
              integratorId: units.find((unit) => unit.id === selectedUnitId)?.school.integratorId || 'int-1',
            },
          },
          bootstrap: {
            enrollUrl: '/api/edge/enroll',
            heartbeatUrl: '/api/edge/heartbeat',
            syncJobsUrl: '/api/edge/sync-jobs',
            eventsUrl: '/api/edge/events',
            provisioningPackUrl: `/api/edge/provisioning-pack/${selectedUnitId}`,
          },
          provisioningPack: demoProvisioningPack,
        });
        setProvisioningPack(demoProvisioningPack);
        setManagementPreview(
          cloudMode === 'wireguard_management'
            ? buildDemoWireGuardManagement(false)
            : { mode: cloudMode },
        );
        toast.success('Token de provisionamento gerado em modo demo');
        return;
      }

      const response = await fetch('/api/edge/enrollment-tokens', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          schoolUnitId: selectedUnitId,
          label: connectorName || undefined,
          expiresInHours: Number(expiresInHours),
          cloudMode,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Falha ao gerar token de provisionamento');
      }

      setEnrollment(data);
      setManagementPreview(data.management || null);
      setProvisioningPack(data.provisioningPack || null);
      await loadData();
      toast.success('Token de provisionamento gerado com sucesso');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao gerar token de provisionamento');
    } finally {
      setProvisioning(false);
    }
  };

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado`);
    } catch {
      toast.error(`Não foi possível copiar ${label.toLowerCase()}`);
    }
  };

  const handleRotateWireGuardProfile = async (connectorId: string) => {
    setRotatingConnectorId(connectorId);
    try {
      if (isDemo) {
        setManagementPreview(buildDemoWireGuardManagement(true));
        toast.success('Perfil WireGuard rotacionado em modo demo');
        return;
      }

      const response = await fetch(`/api/edge/connectors/${connectorId}/wireguard-profile`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Falha ao rotacionar perfil WireGuard');
      }

      setManagementPreview(data.management || null);

      await loadData();
      toast.success('Novo perfil WireGuard gerado para o edge');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao rotacionar perfil WireGuard');
    } finally {
      setRotatingConnectorId(null);
    }
  };

  const pendingUnits = units.filter((unit) => unit.requiresEdgeProvisioning);
  const onlineConnectors = connectors.filter((connector) => connector.status === 'online').length;
  const degradedConnectors = connectors.filter((connector) => connector.status === 'degraded' || connector.status === 'offline').length;
  const protectedDevices = connectors.reduce((sum, connector) => sum + connector.deviceCount, 0);
  const recentProvisioningWindow = recentEnrollments.slice(0, 8);
  const selectedUnit = units.find((unit) => unit.id === selectedUnitId) || null;
  const provisioningPackExport = provisioningPack ? JSON.stringify(provisioningPack, null, 2) : '';
  const activeManagement = managementPreview || enrollment?.management || null;
  const activeWireGuard = activeManagement?.mode === 'wireguard_management' ? activeManagement.wireguard || null : null;
  const wireGuardInfrastructure = activeWireGuard?.infrastructure || null;
  const wireGuardProfile = activeWireGuard?.profile || null;
  const wireGuardMetadata = activeWireGuard?.metadata || null;
  const wireGuardReasons = Array.from(new Set([
    ...(wireGuardInfrastructure?.reasons || []),
    ...(wireGuardMetadata?.reasons || []),
  ]));
  const wireGuardNotes = Array.from(new Set([
    ...(wireGuardInfrastructure?.notes || []),
    ...(wireGuardMetadata?.notes || []),
  ]));
  const wireGuardProfileText = activeManagement?.wireguard?.profile?.configText || '';

  return (
    <div className="animate-fade-in-up">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Shield size={22} />
            Edges Locais
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 4 }}>
            Provisionamento e saúde dos gateways que conectam cada site escolar à nuvem.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={loadData} disabled={loading} style={{ minWidth: 140 }}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      <div className="cockpit-grid cockpit-grid-4" style={{ marginBottom: 20 }}>
        <div className="kpi-card">
          <div className="kpi-card-label">Edges ativos</div>
          <div className="kpi-card-value">{onlineConnectors}</div>
          <div className="kpi-card-trend up"><Wifi size={13} /> conectados à nuvem</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-label">Sites pendentes</div>
          <div className="kpi-card-value">{pendingUnits.length}</div>
          <div className={`kpi-card-trend ${pendingUnits.length > 0 ? 'down' : 'up'}`}>
            <School size={13} />
            {pendingUnits.length > 0 ? 'unidades ainda sem edge' : 'todas as unidades cobertas'}
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-label">Devices cobertos</div>
          <div className="kpi-card-value">{protectedDevices}</div>
          <div className="kpi-card-trend neutral"><HardDrive size={13} /> dispositivos atrás dos edges</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-label">Atenção operacional</div>
          <div className="kpi-card-value">{degradedConnectors}</div>
          <div className={`kpi-card-trend ${degradedConnectors > 0 ? 'down' : 'up'}`}>
            <AlertTriangle size={13} />
            {degradedConnectors > 0 ? 'edges com degradação ou offline' : 'saúde estável'}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: 16, alignItems: 'start', marginBottom: 20 }}>
        <section className="card">
          <div className="card-header">
            <div>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Provisionar novo edge</h2>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                Gere um token único para instalar o edge em campo.
              </div>
            </div>
          </div>
          <div className="card-body" style={{ display: 'grid', gap: 12 }}>
            <label>
              <span className="form-label">Unidade escolar</span>
              <select className="form-select" value={selectedUnitId} onChange={(e) => setSelectedUnitId(e.target.value)}>
                <option value="">Selecione a unidade</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.school.name} • {unit.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="form-label">Nome sugerido do edge</span>
              <input
                className="form-input"
                value={connectorName}
                onChange={(e) => setConnectorName(e.target.value)}
                placeholder="Ex.: edge-colegio-horizonte-sede"
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label>
                <span className="form-label">Validade do token</span>
                <select className="form-select" value={expiresInHours} onChange={(e) => setExpiresInHours(e.target.value)}>
                  <option value="24">24 horas</option>
                  <option value="72">72 horas</option>
                  <option value="168">7 dias</option>
                </select>
              </label>

              <label>
                <span className="form-label">Modo de conectividade</span>
                <select className="form-select" value={cloudMode} onChange={(e) => setCloudMode(e.target.value)}>
                  <option value="outbound_only">Saída segura padrão</option>
                  <option value="wireguard_management">Saída + gestão VPN</option>
                </select>
              </label>
            </div>

            <button className="btn btn-primary" onClick={handleProvision} disabled={provisioning || units.length === 0}>
              <KeyRound size={14} />
              {provisioning ? 'Gerando token...' : 'Gerar token de provisioning'}
            </button>

            <div className="form-helper">
              O token é exibido uma única vez e deve ser usado no roteador/appliance local durante o registro inicial.
            </div>
          </div>
        </section>

        <section className="card" style={{ minHeight: 220 }}>
          <div className="card-header">
            <div>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Último token gerado</h2>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                Entregue este material ao técnico de campo durante a instalação.
              </div>
            </div>
          </div>
          <div className="card-body">
            {!enrollment && !activeManagement ? (
              <EmptyState
                icon={<KeyRound size={46} />}
                title="Nenhum token gerado nesta sessão"
                description="Selecione a unidade escolar ao lado e gere o token para provisionar o edge."
              />
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {enrollment && (
                  <>
                    <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Token de enrollment</div>
                  <div style={{
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-bg)',
                    padding: 12,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    wordBreak: 'break-all',
                  }}>
                    {enrollment.enrollmentToken}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn btn-outline btn-sm" onClick={() => handleCopy(enrollment.enrollmentToken, 'Token')}>
                      <Copy size={13} />
                      Copiar token
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleCopy(window.location.origin + enrollment.bootstrap.enrollUrl, 'URL de registro')}>
                      <Copy size={13} />
                      Copiar URL de registro
                    </button>
                    {provisioningPackExport && (
                      <button className="btn btn-secondary btn-sm" onClick={() => handleCopy(provisioningPackExport, 'Pacote de provisionamento')}>
                        <FileJson size={13} />
                        Copiar pacote JSON
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
                  <div style={{ padding: 12, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Escola</div>
                    <div style={{ marginTop: 6, fontWeight: 700 }}>{enrollment.enrollment.school.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{enrollment.enrollment.schoolUnit.name}</div>
                  </div>
                  <div style={{ padding: 12, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Expira em</div>
                    <div style={{ marginTop: 6, fontWeight: 700 }}>{new Date(enrollment.enrollment.expiresAt).toLocaleString('pt-BR')}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Use este token apenas no primeiro claim do edge</div>
                  </div>
                </div>

                <div style={{ border: '1px dashed var(--color-border-strong)', borderRadius: 'var(--radius-md)', padding: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Passos de instalação</div>
                  <div style={{ display: 'grid', gap: 6, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    <div>1. Instalar o agente local no roteador ou appliance do site.</div>
                    <div>2. Configurar saída HTTPS para a plataforma.</div>
                    <div>3. Informar o token acima no processo de `claim`.</div>
                    <div>4. Confirmar heartbeat em <span className="text-mono">{enrollment.bootstrap.heartbeatUrl}</span>.</div>
                  </div>
                </div>
                  </>
                )}

                {activeManagement && (
                  <div style={{
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    padding: 12,
                    background: 'var(--color-surface-raised)',
                    display: 'grid',
                    gap: 12,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Gestao de conectividade</div>
                        <div style={{ marginTop: 6, fontWeight: 700 }}>
                          {activeManagement.mode === 'wireguard_management' ? 'Saida + WireGuard' : 'Saida segura padrao'}
                        </div>
                      </div>
                      <span className={`badge ${
                        activeManagement.mode === 'wireguard_management'
                          ? wireGuardInfrastructure?.configured ? 'badge-success' : 'badge-warning'
                          : 'badge-primary'
                      }`}>
                        {activeManagement.mode === 'wireguard_management'
                          ? wireGuardInfrastructure?.configured ? 'VPN pronta' : 'VPN pendente'
                          : 'Sem VPN'}
                      </span>
                    </div>

                    {activeManagement.mode === 'wireguard_management' ? (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                          <div style={{ padding: 12, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Infra VPN</div>
                            <div style={{ marginTop: 6, fontWeight: 700 }}>
                              {wireGuardInfrastructure?.configured ? 'Pronta para peers' : 'Aguardando configuracao'}
                            </div>
                          </div>
                          <div style={{ padding: 12, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Endpoint</div>
                            <div style={{ marginTop: 6, fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                              {wireGuardInfrastructure?.endpoint || wireGuardMetadata?.endpoint || 'Nao configurado'}
                            </div>
                          </div>
                          <div style={{ padding: 12, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tunel</div>
                            <div style={{ marginTop: 6, fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                              {wireGuardProfile?.tunnelAddress || wireGuardMetadata?.tunnelAddress || 'Sera alocado no claim'}
                            </div>
                          </div>
                          <div style={{ padding: 12, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Perfil</div>
                            <div style={{ marginTop: 6, fontWeight: 700 }}>
                              {wireGuardProfile?.profileName || wireGuardMetadata?.profileName || 'Gerado sob demanda'}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {wireGuardInfrastructure?.endpoint && (
                            <button className="btn btn-secondary btn-sm" onClick={() => handleCopy(wireGuardInfrastructure.endpoint || '', 'Endpoint WireGuard')}>
                              <Copy size={13} />
                              Copiar endpoint
                            </button>
                          )}
                          {wireGuardProfileText && (
                            <button className="btn btn-outline btn-sm" onClick={() => handleCopy(wireGuardProfileText, 'Perfil WireGuard')}>
                              <Copy size={13} />
                              Copiar perfil VPN
                            </button>
                          )}
                        </div>

                        {wireGuardProfile ? (
                          <div style={{ display: 'grid', gap: 8 }}>
                            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Perfil WireGuard</div>
                            <pre style={{
                              margin: 0,
                              padding: 12,
                              borderRadius: 'var(--radius-md)',
                              border: '1px solid var(--color-border)',
                              background: 'var(--color-bg)',
                              fontSize: 12,
                              overflowX: 'auto',
                              fontFamily: 'var(--font-mono)',
                            }}>
                              {wireGuardProfileText}
                            </pre>
                          </div>
                        ) : (
                          <div style={{
                            padding: 12,
                            borderRadius: 'var(--radius-md)',
                            border: '1px dashed var(--color-border-strong)',
                            color: 'var(--color-text-secondary)',
                            fontSize: 12,
                          }}>
                            O perfil final do peer e emitido depois do primeiro claim do edge ou por rotacao manual no inventario abaixo.
                          </div>
                        )}

                        {wireGuardReasons.length > 0 && (
                          <div style={{
                            border: '1px solid var(--color-warning-border)',
                            background: 'var(--color-warning-bg)',
                            borderRadius: 'var(--radius-md)',
                            padding: 12,
                            display: 'grid',
                            gap: 6,
                            fontSize: 12,
                          }}>
                            <div style={{ fontWeight: 700 }}>Pendencias para a VPN</div>
                            {wireGuardReasons.map((reason) => (
                              <div key={reason}>{reason}</div>
                            ))}
                          </div>
                        )}

                        {wireGuardNotes.length > 0 && (
                          <div style={{ display: 'grid', gap: 6, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                            {wireGuardNotes.map((note) => (
                              <div key={note}>{note}</div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{
                        padding: 12,
                        borderRadius: 'var(--radius-md)',
                        border: '1px dashed var(--color-border-strong)',
                        color: 'var(--color-text-secondary)',
                        fontSize: 12,
                      }}>
                        Este edge opera apenas com saida HTTPS para a nuvem. Use este modo quando o site nao precisa de acesso remoto via VPN.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <ListChecks size={16} />
              Prontidao do site
            </h2>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
              Pacote de rollout e readiness da unidade para preparacao de campo.
            </div>
          </div>
        </div>
        <div className="card-body">
          {!selectedUnit ? (
            <EmptyState
              icon={<School size={46} />}
              title="Selecione uma unidade escolar"
              description="Ao selecionar uma unidade, a plataforma mostra o pacote de provisionamento e a prontidao do site."
            />
          ) : !provisioningPack ? (
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              Carregando pacote de provisionamento da unidade...
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <div style={{ padding: 14, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Etapa</div>
                  <div style={{ marginTop: 6, fontWeight: 700 }}>
                    {provisioningPack.readiness.stage === 'edge_present'
                      ? 'Edge presente'
                      : provisioningPack.readiness.stage === 'ready_for_field'
                        ? 'Pronto para campo'
                        : 'Planejamento'}
                  </div>
                </div>
                <div style={{ padding: 14, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Licenca</div>
                  <div style={{ marginTop: 6, fontWeight: 700 }}>
                    {provisioningPack.licensing.edgeAllowed ? 'Liberada' : 'Bloqueada'}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    {provisioningPack.licensing.plan || 'Sem plano'} • {provisioningPack.licensing.status}
                  </div>
                </div>
                <div style={{ padding: 14, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AutoRegister prontos</div>
                  <div style={{ marginTop: 6, fontWeight: 700 }}>
                    {provisioningPack.readiness.autoRegisterReadyCount}/{provisioningPack.readiness.deviceCount}
                  </div>
                </div>
                <div style={{ padding: 14, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Modo sugerido</div>
                  <div style={{ marginTop: 6, fontWeight: 700 }}>
                    {provisioningPack.readiness.suggestedCloudMode === 'wireguard_management' ? 'Saida + VPN' : 'Saida segura'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 16, alignItems: 'start' }}>
                <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
                    <HardDrive size={15} />
                    Inventario tecnico da unidade
                  </div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {provisioningPack.devices.length > 0 ? provisioningPack.devices.map((device) => (
                      <div key={device.id} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                          <div>
                            <div style={{ fontWeight: 700 }}>{device.name}</div>
                            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                              {device.model || 'Sem modelo'} • {device.location || 'Sem local'}
                            </div>
                          </div>
                          <span className={`badge ${device.autoRegister.ready ? 'badge-success' : device.autoRegister.supportedModel ? 'badge-warning' : 'badge-neutral'}`}>
                            {device.autoRegister.ready ? 'AutoRegister OK' : device.autoRegister.supportedModel ? 'Revisar firmware' : 'Fora da lista'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                          <span className="badge badge-neutral" style={{ fontFamily: 'var(--font-mono)' }}>{device.ipAddress}:{device.port}</span>
                          <span className="badge badge-neutral">{device.connectivityMode}</span>
                          <span className="badge badge-neutral">FW {device.firmwareVer || 'nao informado'}</span>
                        </div>
                        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                          {device.autoRegister.notes.join(' ')}
                        </div>
                      </div>
                    )) : (
                      <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                        Nenhum device desta unidade foi inventariado ainda.
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 12 }}>
                  <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
                      <Network size={15} />
                      Perfil de rede
                    </div>
                    <div style={{ display: 'grid', gap: 6, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                      <div>UI local do edge: porta {provisioningPack.networkProfile.localUiPort}</div>
                      <div>AutoRegister / ingestao local: porta {provisioningPack.networkProfile.intakePort}</div>
                      {provisioningPack.networkProfile.requiredOutbound.map((item) => (
                        <div key={item}>{item}</div>
                      ))}
                      {provisioningPack.networkProfile.optionalManagement.map((item) => (
                        <div key={item}>{item}</div>
                      ))}
                    </div>
                  </div>

                  <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 14 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Sequencia de rollout</div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {provisioningPack.rolloutSteps.map((step, index) => (
                        <div key={step} style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                          <div style={{ minWidth: 18, fontWeight: 700 }}>{index + 1}.</div>
                          <div>{step}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {!provisioningPack.licensing.edgeAllowed && provisioningPack.licensing.reasons.length > 0 && (
                    <div style={{ border: '1px solid var(--color-danger-border)', borderRadius: 'var(--radius-md)', padding: 14, background: 'var(--color-danger-bg)' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Bloqueios atuais</div>
                      <div style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                        {provisioningPack.licensing.reasons.map((reason) => (
                          <div key={reason}>{reason}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {pendingUnits.length > 0 && (
        <section className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <div>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Sites aguardando instalação</h2>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                Unidades com devices cadastrados e sem edge provisionado.
              </div>
            </div>
          </div>
          <div className="card-body" style={{ display: 'grid', gap: 10 }}>
            {pendingUnits.map((unit) => (
              <div key={unit.id} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: 14,
                border: '1px solid var(--color-warning-border)',
                background: 'var(--color-warning-bg)',
                borderRadius: 'var(--radius-md)',
                flexWrap: 'wrap',
              }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{unit.school.name} • {unit.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                    {unit.address || 'Sem endereço informado'} • {unit.deviceCount} devices cadastrados
                  </div>
                </div>
                <button className="btn btn-outline btn-sm" onClick={() => setSelectedUnitId(unit.id)}>
                  Preparar provisioning
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {recentProvisioningWindow.length > 0 && (
        <section className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <div>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Janela de provisioning</h2>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                Acompanhamento dos enrollments mais recentes: token, claim e heartbeat do edge.
              </div>
            </div>
          </div>
          <div className="card-body" style={{ display: 'grid', gap: 10 }}>
            {recentProvisioningWindow.map((item) => (
              <article
                key={item.id}
                style={{
                  display: 'grid',
                  gap: 10,
                  padding: 14,
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-surface-raised)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>
                      {item.school.name} • {item.schoolUnit.name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                      {item.label || 'Enrollment sem rótulo'} • expira em {new Date(item.expiresAt).toLocaleString('pt-BR')}
                    </div>
                  </div>
                  <span
                    className={`badge ${
                      item.status === 'online'
                        ? 'badge-success'
                        : item.status === 'degraded' || item.status === 'claimed_waiting_heartbeat'
                          ? 'badge-warning'
                          : item.status === 'expired' || item.status === 'offline'
                            ? 'badge-danger'
                            : 'badge-info'
                    }`}
                  >
                    {item.statusLabel}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
                  <div style={{ padding: 10, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Modo</div>
                    <div style={{ marginTop: 4, fontWeight: 700 }}>
                      {item.cloudMode === 'wireguard_management' ? 'Saida + VPN' : 'Saida segura'}
                    </div>
                  </div>
                  <div style={{ padding: 10, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Claim</div>
                    <div style={{ marginTop: 4, fontWeight: 700 }}>
                      {item.usedAt ? 'Concluido' : 'Pendente'}
                    </div>
                  </div>
                  <div style={{ padding: 10, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Heartbeat</div>
                    <div style={{ marginTop: 4, fontWeight: 700 }}>
                      {item.connector?.lastSeenAt ? formatRelativeTime(item.connector.lastSeenAt) : 'Ainda nao visto'}
                    </div>
                  </div>
                  <div style={{ padding: 10, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Cobertura</div>
                    <div style={{ marginTop: 4, fontWeight: 700 }}>
                      {item.connector ? `${item.connector.onlineDeviceCount}/${item.connector.deviceCount} devices` : 'Sem edge vinculado'}
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  {item.message}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <div className="card-header">
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Inventário de edges</h2>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
              Saúde e cobertura dos gateways locais por escola e unidade.
            </div>
          </div>
        </div>
        <div className="card-body">
          {loading ? (
            <SkeletonTable rows={4} cols={6} />
          ) : connectors.length === 0 ? (
            <EmptyState
              icon={<Shield size={48} />}
              title="Nenhum edge cadastrado"
              description="Gere um token de provisioning para instalar o primeiro gateway local de uma unidade escolar."
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
              {connectors.map((connector) => (
                <article key={connector.id} style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 16,
                  background: 'var(--color-surface-raised)',
                  boxShadow: 'var(--shadow-xs)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{connector.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 3 }}>
                        {connector.hostname || 'Hostname não informado'}
                        {connector.version ? ` • v${connector.version}` : ''}
                      </div>
                    </div>
                    {getStatusBadge(connector.status)}
                  </div>

                  <div style={{ display: 'grid', gap: 8, fontSize: 12, marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-secondary)' }}>
                      <Building2 size={13} />
                      {connector.schoolUnit.school.name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-secondary)' }}>
                      <MapPin size={13} />
                      {connector.schoolUnit.name}
                      {connector.schoolUnit.address ? ` • ${connector.schoolUnit.address}` : ''}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-secondary)' }}>
                      <Clock3 size={13} />
                      {formatRelativeTime(connector.lastSeenAt)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-secondary)' }}>
                      <HardDrive size={13} />
                      {connector.onlineDeviceCount}/{connector.deviceCount} devices online via edge
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                    <span className={`badge ${connector.cloudMode === 'wireguard_management' ? 'badge-info' : 'badge-primary'}`}>
                      {connector.cloudMode === 'wireguard_management' ? 'Saída + VPN' : 'Saída segura'}
                    </span>
                    {connector.lastIp && (
                      <span className="badge badge-neutral">{connector.lastIp}</span>
                    )}
                  </div>

                  {connector.cloudMode === 'wireguard_management' && connector.management?.wireguard && (
                    <div style={{
                      display: 'grid',
                      gap: 8,
                      marginBottom: 12,
                      padding: 12,
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--color-bg)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Gestao remota
                        </div>
                        <span className={`badge ${connector.management.wireguard.status === 'ready' ? 'badge-success' : 'badge-warning'}`}>
                          {connector.management.wireguard.status === 'ready' ? 'Peer ativo' : 'Aguardando infra'}
                        </span>
                      </div>
                      <div style={{ display: 'grid', gap: 6, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                        <div>
                          Endpoint: <span className="text-mono">{connector.management.wireguard.endpoint || 'Nao configurado'}</span>
                        </div>
                        <div>
                          Tunel: <span className="text-mono">{connector.management.wireguard.tunnelAddress || 'Ainda nao alocado'}</span>
                        </div>
                        {connector.management.wireguard.lastRotationAt && (
                          <div>Rotacao: {new Date(connector.management.wireguard.lastRotationAt).toLocaleString('pt-BR')}</div>
                        )}
                        {connector.management.wireguard.reasons.length > 0 && (
                          <div>{connector.management.wireguard.reasons.join(' ')}</div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => handleRotateWireGuardProfile(connector.id)}
                          disabled={rotatingConnectorId === connector.id}
                        >
                          <RefreshCw size={13} className={rotatingConnectorId === connector.id ? 'animate-spin' : ''} />
                          {rotatingConnectorId === connector.id ? 'Rotacionando...' : 'Rotacionar perfil VPN'}
                        </button>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Sub-redes locais
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {connector.localSubnets.length > 0 ? connector.localSubnets.map((subnet) => (
                        <span key={subnet} className="badge badge-neutral" style={{ fontFamily: 'var(--font-mono)' }}>
                          {subnet}
                        </span>
                      )) : (
                        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Sub-redes ainda não reportadas</span>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
