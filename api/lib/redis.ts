import IORedis from 'ioredis';
import { logger } from './logger';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const createRedisClient = (name: string, retryForever: boolean = false): IORedis => {
  const client = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    retryStrategy(times) {
      if (!retryForever && times > 5) {
        logger.warn(`[Redis - ${name}] Connection failed after 5 retries. Halting.`);
        return null;
      }
      return Math.min(times * 500, 5000);
    },
    lazyConnect: true,
  });

  client.on('connect', () => logger.debug(`[Redis - ${name}] Connected`));
  client.on('error', (err) => logger.warn(`[Redis - ${name}] Error: ${err.message}`));
  client.on('close', () => logger.warn(`[Redis - ${name}] Connection closed`));
  
  return client;
};

// Singleton para o backend geral (BullMQ Producer, Helpers, etc)
export const redisGlobal = createRedisClient('Global', true);

// Usado pelas ferramentas que precisam esperar disponibilidade
export const isRedisAvailable = async (): Promise<boolean> => {
  try {
    if (redisGlobal.status !== 'ready') {
      await redisGlobal.connect();
    }
    await redisGlobal.ping();
    return true;
  } catch {
    return false;
  }
};
