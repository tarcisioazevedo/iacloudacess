import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../middleware/auth';
import { schoolUnitTenantWhere } from '../middleware/tenant';

const router = Router();
router.use(requireAuth);

// GET /api/school-units — list units/sites with edge and device coverage
router.get('/', async (req: Request, res: Response) => {
  try {
    const units = await prisma.schoolUnit.findMany({
      where: schoolUnitTenantWhere(req.user),
      include: {
        school: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            integratorId: true,
          },
        },
        edgeConnectors: {
          select: {
            id: true,
            name: true,
            status: true,
            lastSeenAt: true,
          },
          orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        },
        _count: {
          select: {
            devices: true,
            edgeConnectors: true,
          },
        },
      },
      orderBy: [
        { school: { name: 'asc' } },
        { name: 'asc' },
      ],
    });

    const result = units.map((unit) => ({
      id: unit.id,
      name: unit.name,
      address: unit.address,
      school: unit.school,
      edgeCount: unit._count.edgeConnectors,
      onlineEdgeCount: unit.edgeConnectors.filter((edge) => edge.status === 'online').length,
      deviceCount: unit._count.devices,
      edges: unit.edgeConnectors,
      requiresEdgeProvisioning: unit._count.edgeConnectors === 0,
      createdAt: unit.createdAt,
    }));

    return res.json({ units: result });
  } catch (err: any) {
    console.error('[SchoolUnits] List error:', err.message);
    return res.status(500).json({ message: err.message });
  }
});

export default router;
