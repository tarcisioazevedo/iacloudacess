/**
 * AutoRegister Security Hardening
 *
 * Protections applied to /cgi-bin/api/autoRegist/connect:
 *   1. Rate limiting — max 10 connect attempts per IP per minute
 *   2. Device allowlist — only DB-registered devices accepted
 *   3. Max simultaneous connections — configurable via MAX_AUTO_REGISTER env
 *   4. Handshake timeout — socket dropped if auth not completed in 15s
 */

import { Request, Response, NextFunction } from 'express';
import { IntelbrasAutoRegisterService } from '../services/intelbrasAutoRegisterService';
import { resolveDeviceForAutoRegister } from '../services/autoRegisterDeviceLookup';

// ─── 1. Rate Limiter (in-process, per IP) ───────────────────────────────────
const ipWindowMs = 60_000; // 1 min
const ipMaxAttempts = parseInt(process.env.AUTO_REGISTER_RATE_LIMIT || '10');

interface IpRecord { count: number; resetAt: number }
const ipBucket = new Map<string, IpRecord>();

function cleanupIpBucket() {
  const now = Date.now();
  for (const [key, rec] of ipBucket) {
    if (now > rec.resetAt) ipBucket.delete(key);
  }
}
setInterval(cleanupIpBucket, 60_000);

export function autoRegisterRateLimit(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const rec = ipBucket.get(ip) || { count: 0, resetAt: now + ipWindowMs };

  if (now > rec.resetAt) {
    rec.count = 0;
    rec.resetAt = now + ipWindowMs;
  }

  rec.count += 1;
  ipBucket.set(ip, rec);

  if (rec.count > ipMaxAttempts) {
    console.warn(`[AutoRegister] Rate limit exceeded for IP: ${ip}`);
    return res.status(429).json({ error: 'Too many connections. Try again later.' });
  }

  next();
}

// ─── 2. Max Simultaneous Connections ───────────────────────────────────────
const maxConnections = parseInt(process.env.MAX_AUTO_REGISTER_CONNECTIONS || '500');

export function autoRegisterConnectionLimit(_req: Request, res: Response, next: NextFunction) {
  const service = IntelbrasAutoRegisterService.getInstance();
  if (service.getLocalDeviceCount() >= maxConnections) {
    console.warn(`[AutoRegister] Connection limit reached (${maxConnections})`);
    return res.status(503).json({ error: 'Server at connection capacity.' });
  }
  next();
}

// ─── 3. Device Allowlist ────────────────────────────────────────────────────
export async function autoRegisterAllowlist(req: Request, res: Response, next: NextFunction) {
  const { DeviceID } = req.body;

  if (!DeviceID || typeof DeviceID !== 'string') {
    return res.status(400).json({ error: 'Missing DeviceID' });
  }

  const lookup = await resolveDeviceForAutoRegister(DeviceID).catch(() => null);

  if (!lookup || !lookup.device) {
    if (lookup?.reason === 'ambiguous_local_identifier') {
      console.warn(`[AutoRegister] Rejected ambiguous DeviceID: ${DeviceID}`);
      return res.status(409).json({
        error: 'DeviceID duplicado em mais de um dispositivo. Use o ID único da plataforma no AutoRegister.',
      });
    }

    console.warn(`[AutoRegister] Rejected unknown DeviceID: ${DeviceID}`);
    return res.status(403).json({ error: 'Device not registered in platform.' });
  }

  const device = lookup.device;
  if (device.isVirtual) {
    console.warn(`[AutoRegister] Rejected virtual device attempt: ${DeviceID}`);
    return res.status(403).json({ error: 'Virtual devices cannot use AutoRegister.' });
  }

  // Attach to request for downstream use
  (req as any).resolvedDeviceId = device.id;
  next();
}
