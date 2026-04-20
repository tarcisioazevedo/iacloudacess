export interface EdgeManagedDeviceAutoRegisterConfig {
  enabled?: boolean;
  deviceId?: string;
  keepAliveIntervalSec?: number;
}

export interface EdgeManagedDeviceConfig {
  vendor: 'intelbras';
  name?: string;
  model?: string;
  cloudDeviceId?: string;
  serialNumber?: string;
  localIdentifier?: string;
  ipAddress: string;
  port?: number;
  username: string;
  password: string;
  transport?: 'direct' | 'auto-register' | 'hybrid';
  autoRegister?: EdgeManagedDeviceAutoRegisterConfig;
  enabled?: boolean;
}

export interface EdgeAgentConfig {
  cloud: {
    baseUrl: string;
    enrollmentToken?: string;
    requestTimeoutMs?: number;
    heartbeatIntervalSec?: number;
    syncPollIntervalSec?: number;
    eventFlushIntervalSec?: number;
    maxSyncJobsPerPoll?: number;
    maxEventBatchSize?: number;
  };
  connector: {
    name?: string;
    hostname?: string;
    version?: string;
    localSubnets?: string[];
    cloudMode?: 'outbound_only' | 'wireguard_management';
    adoptDevicesOnClaim?: boolean;
    capabilities?: Record<string, unknown>;
  };
  localServer: {
    host?: string;
    port: number;
    intakeSecret?: string;
  };
  stateDir: string;
  devices: EdgeManagedDeviceConfig[];
}

export interface CloudEdgeCredentials {
  edgeId: string;
  edgeKey: string;
  connectorName: string;
  schoolId?: string;
  schoolUnitId?: string;
  enrolledAt: string;
}

export interface EdgeLicenseSnapshot {
  edge?: {
    id: string;
    name: string;
    status: string;
    cloudMode: string;
    lastSeenAt?: string | null;
    createdAt: string;
  } | null;
  schoolUnit?: {
    id: string;
    name: string;
    address?: string | null;
  } | null;
  school?: {
    id: string;
    name: string;
    slug: string;
    status: string;
  } | null;
  integrator?: {
    id: string;
    name: string;
    slug: string;
    status: string;
  } | null;
  license?: {
    id: string;
    plan: string;
    status: string;
    validFrom: string;
    validTo: string;
    maxSchools: number;
    usedSchools: number;
    maxDevices: number;
    usedDevices: number;
  } | null;
  enforcement?: {
    edgeAllowed: boolean;
    reasons: string[];
  };
  serverTime?: string;
}

export interface CloudSyncJobDevice {
  id: string;
  name: string;
  ipAddress: string;
  port: number;
  username: string;
  serialNumber?: string | null;
  localIdentifier?: string | null;
  location?: string | null;
}

export interface CloudSyncJob {
  id: string;
  syncType: string;
  payload: Record<string, unknown>;
  device: CloudSyncJobDevice;
}

export interface EdgeHeartbeatDeviceStatus {
  deviceId?: string;
  serialNumber?: string;
  localIdentifier?: string;
  ipAddress: string;
  status: 'online' | 'offline' | 'degraded';
  lastHeartbeat: string;
}

export interface NormalizedEdgeEventPayload {
  deviceId?: string;
  serialNumber?: string;
  localIdentifier?: string;
  eventCode: string;
  method?: string | null;
  door?: number | null;
  direction?: string | null;
  status: string;
  userIdRaw?: string | null;
  cardNoRaw?: string | null;
  occurredAt: string;
  idempotencyKey: string;
  photoBase64?: string | null;
  photoPath?: string | null;
  rawPayload: Record<string, unknown>;
}

export interface SpoolEventRecord {
  id: string;
  createdAt: string;
  attempts: number;
  payload: NormalizedEdgeEventPayload;
}

export interface EdgeAutoRegisterConnectPayload {
  DevClass?: string;
  DeviceID?: string;
  ServerIP?: string;
}

export interface EdgeAutoRegisterSessionSnapshot {
  deviceName: string;
  deviceRef: string;
  deviceId: string;
  ipAddress: string;
  devClass?: string | null;
  remoteAddress?: string | null;
  serverIp?: string | null;
  transport: 'direct' | 'auto-register' | 'hybrid';
  status: 'connected' | 'authenticated' | 'degraded' | 'offline';
  tokenActive: boolean;
  connectedAt: string;
  lastConnectAt: string;
  lastLoginAt?: string | null;
  lastKeepAliveAt?: string | null;
  lastKeepAliveOkAt?: string | null;
  keepAliveIntervalSec: number;
  consecutiveKeepAliveFailures: number;
  lastError?: string | null;
}

export interface EdgeAutoRegisterSummary {
  enabledDevices: number;
  activeSessions: number;
  listeningPath: string;
  sessions: EdgeAutoRegisterSessionSnapshot[];
}
