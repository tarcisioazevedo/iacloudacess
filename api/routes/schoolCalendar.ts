import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { schoolTenantWhere } from '../middleware/tenant';

const router = Router({ mergeParams: true });
router.use(requireAuth);

// GET /api/schools/:id/calendar — list calendar events for the year
router.get('/calendar', requireRole('school_admin', 'integrator_admin', 'superadmin', 'coordinator'), async (req: Request, res: Response) => {
  try {
    const school = await prisma.school.findFirst({
      where: { id: req.params.id, ...schoolTenantWhere(req.user) },
      select: { id: true },
    });
    if (!school) return res.status(404).json({ message: 'Escola não encontrada' });

    const year = parseInt(String(req.query.year || new Date().getFullYear()), 10);
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year, 11, 31);

    const events = await prisma.schoolCalendarEvent.findMany({
      where: {
        schoolId: school.id,
        eventDate: { gte: startOfYear, lte: endOfYear },
      },
      orderBy: { eventDate: 'asc' },
    });

    return res.json({ events });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// POST /api/schools/:id/calendar — create holiday/recess
router.post('/calendar', requireRole('school_admin', 'integrator_admin', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const school = await prisma.school.findFirst({
      where: { id: req.params.id, ...schoolTenantWhere(req.user) },
      select: { id: true },
    });
    if (!school) return res.status(404).json({ message: 'Escola não encontrada' });

    const { title, eventDate, endDate, eventType } = req.body;
    if (!title || !eventDate) {
      return res.status(400).json({ message: 'title e eventDate são obrigatórios' });
    }

    // If endDate is provided, create one entry per day in the range
    const start = new Date(eventDate);
    const end = endDate ? new Date(endDate) : start;
    const created = [];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const entry = await prisma.schoolCalendarEvent.upsert({
        where: {
          schoolId_eventDate_title: {
            schoolId: school.id,
            eventDate: new Date(d),
            title,
          },
        },
        update: { eventType: eventType || 'holiday' },
        create: {
          schoolId: school.id,
          title,
          eventDate: new Date(d),
          endDate: endDate ? end : null,
          eventType: eventType || 'holiday',
        },
      });
      created.push(entry);
    }

    return res.status(201).json({ created: created.length, events: created });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// DELETE /api/schools/:id/calendar/:eventId
router.delete('/calendar/:eventId', requireRole('school_admin', 'integrator_admin', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const school = await prisma.school.findFirst({
      where: { id: req.params.id, ...schoolTenantWhere(req.user) },
      select: { id: true },
    });
    if (!school) return res.status(404).json({ message: 'Escola não encontrada' });

    await prisma.schoolCalendarEvent.deleteMany({
      where: { id: req.params.eventId, schoolId: school.id },
    });

    return res.json({ message: 'Evento removido' });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// PUT /api/schools/:id/absence-config — configure absence alert settings
router.put('/absence-config', requireRole('school_admin', 'integrator_admin', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const school = await prisma.school.findFirst({
      where: { id: req.params.id, ...schoolTenantWhere(req.user) },
      select: { id: true },
    });
    if (!school) return res.status(404).json({ message: 'Escola não encontrada' });

    const {
      absenceAlertEnabled,
      absenceAlertCutoffTime,
      absenceAlertDays,
      absenceAlertTemplate,
      absenceReportEmail,
    } = req.body;

    // Validate cutoff time format HH:MM
    if (absenceAlertCutoffTime && !/^\d{2}:\d{2}$/.test(absenceAlertCutoffTime)) {
      return res.status(400).json({ message: 'Formato de horário inválido. Use HH:MM (ex: 08:30)' });
    }

    const updated = await prisma.school.update({
      where: { id: school.id },
      data: {
        ...(absenceAlertEnabled !== undefined && { absenceAlertEnabled }),
        ...(absenceAlertCutoffTime && { absenceAlertCutoffTime }),
        ...(absenceAlertDays && { absenceAlertDays }),
        ...(absenceAlertTemplate !== undefined && { absenceAlertTemplate }),
        ...(absenceReportEmail !== undefined && { absenceReportEmail }),
      },
      select: {
        id: true,
        absenceAlertEnabled: true,
        absenceAlertCutoffTime: true,
        absenceAlertDays: true,
        absenceAlertTemplate: true,
        absenceReportEmail: true,
      },
    });

    return res.json({ absenceConfig: updated });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
