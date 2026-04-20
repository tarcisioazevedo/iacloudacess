import fs from 'fs/promises';
import path from 'path';
import type { EdgeAgentConfig, EdgeManagedDeviceConfig } from './types';

const DEFAULT_CONFIG_PATH = path.resolve(process.cwd(), 'edge-agent', 'config.json');

function normalizeDevices(input: unknown): EdgeManagedDeviceConfig[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((device): device is Record<string, unknown> => Boolean(device) && typeof device === 'object')
    .map((device) => {
      const transport: EdgeManagedDeviceConfig['transport'] = (
        device.transport === 'auto-register' || device.transport === 'hybrid'
      )
        ? device.transport
        : 'direct';

      return {
        vendor: 'intelbras' as const,
        name: typeof device.name === 'string' ? device.name.trim() : undefined,
        model: typeof device.model === 'string' ? device.model.trim() : undefined,
        cloudDeviceId: typeof device.cloudDeviceId === 'string' ? device.cloudDeviceId.trim() : undefined,
        serialNumber: typeof device.serialNumber === 'string' ? device.serialNumber.trim() : undefined,
        localIdentifier: typeof device.localIdentifier === 'string' ? device.localIdentifier.trim() : undefined,
        ipAddress: typeof device.ipAddress === 'string' ? device.ipAddress.trim() : '',
        port: typeof device.port === 'number' ? device.port : 80,
        username: typeof device.username === 'string' ? device.username.trim() : 'admin',
        password: typeof device.password === 'string' ? device.password : '',
        transport,
        autoRegister: device.autoRegister && typeof device.autoRegister === 'object'
          ? {
              enabled: (device.autoRegister as Record<string, unknown>).enabled !== false,
              deviceId: typeof (device.autoRegister as Record<string, unknown>).deviceId === 'string'
                ? String((device.autoRegister as Record<string, unknown>).deviceId).trim() || undefined
                : undefined,
              keepAliveIntervalSec: Number((device.autoRegister as Record<string, unknown>).keepAliveIntervalSec || 20),
            }
          : undefined,
        enabled: device.enabled !== false,
      };
    })
    .filter((device) => Boolean(device.ipAddress) && Boolean(device.username) && Boolean(device.password));
}

function normalizeStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function loadEdgeAgentConfig(configPathArg?: string): Promise<{ config: EdgeAgentConfig; configPath: string }> {
  const configPath = path.resolve(configPathArg || process.env.EDGE_CONFIG_PATH || DEFAULT_CONFIG_PATH);
  const rawText = await fs.readFile(configPath, 'utf8');
  const raw = JSON.parse(rawText) as Record<string, any>;

  const configDir = path.dirname(configPath);
  const stateDir = path.resolve(configDir, raw.stateDir || './state');
  const baseUrl = String(raw.cloud?.baseUrl || process.env.EDGE_CLOUD_BASE_URL || '').trim().replace(/\/+$/, '');

  if (!baseUrl) {
    throw new Error(`cloud.baseUrl is required in ${configPath}`);
  }

  const config: EdgeAgentConfig = {
    cloud: {
      baseUrl,
      enrollmentToken: String(raw.cloud?.enrollmentToken || process.env.EDGE_ENROLLMENT_TOKEN || '').trim() || undefined,
      requestTimeoutMs: Number(raw.cloud?.requestTimeoutMs || process.env.EDGE_REQUEST_TIMEOUT_MS || 15000),
      heartbeatIntervalSec: Number(raw.cloud?.heartbeatIntervalSec || process.env.EDGE_HEARTBEAT_INTERVAL_SEC || 30),
      syncPollIntervalSec: Number(raw.cloud?.syncPollIntervalSec || process.env.EDGE_SYNC_POLL_INTERVAL_SEC || 15),
      eventFlushIntervalSec: Number(raw.cloud?.eventFlushIntervalSec || process.env.EDGE_EVENT_FLUSH_INTERVAL_SEC || 10),
      maxSyncJobsPerPoll: Number(raw.cloud?.maxSyncJobsPerPoll || process.env.EDGE_MAX_SYNC_JOBS || 20),
      maxEventBatchSize: Number(raw.cloud?.maxEventBatchSize || process.env.EDGE_MAX_EVENT_BATCH || 50),
    },
    connector: {
      name: String(raw.connector?.name || process.env.EDGE_CONNECTOR_NAME || '').trim() || undefined,
      hostname: String(raw.connector?.hostname || process.env.EDGE_CONNECTOR_HOSTNAME || '').trim() || undefined,
      version: String(raw.connector?.version || process.env.EDGE_CONNECTOR_VERSION || '0.1.0').trim() || '0.1.0',
      localSubnets: normalizeStringArray(raw.connector?.localSubnets),
      cloudMode: raw.connector?.cloudMode === 'wireguard_management' ? 'wireguard_management' : 'outbound_only',
      adoptDevicesOnClaim: raw.connector?.adoptDevicesOnClaim !== false,
      capabilities: raw.connector?.capabilities && typeof raw.connector.capabilities === 'object'
        ? raw.connector.capabilities
        : {
          localWebhookIngest: true,
          syncPull: true,
          heartbeat: true,
          cgiAutoRegister: true,
        },
    },
    localServer: {
      host: String(raw.localServer?.host || process.env.EDGE_LOCAL_HOST || '0.0.0.0').trim() || '0.0.0.0',
      port: Number(raw.localServer?.port || process.env.EDGE_LOCAL_PORT || 4500),
      intakeSecret: String(raw.localServer?.intakeSecret || process.env.EDGE_LOCAL_SECRET || '').trim() || undefined,
    },
    stateDir,
    devices: normalizeDevices(raw.devices),
  };

  return { config, configPath };
}
