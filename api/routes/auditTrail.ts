import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { auditLogTenantWhere } from '../middleware/tenant';

const router = Router();
router.use(requireAuth);

/**
 * GET /api/audit-trail
 * Returns paginated audit logs scoped to the caller's tenant.
 * Uses auditLogTenantWhere() which has strict deny fallback for missing integratorId.
 */
router.get('/', requireRole('superadmin', 'integrator_admin', 'integrator_support'), async (req: Request, res: Response) => {
  try {
    const page    = Math.max(1, parseInt(req.query.page  as string) || 1);
    const limit   = Math.min(100, parseInt(req.query.limit as string) || 30);
    const skip    = (page - 1) * limit;
    const entity  = req.query.entity  as string | undefined;
    const action  = req.query.action  as string | undefined;
    const search  = req.query.search  as string | undefined;

    // ─── TENANT ENFORCEMENT ──────────────────────────────────────────────
    // auditLogTenantWhere returns deny_all if integratorId is missing
    const tenantWhere = auditLogTenantWhere(req.user);

    // Superadmin can optionally filter by a specific integrator
    const where: any = { ...tenantWhere };
    if (req.user?.role === 'superadmin' && req.query.integratorId) {
      where.integratorId = req.query.integratorId;
    }

    if (entity)  where.entity = entity;
    if (action)  where.action = { contains: action, mode: 'insensitive' };
    if (search) {
      where.OR = [
        { action:   { contains: search, mode: 'insensitive' } },
        { entity:   { contains: search, mode: 'insensitive' } },
        { entityId: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          integrator: { select: { name: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return res.json({ logs, total, page, pages: Math.ceil(total / limit) });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

/**
 * GET /api/audit-trail/stats
 * Returns aggregated action counts for the last 30 days, tenant-scoped.
 */
router.get('/stats', requireRole('superadmin', 'integrator_admin'), async (req: Request, res: Response) => {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const tenantWhere = auditLogTenantWhere(req.user);

    const where: any = { ...tenantWhere, createdAt: { gte: since } };

    const raw = await prisma.auditLog.groupBy({
      by: ['action'],
      where,
      _count: { action: true },
      orderBy: { _count: { action: 'desc' } },
    });

    return res.json(raw.map(r => ({ action: r.action, count: r._count.action })));
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
