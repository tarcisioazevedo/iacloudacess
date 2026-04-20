/**
 * School Billing Policy — managed by integrator_admin / superadmin
 *
 * PUT  /api/schools/:id/billing-policy  — set billing dates & note
 * POST /api/schools/:id/billing-action  — block | unblock | clear
 * GET  /api/schools/:id/billing-events  — history log
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router({ mergeParams: true });
router.use(requireAuth);

// ─── PUT /api/schools/:id/billing-policy ─────────────────────────────────────

router.put('/billing-policy', requireRole('integrator_admin', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { billingValidUntil, billingWarningAt, billingBlockAt, billingNote } = req.body;

    const school = await prisma.school.findUnique({ where: { id } });
    if (!school) return res.status(404).json({ message: 'Escola não encontrada' });

    // Integrator admins can only manage their own schools
    if (req.user!.role === 'integrator_admin' && school.integratorId !== req.user!.integratorId) {
      return res.status(403).json({ message: 'Acesso negado' });
    }

    const prevStatus = school.billingStatus ?? 'ok';
    const now = new Date();

    // Determine new status based on dates vs now
    let newStatus = 'ok';
    if (billingBlockAt && new Date(billingBlockAt) <= now) {
      newStatus = 'blocked';
    } else if (billingWarningAt && new Date(billingWarningAt) <= now) {
      newStatus = 'warning';
    }

    const updated = await prisma.school.update({
      where: { id },
      data: {
        billingStatus:     newStatus,
        billingNote:       billingNote ?? school.billingNote,
        billingValidUntil: billingValidUntil ? new Date(billingValidUntil) : school.billingValidUntil,
        billingWarningAt:  billingWarningAt  ? new Date(billingWarningAt)  : school.billingWarningAt,
        billingBlockAt:    billingBlockAt    ? new Date(billingBlockAt)    : school.billingBlockAt,
        billingUpdatedAt:  now,
        billingUpdatedBy:  req.user!.profileId,
      },
    });

    if (newStatus !== prevStatus) {
      await prisma.schoolBillingEvent.create({
        data: {
          schoolId:   id,
          event:      'set_billing',
          prevStatus,
          nextStatus: newStatus,
          actorId:    req.user!.profileId,
          note:       billingNote,
          metadata:   { billingValidUntil, billingWarningAt, billingBlockAt },
        },
      });
    }

    return res.json({ school: updated });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/schools/:id/billing-action ────────────────────────────────────

router.post('/billing-action', requireRole('integrator_admin', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { action, note } = req.body; // action: block | unblock | clear

    const school = await prisma.school.findUnique({ where: { id } });
    if (!school) return res.status(404).json({ message: 'Escola não encontrada' });

    if (req.user!.role === 'integrator_admin' && school.integratorId !== req.user!.integratorId) {
      return res.status(403).json({ message: 'Acesso negado' });
    }

    const prevStatus = school.billingStatus ?? 'ok';
    const now = new Date();
    let newStatus: string;
    let eventName: string;

    if (action === 'block') {
      newStatus = 'blocked';
      eventName = 'blocked';
    } else if (action === 'unblock') {
      newStatus = 'warning';
      eventName = 'unblocked';
    } else if (action === 'clear') {
      newStatus = 'ok';
      eventName = 'renewed';
    } else {
      return res.status(400).json({ message: 'Ação inválida. Use: block | unblock | clear' });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const s = await tx.school.update({
        where: { id },
        data: {
          billingStatus:    newStatus,
          billingUpdatedAt: now,
          billingUpdatedBy: req.user!.profileId,
          ...(action === 'clear' && {
            billingBlockAt:    null,
            billingWarningAt:  null,
            billingValidUntil: null,
            billingNote:       null,
          }),
        },
      });
      await tx.schoolBillingEvent.create({
        data: {
          schoolId:   id,
          event:      eventName,
          prevStatus,
          nextStatus: newStatus,
          actorId:    req.user!.profileId,
          note,
        },
      });
      return s;
    });

    return res.json({ school: updated });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/schools/:id/billing-events ─────────────────────────────────────

router.get('/billing-events', requireRole('integrator_admin', 'superadmin', 'school_admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const school = await prisma.school.findUnique({ where: { id } });
    if (!school) return res.status(404).json({ message: 'Escola não encontrada' });

    // school_admin can only see their own school
    if (req.user!.role === 'school_admin' && school.id !== req.user!.schoolId) {
      return res.status(403).json({ message: 'Acesso negado' });
    }

    const events = await prisma.schoolBillingEvent.findMany({
      where:   { schoolId: id },
      orderBy: { createdAt: 'desc' },
      take:    100,
    });
    return res.json({ events });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
