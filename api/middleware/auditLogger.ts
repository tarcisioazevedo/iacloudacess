import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';

/**
 * Persists an audit record to the audit_logs table.
 * Safe to call without await in fire-and-forget fashion.
 */
export async function writeAudit(params: {
  req: Request;
  action: string;
  entity: string;
  entityId?: string;
  details?: Record<string, unknown>;
}) {
  try {
    const user = (params.req as any).user;
    if (!user?.integratorId) return; // Anonymous / no tenant context

    await prisma.auditLog.create({
      data: {
        integratorId: user.integratorId,
        profileId:    user.id ?? null,
        action:       params.action,
        entity:       params.entity,
        entityId:     params.entityId ?? null,
        details:      params.details
          ? (params.details as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        ipAddress:    params.req.ip ?? null,
      },
    });
  } catch (_) {
    // Never crash the request because of an audit write failure
  }
}

/**
 * Express middleware factory — auto-logs POST/PUT/PATCH/DELETE
 * responses once they are finished.
 *
 * Usage:  router.post('/students', auditMiddleware('CREATE', 'Student'), handler)
 */
export function auditMiddleware(action: string, entity: string) {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.on('finish', () => {
      // Only log mutating methods with successful status codes
      const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(_req.method);
      const isSuccess  = res.statusCode >= 200 && res.statusCode < 300;
      if (!isMutation || !isSuccess) return;

      void writeAudit({
        req: _req,
        action,
        entity,
        details: { method: _req.method, path: _req.path, status: res.statusCode },
      });
    });
    next();
  };
}
