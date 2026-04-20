import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { deviceTenantWhere } from '../middleware/tenant';
import { prisma } from '../prisma';
import { getOpsHealthDashboard, queryOpsLogs, summarizeOpsLogs } from '../services/opsLogService';

const router = Router();
router.use(requireAuth);

async function resolveAllowedDeviceIds(req: Request, specificDeviceId?: string) {
  const devices = await prisma.device.findMany({
    where: {
      ...deviceTenantWhere(req.user),
      ...(specificDeviceId ? { id: specificDeviceId } : {}),
    },
    select: { id: true },
  });

  return devices.map((device) => device.id);
}

router.get(
  '/',
  requireRole('superadmin', 'integrator_admin', 'integrator_support', 'school_admin', 'coordinator'),
  async (req: Request, res: Response) => {
    try {
      const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId : undefined;
      const allowedDeviceIds = req.user?.role === 'superadmin'
        ? null
        : await resolveAllowedDeviceIds(req, deviceId);

      const data = await queryOpsLogs({
        allowedDeviceIds,
        deviceId,
        level: typeof req.query.level === 'string' ? req.query.level : undefined,
        source: typeof req.query.source === 'string' ? req.query.source : undefined,
        outcome: typeof req.query.outcome === 'string' ? req.query.outcome : undefined,
        requestId: typeof req.query.requestId === 'string' ? req.query.requestId : undefined,
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        page: typeof req.query.page === 'string' ? Number.parseInt(req.query.page, 10) : undefined,
        limit: typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : undefined,
      });

      return res.json(data);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  },
);

router.get(
  '/summary',
  requireRole('superadmin', 'integrator_admin', 'integrator_support', 'school_admin', 'coordinator'),
  async (req: Request, res: Response) => {
    try {
      const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId : undefined;
      const allowedDeviceIds = req.user?.role === 'superadmin'
        ? null
        : await resolveAllowedDeviceIds(req, deviceId);

      const summary = await summarizeOpsLogs({
        allowedDeviceIds,
        deviceId,
        level: typeof req.query.level === 'string' ? req.query.level : undefined,
        source: typeof req.query.source === 'string' ? req.query.source : undefined,
        outcome: typeof req.query.outcome === 'string' ? req.query.outcome : undefined,
        requestId: typeof req.query.requestId === 'string' ? req.query.requestId : undefined,
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
      });

      return res.json(summary);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  },
);

router.get(
  '/health',
  requireRole('superadmin', 'integrator_admin', 'integrator_support', 'school_admin', 'coordinator'),
  async (req: Request, res: Response) => {
    try {
      const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId : undefined;
      const allowedDeviceIds = req.user?.role === 'superadmin'
        ? null
        : await resolveAllowedDeviceIds(req, deviceId);

      const health = await getOpsHealthDashboard({
        allowedDeviceIds,
        deviceId,
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
      });

      return res.json(health);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  },
);

export default router;
