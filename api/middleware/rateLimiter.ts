import { Request, Response, NextFunction } from 'express';
import { redisGlobal } from '../lib/redis';

/**
 * Redis-backed rate limiter for multi-replica consistency.
 * Uses atomic INCR + EXPIRE to guarantee accurate counts across all Swarm replicas.
 * Falls back to permissive mode if Redis is unavailable (never blocks legitimate traffic).
 */
interface RateLimitOptions {
  windowMs?: number;     // time window in ms (default: 60s)
  maxRequests?: number;  // max requests per window (default: 100)
  keyFn?: (req: Request) => string;
  message?: string;
}

export function rateLimiter(options: RateLimitOptions = {}) {
  const {
    windowMs = 60_000,
    maxRequests = 100,
    keyFn = (req) => req.ip || req.socket.remoteAddress || 'unknown',
    message = 'Limite de requisições excedido. Tente novamente em breve.',
  } = options;

  const windowSec = Math.ceil(windowMs / 1000);

  return async (req: Request, res: Response, next: NextFunction) => {
    const rawKey = keyFn(req);
    const redisKey = `rl:${rawKey}`;

    try {
      // Atomic increment — works identically across all 3 API replicas
      const count = await redisGlobal.incr(redisKey);

      // Set TTL only on first hit (count === 1)
      if (count === 1) {
        await redisGlobal.expire(redisKey, windowSec);
      }

      // Get remaining TTL for headers
      const ttl = await redisGlobal.ttl(redisKey);
      const remaining = Math.max(0, maxRequests - count);

      res.setHeader('X-RateLimit-Limit', maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', remaining.toString());
      res.setHeader('X-RateLimit-Reset', ttl.toString());

      if (count > maxRequests) {
        res.setHeader('Retry-After', ttl.toString());
        return res.status(429).json({ message });
      }

      next();
    } catch {
      // Redis down → fail-open (don't block legitimate users)
      next();
    }
  };
}

/**
 * Stricter rate limit for auth endpoints
 */
export const authRateLimiter = rateLimiter({
  windowMs: 15 * 60_000,  // 15 minutes
  maxRequests: 20,         // 20 login attempts per 15 min
  keyFn: (req) => `auth:${req.ip || 'unknown'}`,
  message: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
});

/**
 * Rate limit for webhook endpoints (high for devices pushing events)
 */
export const webhookRateLimiter = rateLimiter({
  windowMs: 60_000,
  maxRequests: 300,
  keyFn: (req) => `webhook:${req.ip || 'unknown'}`,
  message: 'Limite de eventos excedido.',
});

/**
 * General API rate limit
 */
export const apiRateLimiter = rateLimiter({
  windowMs: 60_000,
  maxRequests: 120,
  message: 'Limite de requisições excedido.',
});

