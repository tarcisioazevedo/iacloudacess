type CloudMode = 'outbound_only' | 'wireguard_management';

type EnrollmentConnectorRecord = {
  id: string;
  name: string;
  status: string;
  cloudMode: string;
  hostname?: string | null;
  version?: string | null;
  lastSeenAt?: Date | null;
  claimedAt?: Date | null;
  devices?: Array<{ id: string; status: string }>;
};

type EnrollmentRecord = {
  id: string;
  label?: string | null;
  createdAt: Date;
  expiresAt: Date;
  usedAt?: Date | null;
  metadata?: unknown;
  edgeConnector?: EnrollmentConnectorRecord | null;
};

export type EdgeEnrollmentLifecycleStatus =
  | 'pending_claim'
  | 'expired'
  | 'claimed_waiting_heartbeat'
  | 'online'
  | 'degraded'
  | 'offline';

const HEARTBEAT_STALE_SECONDS = 180;

function normalizeCloudMode(value: unknown, fallback: CloudMode = 'outbound_only'): CloudMode {
  return value === 'wireguard_management' ? 'wireguard_management' : fallback;
}

function readCloudMode(metadata: unknown, connector?: EnrollmentConnectorRecord | null): CloudMode {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const value = (metadata as Record<string, unknown>).cloudMode;
    return normalizeCloudMode(value, normalizeCloudMode(connector?.cloudMode));
  }

  return normalizeCloudMode(connector?.cloudMode);
}

export function summarizeEdgeEnrollment(record: EnrollmentRecord, now = new Date()) {
  const connector = record.edgeConnector ?? null;
  const cloudMode = readCloudMode(record.metadata, connector);
  const isExpired = record.expiresAt.getTime() <= now.getTime();
  const claimed = Boolean(record.usedAt || connector);
  const heartbeatAgeSeconds = connector?.lastSeenAt
    ? Math.max(0, Math.floor((now.getTime() - connector.lastSeenAt.getTime()) / 1000))
    : null;
  const heartbeatSeen = heartbeatAgeSeconds !== null;
  const heartbeatFresh = heartbeatAgeSeconds !== null && heartbeatAgeSeconds <= HEARTBEAT_STALE_SECONDS;

  let status: EdgeEnrollmentLifecycleStatus;
  if (!claimed) {
    status = isExpired ? 'expired' : 'pending_claim';
  } else if (!connector || !heartbeatSeen || connector.status === 'provisioning') {
    status = 'claimed_waiting_heartbeat';
  } else if (!heartbeatFresh || connector.status === 'offline' || connector.status === 'suspended') {
    status = 'offline';
  } else if (connector.status === 'degraded' || connector.status === 'unstable') {
    status = 'degraded';
  } else {
    status = 'online';
  }

  const statusLabel: Record<EdgeEnrollmentLifecycleStatus, string> = {
    pending_claim: 'Aguardando claim do edge',
    expired: 'Token expirado',
    claimed_waiting_heartbeat: 'Claim concluido, aguardando heartbeat',
    online: 'Edge ativo',
    degraded: 'Edge ativo com alertas',
    offline: 'Edge sem heartbeat recente',
  };

  const actionRequired =
    status === 'pending_claim'
      ? 'claim_edge'
      : status === 'claimed_waiting_heartbeat'
        ? 'wait_heartbeat'
        : status === 'offline'
          ? 'check_connectivity'
          : null;

  const message =
    status === 'pending_claim'
      ? 'Leve o token ou pacote de provisionamento ao site e execute o claim no edge.'
      : status === 'expired'
        ? 'Gere um novo token antes de enviar o tecnico a campo.'
        : status === 'claimed_waiting_heartbeat'
          ? 'O appliance ja foi associado; aguardamos o primeiro heartbeat para fechar a ativacao.'
          : status === 'offline'
            ? 'O edge ja foi registrado, mas perdeu contato recente com a nuvem. Verifique saida HTTPS, VPN e servico local.'
            : status === 'degraded'
              ? 'O edge esta operacional, mas ha sinais de degradacao. Vale revisar conectividade local e carga.'
              : 'O edge esta online e pronto para sincronizacao e coleta.';

  return {
    id: record.id,
    label: record.label || null,
    cloudMode,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    usedAt: record.usedAt || null,
    isExpired,
    hasBeenClaimed: claimed,
    expiresInSeconds: Math.max(0, Math.floor((record.expiresAt.getTime() - now.getTime()) / 1000)),
    status,
    statusLabel: statusLabel[status],
    actionRequired,
    message,
    ready: status === 'online' || status === 'degraded',
    steps: {
      tokenCreated: true,
      claimed,
      heartbeatSeen,
      operational: status === 'online' || status === 'degraded',
    },
    connector: connector
      ? {
          id: connector.id,
          name: connector.name,
          status: connector.status,
          cloudMode: connector.cloudMode,
          hostname: connector.hostname || null,
          version: connector.version || null,
          claimedAt: connector.claimedAt || null,
          lastSeenAt: connector.lastSeenAt || null,
          heartbeatAgeSeconds,
          deviceCount: connector.devices?.length || 0,
          onlineDeviceCount: connector.devices?.filter((device) => device.status === 'online').length || 0,
        }
      : null,
  };
}
