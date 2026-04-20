import {
  keepIntelbrasAutoRegisterAlive,
  openIntelbrasAutoRegisterSession,
} from './intelbrasAdapter';
import type {
  EdgeAutoRegisterConnectPayload,
  EdgeAutoRegisterSessionSnapshot,
  EdgeAutoRegisterSummary,
  EdgeManagedDeviceConfig,
} from './types';

const AUTO_REGISTER_PATH = '/cgi-bin/api/autoRegist/connect';
const DEFAULT_KEEPALIVE_INTERVAL_SEC = 20;
const MAX_KEEPALIVE_FAILURES = 3;
const RECONNECT_GRACE_MS = 90_000;

interface AutoRegisterSessionState {
  device: EdgeManagedDeviceConfig;
  deviceRef: string;
  deviceId: string;
  devClass?: string | null;
  remoteAddress?: string | null;
  serverIp?: string | null;
  status: 'connected' | 'authenticated' | 'degraded' | 'offline';
  token?: string;
  connectedAt: string;
  lastConnectAt: string;
  lastLoginAt?: string | null;
  lastKeepAliveAt?: string | null;
  lastKeepAliveOkAt?: string | null;
  consecutiveKeepAliveFailures: number;
  lastError?: string | null;
  keepAliveIntervalSec: number;
  loginPromise?: Promise<void>;
}

function normalize(value: string | undefined | null): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null;
}

function resolveDeviceRef(device: EdgeManagedDeviceConfig): string {
  return device.cloudDeviceId
    || device.localIdentifier
    || device.serialNumber
    || device.ipAddress;
}

function autoRegisterEnabled(device: EdgeManagedDeviceConfig): boolean {
  return (
    device.transport === 'auto-register'
    || device.transport === 'hybrid'
    || device.autoRegister?.enabled === true
  );
}

export class IntelbrasAutoRegisterGateway {
  private readonly sessions = new Map<string, AutoRegisterSessionState>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly devices: EdgeManagedDeviceConfig[]) {}

  start() {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        console.error('[AutoRegister] Keep-alive cycle failed:', err.message);
      });
    }, 5_000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getListeningPath() {
    return AUTO_REGISTER_PATH;
  }

  getSummary(): EdgeAutoRegisterSummary {
    const sessions = Array.from(this.sessions.values())
      .sort((left, right) => left.deviceRef.localeCompare(right.deviceRef))
      .map((session) => this.toSnapshot(session));

    return {
      enabledDevices: this.devices.filter(autoRegisterEnabled).length,
      activeSessions: sessions.filter((session) => session.tokenActive).length,
      listeningPath: AUTO_REGISTER_PATH,
      sessions,
    };
  }

  getSessionByDevice(device: EdgeManagedDeviceConfig): EdgeAutoRegisterSessionSnapshot | null {
    const deviceRef = resolveDeviceRef(device);
    const session = this.sessions.get(deviceRef);
    return session ? this.toSnapshot(session) : null;
  }

  async handleConnect(
    payload: EdgeAutoRegisterConnectPayload,
    context: { remoteAddress?: string | null },
  ): Promise<EdgeAutoRegisterSessionSnapshot> {
    const device = this.resolveDevice(payload);
    if (!device) {
      throw new Error(`DeviceID ${payload.DeviceID || 'unknown'} is not mapped in the edge configuration`);
    }

    if (!autoRegisterEnabled(device)) {
      throw new Error(`Device ${resolveDeviceRef(device)} is not enabled for AutoRegister transport`);
    }

    const deviceRef = resolveDeviceRef(device);
    const now = new Date().toISOString();
    const existing = this.sessions.get(deviceRef);
    const nextSession: AutoRegisterSessionState = existing || {
      device,
      deviceRef,
      deviceId: payload.DeviceID?.trim() || device.autoRegister?.deviceId || deviceRef,
      status: 'connected',
      token: undefined,
      connectedAt: now,
      lastConnectAt: now,
      consecutiveKeepAliveFailures: 0,
      keepAliveIntervalSec: device.autoRegister?.keepAliveIntervalSec || DEFAULT_KEEPALIVE_INTERVAL_SEC,
    };

    nextSession.device = device;
    nextSession.deviceId = payload.DeviceID?.trim() || nextSession.deviceId;
    nextSession.devClass = payload.DevClass?.trim() || nextSession.devClass || null;
    nextSession.remoteAddress = context.remoteAddress || nextSession.remoteAddress || null;
    nextSession.serverIp = payload.ServerIP?.trim() || nextSession.serverIp || null;
    nextSession.lastConnectAt = now;
    nextSession.status = nextSession.token ? 'authenticated' : 'connected';
    nextSession.lastError = null;
    nextSession.keepAliveIntervalSec = device.autoRegister?.keepAliveIntervalSec || DEFAULT_KEEPALIVE_INTERVAL_SEC;

    this.sessions.set(deviceRef, nextSession);
    void this.ensureAuthenticated(deviceRef);

    return this.toSnapshot(nextSession);
  }

  private resolveDevice(payload: EdgeAutoRegisterConnectPayload): EdgeManagedDeviceConfig | undefined {
    const payloadDeviceId = normalize(payload.DeviceID);
    const payloadServerIp = normalize(payload.ServerIP);

    return this.devices.find((device) => {
      if (!autoRegisterEnabled(device)) {
        return false;
      }

      const candidates = [
        device.autoRegister?.deviceId,
        device.localIdentifier,
        device.serialNumber,
        device.cloudDeviceId,
        device.name,
        device.ipAddress,
      ]
        .map((value) => normalize(value))
        .filter((value): value is string => Boolean(value));

      if (payloadDeviceId && candidates.includes(payloadDeviceId)) {
        return true;
      }

      return Boolean(payloadServerIp && normalize(device.ipAddress) === payloadServerIp);
    });
  }

  private async ensureAuthenticated(deviceRef: string): Promise<void> {
    const session = this.sessions.get(deviceRef);
    if (!session) {
      return;
    }

    if (session.loginPromise) {
      await session.loginPromise;
      return;
    }

    session.loginPromise = (async () => {
      try {
        const token = await openIntelbrasAutoRegisterSession(session.device);
        const now = new Date().toISOString();
        session.token = token;
        session.status = 'authenticated';
        session.lastLoginAt = now;
        session.lastKeepAliveOkAt = now;
        session.consecutiveKeepAliveFailures = 0;
        session.lastError = null;
      } catch (err: any) {
        session.status = 'degraded';
        session.lastError = err.message || 'AutoRegister login failed';
      } finally {
        session.loginPromise = undefined;
      }
    })();

    await session.loginPromise;
  }

  private async tick() {
    for (const [deviceRef, session] of this.sessions.entries()) {
      if (!session.token) {
        const lastConnectAt = new Date(session.lastConnectAt).getTime();
        if (Date.now() - lastConnectAt > RECONNECT_GRACE_MS) {
          session.status = 'offline';
        } else {
          await this.ensureAuthenticated(deviceRef);
        }
        continue;
      }

      const lastBase = session.lastKeepAliveAt || session.lastLoginAt || session.lastConnectAt;
      const shouldPing = Date.now() - new Date(lastBase).getTime() >= session.keepAliveIntervalSec * 1000;
      if (!shouldPing) {
        continue;
      }

      session.lastKeepAliveAt = new Date().toISOString();

      try {
        await keepIntelbrasAutoRegisterAlive(session.device, session.token);
        session.status = 'authenticated';
        session.lastKeepAliveOkAt = new Date().toISOString();
        session.consecutiveKeepAliveFailures = 0;
        session.lastError = null;
      } catch (err: any) {
        session.consecutiveKeepAliveFailures += 1;
        session.status = 'degraded';
        session.lastError = err.message || 'AutoRegister keep-alive failed';

        if (session.consecutiveKeepAliveFailures >= MAX_KEEPALIVE_FAILURES) {
          session.token = undefined;
          session.status = 'connected';
          session.lastError = 'Session token expired, waiting for new connect or relogin';
        }
      }
    }
  }

  private toSnapshot(session: AutoRegisterSessionState): EdgeAutoRegisterSessionSnapshot {
    return {
      deviceName: session.device.name || session.device.localIdentifier || session.device.ipAddress,
      deviceRef: session.deviceRef,
      deviceId: session.deviceId,
      ipAddress: session.device.ipAddress,
      devClass: session.devClass || null,
      remoteAddress: session.remoteAddress || null,
      serverIp: session.serverIp || null,
      transport: session.device.transport || 'direct',
      status: session.status,
      tokenActive: Boolean(session.token),
      connectedAt: session.connectedAt,
      lastConnectAt: session.lastConnectAt,
      lastLoginAt: session.lastLoginAt || null,
      lastKeepAliveAt: session.lastKeepAliveAt || null,
      lastKeepAliveOkAt: session.lastKeepAliveOkAt || null,
      keepAliveIntervalSec: session.keepAliveIntervalSec,
      consecutiveKeepAliveFailures: session.consecutiveKeepAliveFailures,
      lastError: session.lastError || null,
    };
  }
}
