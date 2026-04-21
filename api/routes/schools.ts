import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { schoolTenantWhere } from '../middleware/tenant';

const router = Router();
router.use(requireAuth);

// GET /api/schools — List schools with stats
router.get('/', async (req: Request, res: Response) => {
  try {
    const filter = schoolTenantWhere(req.user);
    const schools = await prisma.school.findMany({
      where: filter,
      include: {
        integrator: { select: { id: true, name: true, slug: true } },
        _count: {
          select: {
            students: { where: { status: 'active' } },
            units: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Get device stats per school
    const result = await Promise.all(schools.map(async (school) => {
      const deviceStats = await prisma.device.groupBy({
        by: ['status'],
        where: { schoolUnit: { schoolId: school.id } },
        _count: true,
      });
      const totalDevices = deviceStats.reduce((a, d) => a + d._count, 0);
      const devicesOnline = deviceStats.find(d => d.status === 'online')?._count || 0;

      return {
        id: school.id,
        name: school.name,
        slug: school.slug,
        integratorId: school.integrator.id,
        integratorName: school.integrator.name,
        status: school.status,
        totalStudents: school._count.students,
        totalUnits: school._count.units,
        totalDevices,
        devicesOnline,
        allowPhotoNotifications: school.allowPhotoNotifications,
        createdAt: school.createdAt,
      };
    }));

    return res.json({ schools: result });
  } catch (err: any) {
    console.error('[Schools] List error:', err.message);
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/schools/:id — Get single school details
router.get('/:id', async (req: Request, res: Response) => {
  try {
    // Use explicit AND to prevent the tenant filter's `id` key from silently overriding
    // req.params.id via object spread (would cause school_admin to always see own school).
    const school = await prisma.school.findFirst({
      where: { AND: [{ id: req.params.id }, schoolTenantWhere(req.user)] },
      include: {
        integrator: { select: { name: true, slug: true } },
        units: { include: { devices: true } },
        _count: {
          select: {
            students: true,
            accessEvents: true,
            profiles: true,
          },
        },
      },
    });
    if (!school) return res.status(404).json({ message: 'Escola não encontrada' });
    return res.json({ school });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// PUT /api/schools/:id — Update school config
router.put('/:id', requireRole('superadmin', 'integrator_admin'), async (req: Request, res: Response) => {
  try {
    const { allowPhotoNotifications } = req.body;
    
    const school = await prisma.school.findFirst({
      where: { AND: [{ id: req.params.id }, schoolTenantWhere(req.user)] },
    });

    if (!school) return res.status(404).json({ message: 'Escola não encontrada ou fora do escopo' });

    const updated = await prisma.school.update({
      where: { id: school.id },
      data: {
        ...(allowPhotoNotifications !== undefined && { allowPhotoNotifications }),
      },
    });

    return res.json({ school: updated });
  } catch (err: any) {
    console.error('[Schools] Update error:', err.message);
    return res.status(500).json({ message: err.message });
  }
});

// POST /api/schools — Create a new school
router.post('/', requireRole('superadmin', 'integrator_admin'), async (req: Request, res: Response) => {
  try {
    const { name, slug, integratorId, timezone } = req.body;

    // ─── TENANT ENFORCEMENT ──────────────────────────────────────────────
    // integrator_admin ALWAYS uses their own integratorId from JWT.
    // Only superadmin can specify an arbitrary integratorId.
    const { resolveIntegratorId, validateIntegratorLicense } = await import('../middleware/tenant');
    const targetIntegratorId = resolveIntegratorId(req.user!, integratorId);

    if (!targetIntegratorId) {
      return res.status(400).json({ message: 'integratorId é obrigatório' });
    }
    if (!name) {
      return res.status(400).json({ message: 'name é obrigatório' });
    }

    // ─── LICENSE LIMIT CHECK ─────────────────────────────────────────────
    const licenseCheck = await validateIntegratorLicense(targetIntegratorId, 'school', prisma);
    if (!licenseCheck.ok) {
      return res.status(403).json({ message: licenseCheck.message });
    }

    // ─── INTEGRATOR EXISTS + ACTIVE? ─────────────────────────────────────
    const integrator = await prisma.integrator.findUnique({
      where: { id: targetIntegratorId },
      select: { id: true, status: true },
    });
    if (!integrator) {
      return res.status(404).json({ message: 'Integrador não encontrado' });
    }
    if (integrator.status === 'suspended') {
      return res.status(403).json({ message: 'Integrador suspenso. Não é possível criar escolas.' });
    }

    const autoSlug = slug || name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const school = await prisma.school.create({
      data: { name, slug: autoSlug, integratorId: targetIntegratorId, timezone: timezone || 'America/Sao_Paulo' },
    });

    // Auto-create default unit
    const unit = await prisma.schoolUnit.create({
      data: { schoolId: school.id, name: 'Unidade Principal', address: '' },
    });

    return res.status(201).json({ school, unit });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
