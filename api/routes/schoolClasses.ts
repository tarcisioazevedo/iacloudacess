import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { logger } from '../lib/logger';

const router = Router();
router.use(requireAuth);

// Tenant helper
function schoolClassTenantWhere(user: any) {
  if (user?.role === 'superadmin') return {};
  if (user?.integratorId) return { school: { integratorId: user.integratorId } };
  if (user?.schoolId) return { schoolId: user.schoolId };
  throw new Error('Tenant isolation failed');
}

// GET /api/school-classes?schoolId=xxx
router.get('/', async (req: Request, res: Response) => {
  try {
    const filter = schoolClassTenantWhere(req.user);
    const targetSchoolId = req.query.schoolId ? String(req.query.schoolId) : req.user?.schoolId;

    if (!targetSchoolId && req.user?.role !== 'superadmin') {
      return res.status(400).json({ message: 'schoolId is required' });
    }

    const whereClause: any = { ...filter };
    if (targetSchoolId) {
      whereClause.schoolId = targetSchoolId;
    }

    const classes = await prisma.schoolClass.findMany({
      where: whereClause,
      orderBy: [
        { grade: 'asc' },
        { classGroup: 'asc' },
        { shift: 'asc' },
      ],
    });

    return res.json({ classes });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// POST /api/school-classes
router.post('/', requireRole('school_admin', 'integrator_admin', 'superadmin', 'coordinator'), async (req: Request, res: Response) => {
  try {
    const { schoolId, grade, classGroup, shift } = req.body;
    const targetSchoolId = schoolId || req.user?.schoolId;

    if (!targetSchoolId) return res.status(400).json({ message: 'schoolId is required' });
    if (!grade || !classGroup || !shift) return res.status(400).json({ message: 'grade, classGroup and shift are required' });

    // Enforce tenant manually
    if (req.user?.role !== 'superadmin') {
      const schoolScope = req.user?.integratorId
        ? { id: targetSchoolId, integratorId: req.user.integratorId }
        : req.user?.schoolId
          ? { id: req.user.schoolId }
          : null;

      if (!schoolScope) return res.status(403).json({ message: 'Access denied' });
      const school = await prisma.school.findFirst({ where: schoolScope, select: { id: true } });
      if (!school) return res.status(403).json({ message: 'Access denied' });
    }

    const schoolClass = await prisma.schoolClass.create({
      data: {
        schoolId: targetSchoolId,
        grade: grade.trim(),
        classGroup: classGroup.trim(),
        shift: shift.trim().toLowerCase(),
      },
    });

    return res.status(201).json({ schoolClass });
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(409).json({ message: 'Essa turma já está cadastrada' });
    return res.status(500).json({ message: err.message });
  }
});

// DELETE /api/school-classes/:id
router.delete('/:id', requireRole('school_admin', 'integrator_admin', 'superadmin', 'coordinator'), async (req: Request, res: Response) => {
  try {
    const existing = await prisma.schoolClass.findFirst({
      where: { id: req.params.id, ...schoolClassTenantWhere(req.user) },
    });

    if (!existing) return res.status(404).json({ message: 'Turma não encontrada' });

    await prisma.schoolClass.delete({
      where: { id: req.params.id },
    });

    return res.json({ message: 'Turma removida' });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
