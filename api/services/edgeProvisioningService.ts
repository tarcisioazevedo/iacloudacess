import { prisma } from '../prisma';
import { evaluateIntelbrasAutoRegisterCompatibility } from './intelbrasCompatibility';
import { getWireGuardInfrastructureStatus } from './wireguardProvisioning';

export interface EdgeProvisioningPack {
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
    autoRegister: ReturnType<typeof evaluateIntelbrasAutoRegisterCompatibility>;
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

export async function buildEdgeProvisioningPack(schoolUnitId: string): Promise<EdgeProvisioningPack | null> {
  const schoolUnit = await prisma.schoolUnit.findUnique({
    where: { id: schoolUnitId },
    include: {
      school: {
        include: {
          integrator: true,
        },
      },
      devices: {
        orderBy: [{ name: 'asc' }],
        select: {
          id: true,
          name: true,
          model: true,
          firmwareVer: true,
          ipAddress: true,
          port: true,
          location: true,
          connectivityMode: true,
        },
      },
      edgeConnectors: {
        orderBy: [{ createdAt: 'desc' }],
        select: {
          id: true,
          name: true,
          status: true,
          cloudMode: true,
          lastSeenAt: true,
          hostname: true,
        },
      },
    },
  });

  if (!schoolUnit) {
    return null;
  }

  const [license, usedSchools, usedDevices] = await Promise.all([
    prisma.license.findFirst({
      where: { integratorId: schoolUnit.school.integratorId },
      orderBy: { validTo: 'desc' },
    }),
    prisma.school.count({
      where: {
        integratorId: schoolUnit.school.integratorId,
        status: 'active',
      },
    }),
    prisma.device.count({
      where: {
        schoolUnit: {
          school: {
            integratorId: schoolUnit.school.integratorId,
          },
        },
      },
    }),
  ]);

  const now = new Date();
  const licenseStatus = !license
    ? 'missing'
    : license.validTo < now
      ? 'expired'
      : license.status;

  const edgeAllowed = Boolean(
    schoolUnit.school.integrator.status === 'active'
    && schoolUnit.school.status === 'active'
    && ['active', 'trial'].includes(licenseStatus),
  );
  const wireGuardInfrastructure = getWireGuardInfrastructureStatus();

  const deviceCompatibilities = schoolUnit.devices.map((device) => ({
    ...device,
    autoRegister: evaluateIntelbrasAutoRegisterCompatibility(device.model, device.firmwareVer),
  }));

  const autoRegisterReadyCount = deviceCompatibilities.filter((device) => device.autoRegister.ready).length;
  const autoRegisterNeedsFirmwareReviewCount = deviceCompatibilities.filter((device) => (
    device.autoRegister.supportedModel && device.autoRegister.firmwareSupported !== true
  )).length;
  const onlineEdgeCount = schoolUnit.edgeConnectors.filter((connector) => connector.status === 'online').length;

  const suggestedCloudMode: 'outbound_only' | 'wireguard_management' = schoolUnit.edgeConnectors.some(
    (connector) => connector.cloudMode === 'wireguard_management',
  ) || schoolUnit.devices.length >= 8
    ? 'wireguard_management'
    : 'outbound_only';

  return {
    generatedAt: now.toISOString(),
    schoolUnit: {
      id: schoolUnit.id,
      name: schoolUnit.name,
      address: schoolUnit.address,
    },
    school: {
      id: schoolUnit.school.id,
      name: schoolUnit.school.name,
      slug: schoolUnit.school.slug,
      status: schoolUnit.school.status,
    },
    integrator: {
      id: schoolUnit.school.integrator.id,
      name: schoolUnit.school.integrator.name,
      slug: schoolUnit.school.integrator.slug,
      status: schoolUnit.school.integrator.status,
    },
    licensing: {
      plan: license?.plan || null,
      status: licenseStatus,
      validTo: license?.validTo?.toISOString() || null,
      edgeAllowed,
      reasons: [
        schoolUnit.school.integrator.status !== 'active' ? 'integrator_inactive' : null,
        schoolUnit.school.status !== 'active' ? 'school_inactive' : null,
        !license ? 'license_missing' : null,
        license && license.validTo < now ? 'license_expired' : null,
        license && usedSchools > license.maxSchools ? 'license_school_overage' : null,
        license && usedDevices > license.maxDevices ? 'license_device_overage' : null,
      ].filter((reason): reason is string => Boolean(reason)),
    },
    readiness: {
      deviceCount: schoolUnit.devices.length,
      edgeCount: schoolUnit.edgeConnectors.length,
      onlineEdgeCount,
      autoRegisterReadyCount,
      autoRegisterNeedsFirmwareReviewCount,
      suggestedCloudMode,
      stage: schoolUnit.edgeConnectors.length > 0
        ? 'edge_present'
        : edgeAllowed && schoolUnit.devices.length > 0
          ? 'ready_for_field'
          : 'planning',
    },
    networkProfile: {
      localUiPort: 4500,
      intakePort: 4500,
      requiredOutbound: [
        'TCP 443 para a plataforma em nuvem',
      ],
      optionalManagement: [
        'WireGuard opcional para suporte remoto controlado',
      ],
    },
    management: {
      selectedCloudMode: suggestedCloudMode,
      wireguard: {
        configured: wireGuardInfrastructure.configured,
        endpoint: wireGuardInfrastructure.endpoint,
        tunnelCidr: wireGuardInfrastructure.tunnelCidr,
        allowedIps: wireGuardInfrastructure.allowedIps,
        dns: wireGuardInfrastructure.dns,
        persistentKeepalive: wireGuardInfrastructure.persistentKeepalive,
        reasons: wireGuardInfrastructure.reasons,
        notes: wireGuardInfrastructure.notes,
      },
    },
    devices: deviceCompatibilities,
    connectors: schoolUnit.edgeConnectors.map((connector) => ({
      ...connector,
      lastSeenAt: connector.lastSeenAt?.toISOString() || null,
    })),
    rolloutSteps: [
      'Validar licenca e escopo da unidade antes do envio para campo.',
      'Confirmar rede local do site e saida HTTPS para a nuvem.',
      'Conferir inventario de devices e elegibilidade AutoRegister CGI.',
      'Gerar token de enrollment apenas perto da janela de instalacao.',
      'Fazer claim do edge no site e confirmar heartbeat/licenca na plataforma.',
      'Executar teste de evento e de sincronizacao com um device da unidade.',
    ],
  };
}
