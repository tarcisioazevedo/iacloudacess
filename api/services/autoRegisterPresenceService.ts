import type IORedis from 'ioredis';
import { logger } from '../lib/logger';
import { redisGlobal } from '../lib/redis';

export interface AutoRegisterSessionPresence {
  deviceId: string;
  deviceDbId: string;
  gatewayInstanceId: string;
  gatewayHostname: string;
  devClass: string;
  serverIp: string;
  status: 'connected' | 'authenticated';
  tokenReady: boolean;
  connectedAt: string;
  lastSeenAt: string;
}

type PresenceEvent =
  | { type: 'upsert'; session: AutoRegisterSessionPresence }
  | { type: 'remove'; deviceId: string };

class AutoRegisterPresenceService {
  private readonly cache = new Map<string, AutoRegisterSessionPresence>();
  private subscriber: IORedis | null = null;
  private started = false;
  private readonly channel = 'autoreg:sessions';
  private readonly keyPrefix = 'autoreg:session:';
  private readonly ttlSeconds = parseInt(process.env.AUTOREG_SESSION_TTL_SECONDS || '90', 10);
  private readonly instanceId = process.env.AUTOREG_INSTANCE_ID || `${process.env.HOSTNAME || 'local'}:${process.pid}`;
  private refreshTimer: NodeJS.Timeout | null = null;

  getGatewayInstanceId() {
    return this.instanceId;
  }

  hasSession(deviceId: string) {
    return this.cache.has(deviceId);
  }

  getSession(deviceId: string) {
    return this.cache.get(deviceId) || null;
  }

  getActiveDeviceIds() {
    return Array.from(this.cache.keys());
  }

  getActiveCount() {
    return this.cache.size;
  }

  async start() {
    if (this.started) {
      return;
    }

    this.started = true;

    try {
      if (redisGlobal.status !== 'ready') {
        await redisGlobal.connect();
      }

      this.subscriber = redisGlobal.duplicate();
      if (this.subscriber.status !== 'ready') {
        await this.subscriber.connect();
      }

      await this.refreshSnapshot();

      await this.subscriber.subscribe(this.channel);
      this.subscriber.on('message', (_channel, message) => {
        this.handlePresenceMessage(message);
      });

      this.refreshTimer = setInterval(() => {
        void this.refreshSnapshot().catch((err: any) => {
          logger.warn('AutoRegister presence snapshot refresh failed', {
            error: err.message,
          });
        });
      }, 60_000);

      logger.info('AutoRegister presence service started', {
        instanceId: this.instanceId,
        cachedSessions: this.cache.size,
      });
    } catch (err: any) {
      this.started = false;
      if (this.subscriber) {
        await this.subscriber.quit().catch(() => undefined);
        this.subscriber = null;
      }
      logger.warn('AutoRegister presence service failed to start', {
        error: err.message,
        instanceId: this.instanceId,
      });
    }
  }

  async stop() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    if (this.subscriber) {
      await this.subscriber.quit().catch(() => undefined);
      this.subscriber = null;
    }

    this.started = false;
  }

  async upsertSession(session: AutoRegisterSessionPresence) {
    this.cache.set(session.deviceId, session);
    await this.writeSession(session);
    await this.publish({
      type: 'upsert',
      session,
    });
  }

  async touchSession(
    deviceId: string,
    patch: Partial<Omit<AutoRegisterSessionPresence, 'deviceId' | 'deviceDbId'>>,
  ) {
    const existing = this.cache.get(deviceId);
    if (!existing) {
      return;
    }

    const nextSession: AutoRegisterSessionPresence = {
      ...existing,
      ...patch,
      lastSeenAt: patch.lastSeenAt || new Date().toISOString(),
    };

    await this.upsertSession(nextSession);
  }

  async removeSession(deviceId: string) {
    this.cache.delete(deviceId);

    try {
      if (redisGlobal.status !== 'ready') {
        await redisGlobal.connect();
      }
      await redisGlobal.del(this.sessionKey(deviceId));
    } catch (err: any) {
      logger.warn('Failed to delete AutoRegister presence key', {
        deviceId,
        error: err.message,
      });
    }

    await this.publish({
      type: 'remove',
      deviceId,
    });
  }

  private async writeSession(session: AutoRegisterSessionPresence) {
    try {
      if (redisGlobal.status !== 'ready') {
        await redisGlobal.connect();
      }
      await redisGlobal.set(
        this.sessionKey(session.deviceId),
        JSON.stringify(session),
        'EX',
        this.ttlSeconds,
      );
    } catch (err: any) {
      logger.warn('Failed to persist AutoRegister presence session', {
        deviceId: session.deviceId,
        error: err.message,
      });
    }
  }

  private async publish(event: PresenceEvent) {
    try {
      if (redisGlobal.status !== 'ready') {
        await redisGlobal.connect();
      }
      await redisGlobal.publish(this.channel, JSON.stringify(event));
    } catch (err: any) {
      logger.warn('Failed to publish AutoRegister presence event', {
        error: err.message,
      });
    }
  }

  private handlePresenceMessage(message: string) {
    try {
      const event = JSON.parse(message) as PresenceEvent;
      if (event.type === 'upsert') {
        this.cache.set(event.session.deviceId, event.session);
        return;
      }

      if (event.type === 'remove') {
        this.cache.delete(event.deviceId);
      }
    } catch (err: any) {
      logger.warn('Invalid AutoRegister presence event ignored', {
        error: err.message,
      });
    }
  }

  private async refreshSnapshot() {
    if (redisGlobal.status !== 'ready') {
      await redisGlobal.connect();
    }

    const keys = await this.scanSessionKeys();
    if (keys.length === 0) {
      this.cache.clear();
      return;
    }

    const values = await redisGlobal.mget(...keys);
    const nextCache = new Map<string, AutoRegisterSessionPresence>();

    for (const raw of values) {
      if (!raw) {
        continue;
      }

      try {
        const session = JSON.parse(raw) as AutoRegisterSessionPresence;
        nextCache.set(session.deviceId, session);
      } catch {
        // Ignore malformed cache entry
      }
    }

    this.cache.clear();
    for (const [deviceId, session] of nextCache) {
      this.cache.set(deviceId, session);
    }
  }

  private async scanSessionKeys() {
    let cursor = '0';
    const keys: string[] = [];

    do {
      const [nextCursor, batch] = await redisGlobal.scan(
        cursor,
        'MATCH',
        `${this.keyPrefix}*`,
        'COUNT',
        '200',
      );
      cursor = nextCursor;
      keys.push(...batch);
    } while (cursor !== '0');

    return keys;
  }

  private sessionKey(deviceId: string) {
    return `${this.keyPrefix}${deviceId}`;
  }
}

export const autoRegisterPresenceService = new AutoRegisterPresenceService();
