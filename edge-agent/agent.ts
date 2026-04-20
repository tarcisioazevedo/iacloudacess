import os from 'os';
import type { Server } from 'http';
import { IntelbrasAutoRegisterGateway } from './autoRegisterGateway';
import { EdgeCloudClient } from './cloudClient';
import { startEdgeLocalServer } from './localServer';
import { EdgeStateStore } from './state';
import { executeIntelbrasSync, normalizeIntelbrasEvent, probeIntelbrasDevice } from './intelbrasAdapter';
import type {
  CloudEdgeCredentials,
  CloudSyncJob,
  EdgeLicenseSnapshot,
  EdgeAgentConfig,
  EdgeManagedDeviceConfig,
} from './types';

export class EdgeAgent {
  private readonly state: EdgeStateStore;
  private readonly cloud: EdgeCloudClient;
  private readonly autoRegister: IntelbrasAutoRegisterGateway;
  private credentials: CloudEdgeCredentials | null = null;
  private server: Server | null = null;
  private timers: Array<ReturnType<typeof setInterval>> = [];
  private heartbeatRunning = false;
  private syncRunning = false;
  private flushRunning = false;
  private cachedLicense: EdgeLicenseSnapshot | null = null;
  private runtime = {
    lastHeartbeatAt: null as string | null,
    lastSyncAt: null as string | null,
    lastFlushAt: null as string | null,
    lastLicenseRefreshAt: null as string | null,
    lastError: null as string | null,
    cloudReachable: false,
  };

  constructor(private readonly config: EdgeAgentConfig) {
    this.state = new EdgeStateStore(config.stateDir);
    this.cloud = new EdgeCloudClient(config.cloud.baseUrl, config.cloud.requestTimeoutMs || 15000);
    this.autoRegister = new IntelbrasAutoRegisterGateway(config.devices);
  }

  get managedDevices() {
    return this.config.devices.filter((device) => device.enabled !== false);
  }

  async init() {
    await this.state.init();
    this.credentials = await this.state.loadCredentials();
  }

  private resolveConnectorName() {
    return this.config.connector.name || `edge-${os.hostname().toLowerCase()}`;
  }

  async claim(force = false, enrollmentTokenOverride?: string): Promise<CloudEdgeCredentials> {
    if (!force && this.credentials) {
      return this.credentials;
    }

    const enrollmentToken = enrollmentTokenOverride || this.config.cloud.enrollmentToken;
    if (!enrollmentToken) {
      throw new Error('No enrollment token available. Configure cloud.enrollmentToken or run claim with a valid config.');
    }

    const credentials = await this.cloud.enroll({
      enrollmentToken,
      connectorName: this.resolveConnectorName(),
      hostname: this.config.connector.hostname || os.hostname(),
      version: this.config.connector.version || '0.1.0',
      localSubnets: this.config.connector.localSubnets || [],
      capabilities: this.config.connector.capabilities,
      adoptDevices: this.config.connector.adoptDevicesOnClaim,
    });

    await this.state.saveCredentials(credentials);
    this.credentials = credentials;
    this.runtime.cloudReachable = true;
    this.runtime.lastError = null;
    await this.refreshLicenseStatus();
    return credentials;
  }

  private async ensureCredentials() {
    if (this.credentials) {
      return this.credentials;
    }

    await this.init();
    if (this.credentials) {
      return this.credentials;
    }

    return this.claim(false);
  }

  private findDeviceByRef(ref: string): EdgeManagedDeviceConfig | undefined {
    const normalized = ref.trim().toLowerCase();
    return this.managedDevices.find((device) => [
      device.cloudDeviceId,
      device.serialNumber,
      device.localIdentifier,
      device.ipAddress,
      `${device.ipAddress}:${device.port || 80}`,
      device.name,
      device.autoRegister?.deviceId,
    ]
      .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
      .some((value) => value.trim().toLowerCase() === normalized));
  }

  private findDeviceForSyncJob(job: CloudSyncJob): EdgeManagedDeviceConfig | undefined {
    return this.managedDevices.find((device) => {
      if (device.cloudDeviceId && device.cloudDeviceId === job.device.id) return true;
      if (device.localIdentifier && job.device.localIdentifier && device.localIdentifier === job.device.localIdentifier) return true;
      if (device.serialNumber && job.device.serialNumber && device.serialNumber === job.device.serialNumber) return true;
      return device.ipAddress === job.device.ipAddress;
    });
  }

  async simulateTestEvent(options?: {
    deviceRef?: string;
    userId?: string;
    method?: string;
    direction?: 'entry' | 'exit';
    status?: 'granted' | 'denied';
    door?: number;
    cardNo?: string;
  }) {
    const device = options?.deviceRef
      ? this.findDeviceByRef(options.deviceRef)
      : this.managedDevices[0];

    if (!device) {
      throw new Error('Nenhum device local disponivel para gerar evento de teste');
    }

    const deviceRef = device.cloudDeviceId
      || device.localIdentifier
      || device.serialNumber
      || device.autoRegister?.deviceId
      || device.ipAddress;

    if (!deviceRef) {
      throw new Error('Nao foi possivel resolver uma referencia local para o device de teste');
    }

    const now = new Date();
    const userId = options?.userId?.trim() || `lab-${now.getHours()}${now.getMinutes()}${now.getSeconds()}`;
    const rawPayload = {
      AccessControlNotificationInfo: {
        EventCode: 'AccessControl',
        Method: options?.method?.trim() || 'Face',
        Door: typeof options?.door === 'number' ? options.door : 1,
        Direction: options?.direction === 'exit' ? 1 : 0,
        ErrorCode: options?.status === 'denied' ? 1 : 0,
        UserID: userId,
        CardNo: options?.cardNo?.trim() || null,
        UTC: now.toISOString(),
        EventTime: now.toISOString(),
      },
    };

    const normalized = await normalizeIntelbrasEvent(device, rawPayload);
    await this.state.appendEvent(normalized);

    return {
      message: 'Evento de teste enfileirado com sucesso',
      deviceRef,
      userIdRaw: normalized.userIdRaw,
      occurredAt: normalized.occurredAt,
      spoolSize: await this.state.getSpoolSize(),
      payload: normalized,
    };
  }

  async ingestIntelbrasEvent(deviceRef: string, rawPayload: Record<string, unknown>) {
    const device = this.findDeviceByRef(deviceRef);
    if (!device) {
      throw new Error(`Managed device not found for reference: ${deviceRef}`);
    }

    const normalized = await normalizeIntelbrasEvent(device, rawPayload);
    await this.state.appendEvent(normalized);
  }

  async registerIntelbrasAutoConnect(
    payload: { DevClass?: string; DeviceID?: string; ServerIP?: string },
    context: { remoteAddress?: string | null },
  ) {
    return this.autoRegister.handleConnect(payload, context);
  }

  private async collectHeartbeatStatus() {
    const statuses = await Promise.all(this.managedDevices.map(async (device) => {
      const autoRegisterSession = this.autoRegister.getSessionByDevice(device);
      if (autoRegisterSession?.tokenActive) {
        return {
          deviceId: device.cloudDeviceId,
          serialNumber: device.serialNumber,
          localIdentifier: device.localIdentifier,
          ipAddress: device.ipAddress,
          status: autoRegisterSession.status === 'degraded' ? 'degraded' as const : 'online' as const,
          lastHeartbeat: autoRegisterSession.lastKeepAliveOkAt || autoRegisterSession.lastLoginAt || new Date().toISOString(),
        };
      }

      try {
        return await probeIntelbrasDevice(device);
      } catch {
        return {
          deviceId: device.cloudDeviceId,
          serialNumber: device.serialNumber,
          localIdentifier: device.localIdentifier,
          ipAddress: device.ipAddress,
          status: 'offline' as const,
          lastHeartbeat: new Date().toISOString(),
        };
      }
    }));

    const degraded = statuses.some((status) => status.status !== 'online');
    return {
      connectorStatus: degraded ? 'degraded' as const : 'online' as const,
      statuses,
    };
  }

  async sendHeartbeatOnce() {
    if (this.heartbeatRunning) return;
    this.heartbeatRunning = true;

    try {
      const credentials = await this.ensureCredentials();
      const heartbeat = await this.collectHeartbeatStatus();

      await this.cloud.heartbeat(credentials, {
        hostname: this.config.connector.hostname || os.hostname(),
        version: this.config.connector.version || '0.1.0',
        status: heartbeat.connectorStatus,
        localSubnets: this.config.connector.localSubnets || [],
        devices: heartbeat.statuses,
      });
      this.runtime.lastHeartbeatAt = new Date().toISOString();
      this.runtime.cloudReachable = true;
      this.runtime.lastError = null;
    } finally {
      this.heartbeatRunning = false;
    }
  }

  async pollSyncJobsOnce() {
    if (this.syncRunning) return;
    this.syncRunning = true;

    try {
      const credentials = await this.ensureCredentials();
      const jobs = await this.cloud.fetchSyncJobs(credentials, this.config.cloud.maxSyncJobsPerPoll || 20);

      for (const job of jobs) {
        const device = this.findDeviceForSyncJob(job);
        if (!device) {
          await this.cloud.acknowledgeSyncJob(credentials, job.id, false, 'Managed device not found locally on this edge');
          continue;
        }

        try {
          await executeIntelbrasSync(device, job);
          await this.cloud.acknowledgeSyncJob(credentials, job.id, true);
        } catch (err: any) {
          await this.cloud.acknowledgeSyncJob(credentials, job.id, false, err.message || 'Device sync failed');
        }
      }
      this.runtime.lastSyncAt = new Date().toISOString();
      this.runtime.cloudReachable = true;
      this.runtime.lastError = null;
    } finally {
      this.syncRunning = false;
    }
  }

  async flushEventsOnce() {
    if (this.flushRunning) return;
    this.flushRunning = true;

    try {
      const credentials = await this.ensureCredentials();
      const batch = await this.state.peekEvents(this.config.cloud.maxEventBatchSize || 50);

      if (batch.length === 0) {
        return;
      }

      try {
        await this.cloud.sendEvents(credentials, batch.map((event) => event.payload));
        await this.state.acknowledgeEvents(batch.map((event) => event.id));
        this.runtime.lastFlushAt = new Date().toISOString();
        this.runtime.cloudReachable = true;
        this.runtime.lastError = null;
      } catch {
        await this.state.bumpEventAttempts(batch.map((event) => event.id));
      }
    } finally {
      this.flushRunning = false;
    }
  }

  async refreshLicenseStatus() {
    const credentials = await this.ensureCredentials();
    const snapshot = await this.cloud.fetchLicenseStatus(credentials);
    this.cachedLicense = snapshot;
    this.runtime.lastLicenseRefreshAt = new Date().toISOString();
    this.runtime.cloudReachable = true;
    this.runtime.lastError = null;
    return snapshot;
  }

  async getHealthSnapshot() {
    let license = this.cachedLicense;
    if (this.credentials) {
      try {
        license = await this.refreshLicenseStatus();
      } catch (err: any) {
        this.runtime.cloudReachable = false;
        this.runtime.lastError = err.message || 'Falha ao consultar licenca';
      }
    }

    return {
      status: 'ok',
      connectorName: this.resolveConnectorName(),
      claimed: Boolean(this.credentials),
      managedDevices: this.managedDevices.length,
      spooledEvents: await this.state.getSpoolSize(),
      cloudBaseUrl: this.config.cloud.baseUrl,
      cloudReachable: this.runtime.cloudReachable,
      credentials: this.credentials,
      runtime: this.runtime,
      license,
      autoRegister: this.autoRegister.getSummary(),
      devices: this.managedDevices.map((device) => ({
        name: device.name,
        model: device.model,
        cloudDeviceId: device.cloudDeviceId,
        serialNumber: device.serialNumber,
        localIdentifier: device.localIdentifier,
        ipAddress: device.ipAddress,
        port: device.port || 80,
        transport: device.transport || 'direct',
        autoRegisterDeviceId: device.autoRegister?.deviceId,
      })),
    };
  }

  async handleLocalClaim(payload: { enrollmentToken?: string; force?: boolean }) {
    const credentials = await this.claim(Boolean(payload.force), payload.enrollmentToken);
    return {
      message: 'Edge registrado com sucesso',
      credentials,
    };
  }

  async handleLocalAction(
    action: 'heartbeat' | 'sync-poll' | 'flush-events' | 'simulate-event',
    payload?: Record<string, unknown>,
  ) {
    try {
      if (action === 'heartbeat') {
        await this.sendHeartbeatOnce();
      } else if (action === 'sync-poll') {
        await this.pollSyncJobsOnce();
      } else if (action === 'simulate-event') {
        const result = await this.simulateTestEvent({
          deviceRef: typeof payload?.deviceRef === 'string' ? payload.deviceRef.trim() : undefined,
          userId: typeof payload?.userId === 'string' ? payload.userId.trim() : undefined,
          method: typeof payload?.method === 'string' ? payload.method.trim() : undefined,
          direction: payload?.direction === 'exit' ? 'exit' : 'entry',
          status: payload?.status === 'denied' ? 'denied' : 'granted',
          door: typeof payload?.door === 'number' ? payload.door : undefined,
          cardNo: typeof payload?.cardNo === 'string' ? payload.cardNo.trim() : undefined,
        });

        return {
          action,
          status: 'ok',
          executedAt: new Date().toISOString(),
          ...result,
        };
      } else {
        await this.flushEventsOnce();
      }

      return {
        action,
        status: 'ok',
        executedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      this.runtime.cloudReachable = false;
      this.runtime.lastError = err.message || `Falha na acao ${action}`;
      throw err;
    }
  }

  async run() {
    await this.init();
    await this.ensureCredentials();
    this.autoRegister.start();

    this.server = await startEdgeLocalServer({
      host: this.config.localServer.host || '0.0.0.0',
      port: this.config.localServer.port,
      intakeSecret: this.config.localServer.intakeSecret,
      onIntelbrasEvent: (deviceRef, payload) => this.ingestIntelbrasEvent(deviceRef, payload),
      onAutoRegisterConnect: (payload, context) => this.registerIntelbrasAutoConnect(payload, context),
      onStatus: () => this.getHealthSnapshot(),
      onLicense: async () => ({
        license: await this.refreshLicenseStatus(),
      }),
      onClaim: (payload) => this.handleLocalClaim(payload),
      onAction: (action, payload) => this.handleLocalAction(action, payload),
    });

    await this.sendHeartbeatOnce();
    await this.pollSyncJobsOnce();
    await this.flushEventsOnce();

    this.timers.push(setInterval(() => {
      this.sendHeartbeatOnce().catch((err) => console.error('[EdgeAgent] Heartbeat failed:', err.message));
    }, (this.config.cloud.heartbeatIntervalSec || 30) * 1000));

    this.timers.push(setInterval(() => {
      this.pollSyncJobsOnce().catch((err) => console.error('[EdgeAgent] Sync polling failed:', err.message));
    }, (this.config.cloud.syncPollIntervalSec || 15) * 1000));

    this.timers.push(setInterval(() => {
      this.flushEventsOnce().catch((err) => console.error('[EdgeAgent] Event flush failed:', err.message));
    }, (this.config.cloud.eventFlushIntervalSec || 10) * 1000));
  }

  async stop() {
    this.autoRegister.stop();

    for (const timer of this.timers) {
      clearInterval(timer);
    }
    this.timers = [];

    if (this.server) {
      const server = this.server;
      this.server = null;
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  }
}
