import { Router, Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// ─── Token validation (kiosk auth — no JWT) ───────────────────────────────────

async function validateTVToken(req: Request, res: Response, next: NextFunction) {
  const { accessToken } = req.params;
  if (!accessToken || accessToken.length < 16) {
    return res.status(401).json({ message: 'Token inválido' });
  }

  const config = await prisma.tvPanelConfig.findUnique({
    where: { accessToken },
    include: {
      school: { select: { id: true, name: true, slug: true } },
      unit:   { select: { name: true } },
    },
  });

  if (!config || !config.isActive) {
    return res.status(404).json({ message: 'TV Panel não encontrado ou desativado' });
  }

  (req as any).tvConfig = config;
  next();
}

// ─── Kiosk routes (public — token-based) ─────────────────────────────────────

router.get('/config/:accessToken', validateTVToken, (req: Request, res: Response) => {
  const c = (req as any).tvConfig;

  return res.json({
    displayName:      c.displayName || c.school.name,
    schoolName:       c.school.name,
    schoolSlug:       c.school.slug,
    unitName:         c.unit?.name ?? null,
    schoolId:         c.schoolId,
    logoPath:         c.logoPath,
    welcomeMessage:   c.welcomeMessage,
    themeColor:       c.themeColor,
    showPhoto:        c.showPhoto,
    showClassGroup:   c.showClassGroup,
    showClock:        c.showClock,
    autoHideSeconds:  c.autoHideSeconds,
    maxVisibleCards:  c.maxVisibleCards,
    filterDirection:  c.filterDirection,
    filterShift:      c.filterShift,
  });
});

router.get('/recent/:accessToken', validateTVToken, async (req: Request, res: Response) => {
  const c = (req as any).tvConfig;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [events, totalEntries, distinctPresent, totalStudents] = await Promise.all([
      prisma.accessEvent.findMany({
        where: {
          schoolId:    c.schoolId,
          occurredAt:  { gte: todayStart },
          status:      'granted',
          ...(c.filterDirection ? { direction: c.filterDirection } : {}),
        },
        include: {
          student: {
            select: {
              id: true, name: true, classGroup: true,
              grade: true, shift: true, enrollment: true,
              photo: { select: { storagePath: true } },
            },
          },
          device: { select: { name: true, location: true } },
        },
        orderBy: { occurredAt: 'desc' },
        take: limit,
      }),

      prisma.accessEvent.count({
        where: { schoolId: c.schoolId, occurredAt: { gte: todayStart }, direction: 'entry', status: 'granted' },
      }),

      prisma.accessEvent.findMany({
        where: { schoolId: c.schoolId, occurredAt: { gte: todayStart }, direction: 'entry', status: 'granted', studentId: { not: null } },
        distinct: ['studentId'],
        select: { studentId: true },
      }),

      prisma.student.count({ where: { schoolId: c.schoolId, status: 'active' } }),
    ]);

    const attendanceRate = totalStudents > 0
      ? Math.round((distinctPresent.length / totalStudents) * 1000) / 10
      : 0;

    return res.json({
      events: events.map(e => ({
        id:             e.id,
        studentName:    e.student?.name    || 'Não identificado',
        classGroup:     e.student?.classGroup || '',
        grade:          e.student?.grade   || '',
        shift:          e.student?.shift   || '',
        enrollment:     e.student?.enrollment || '',
        photoPath:      e.student?.photo?.storagePath || null,
        direction:      e.direction,
        status:         e.status,
        method:         e.method,
        deviceLocation: e.device?.location || e.device?.name || '',
        occurredAt:     e.occurredAt,
      })),
      stats: {
        totalEntries,
        studentsPresent: distinctPresent.length,
        totalStudents,
        attendanceRate,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── Management routes (JWT-protected) ───────────────────────────────────────

const ALLOWED_ROLES = ['superadmin', 'integrator_admin', 'school_admin'] as const;

// GET /api/tv/panels — list TV panels for the authenticated school/integrator
router.get(
  '/panels',
  requireAuth,
  requireRole(...ALLOWED_ROLES),
  async (req: Request, res: Response) => {
    const { role, schoolId, integratorId } = req.user!;

    const where = role === 'superadmin'
      ? {}
      : role === 'school_admin'
        ? { schoolId: schoolId! }
        : { school: { integratorId: integratorId! } };

    const panels = await prisma.tvPanelConfig.findMany({
      where,
      include: {
        school: { select: { id: true, name: true } },
        unit:   { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json(panels);
  },
);

// POST /api/tv/panels — create a new TV panel config
router.post(
  '/panels',
  requireAuth,
  requireRole(...ALLOWED_ROLES),
  async (req: Request, res: Response) => {
    const { role, schoolId, integratorId } = req.user!;
    const {
      targetSchoolId, unitId, displayName, welcomeMessage,
      themeColor, showPhoto, showClassGroup, showClock,
      autoHideSeconds, maxVisibleCards, filterDirection, filterShift,
    } = req.body;

    // Determine which school this panel belongs to
    const resolvedSchoolId = role === 'school_admin' ? schoolId! : targetSchoolId;
    if (!resolvedSchoolId) {
      return res.status(400).json({ message: 'schoolId é obrigatório' });
    }

    // Verify school belongs to this integrator (non-superadmin)
    if (role !== 'superadmin' && role !== 'school_admin') {
      const school = await prisma.school.findFirst({
        where: { id: resolvedSchoolId, integratorId: integratorId! },
      });
      if (!school) return res.status(403).json({ message: 'Escola não pertence a este integrador' });
    }

    const accessToken = randomBytes(24).toString('hex');

    const panel = await prisma.tvPanelConfig.create({
      data: {
        schoolId:        resolvedSchoolId,
        unitId:          unitId || null,
        accessToken,
        displayName:     displayName || null,
        welcomeMessage:  welcomeMessage || null,
        themeColor:      themeColor || '#1b4965',
        showPhoto:       showPhoto        ?? true,
        showClassGroup:  showClassGroup   ?? true,
        showClock:       showClock        ?? true,
        autoHideSeconds: autoHideSeconds  ?? 8,
        maxVisibleCards: maxVisibleCards  ?? 6,
        filterDirection: filterDirection  || null,
        filterShift:     filterShift      || null,
      },
      include: {
        school: { select: { id: true, name: true } },
        unit:   { select: { id: true, name: true } },
      },
    });

    return res.status(201).json(panel);
  },
);

// PUT /api/tv/panels/:id — update TV panel config
router.put(
  '/panels/:id',
  requireAuth,
  requireRole(...ALLOWED_ROLES),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { role, schoolId, integratorId } = req.user!;

    const existing = await prisma.tvPanelConfig.findUnique({
      where: { id },
      include: { school: { select: { integratorId: true } } },
    });
    if (!existing) return res.status(404).json({ message: 'TV Panel não encontrado' });

    // Access check
    if (role === 'school_admin' && existing.schoolId !== schoolId) {
      return res.status(403).json({ message: 'Acesso negado' });
    }
    if ((role === 'integrator_admin' || role === 'integrator_support') &&
        existing.school.integratorId !== integratorId) {
      return res.status(403).json({ message: 'Acesso negado' });
    }

    const {
      unitId, displayName, welcomeMessage, themeColor, isActive,
      showPhoto, showClassGroup, showClock,
      autoHideSeconds, maxVisibleCards, filterDirection, filterShift,
    } = req.body;

    const updated = await prisma.tvPanelConfig.update({
      where: { id },
      data: {
        ...(unitId          !== undefined && { unitId: unitId || null }),
        ...(displayName     !== undefined && { displayName }),
        ...(welcomeMessage  !== undefined && { welcomeMessage }),
        ...(themeColor      !== undefined && { themeColor }),
        ...(isActive        !== undefined && { isActive }),
        ...(showPhoto       !== undefined && { showPhoto }),
        ...(showClassGroup  !== undefined && { showClassGroup }),
        ...(showClock       !== undefined && { showClock }),
        ...(autoHideSeconds !== undefined && { autoHideSeconds }),
        ...(maxVisibleCards !== undefined && { maxVisibleCards }),
        ...(filterDirection !== undefined && { filterDirection: filterDirection || null }),
        ...(filterShift     !== undefined && { filterShift: filterShift || null }),
      },
      include: {
        school: { select: { id: true, name: true } },
        unit:   { select: { id: true, name: true } },
      },
    });

    return res.json(updated);
  },
);

// DELETE /api/tv/panels/:id — permanently remove TV panel
router.delete(
  '/panels/:id',
  requireAuth,
  requireRole('superadmin', 'integrator_admin', 'school_admin'),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { role, schoolId, integratorId } = req.user!;

    const existing = await prisma.tvPanelConfig.findUnique({
      where: { id },
      include: { school: { select: { integratorId: true } } },
    });
    if (!existing) return res.status(404).json({ message: 'TV Panel não encontrado' });

    if (role === 'school_admin' && existing.schoolId !== schoolId) {
      return res.status(403).json({ message: 'Acesso negado' });
    }
    if (role === 'integrator_admin' && existing.school.integratorId !== integratorId) {
      return res.status(403).json({ message: 'Acesso negado' });
    }

    await prisma.tvPanelConfig.delete({ where: { id } });
    return res.status(204).send();
  },
);

export default router;
