import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

const VALID_PLANS = ['trial', 'starter', 'professional', 'enterprise', 'custom'] as const;

async function auditLog(integratorId: string, profileId: string | undefined, action: string, entityId: string, details?: object, ip?: string) {
  await prisma.auditLog.create({
    data: { integratorId, profileId: profileId ?? null, action, entity: 'license', entityId, details: details ?? {}, ipAddress: ip ?? null },
  }).catch(() => { /* non-fatal */ });
}

// ─── GET /api/my-license — Integrator admin: own license summary ─────────────

router.get('/my-license', requireRole('integrator_admin'), async (req: Request, res: Response) => {
  try {
    const integratorId = req.user!.integratorId;
    if (!integratorId) return res.status(403).json({ message: 'Sem integrador associado' });

    const cfg = await prisma.platformConfig.findUnique({ where: { id: 'singleton' } }).catch(() => null);
    const graceDays = cfg?.licenseGraceDays ?? 12;

    const lic = await prisma.license.findFirst({
      where: {
        integratorId,
        status: { in: ['active', 'trial', 'expiring', 'grace', 'blocked'] },
      },
      include: {
        integrator: {
          select: {
            _count: { select: { schools: { where: { status: 'active' } } } },
          },
        },
      },
      orderBy: { validTo: 'desc' },
    });

    if (!lic) return res.json({ license: null });

    const usedDevices = await prisma.device.count({
      where: { schoolUnit: { school: { integratorId } } },
    });

    const now = new Date();
    const daysLeft = lic.validTo
      ? Math.ceil((lic.validTo.getTime() - now.getTime()) / 86_400_000)
      : null;

    const graceUntil = lic.graceUntil ?? (lic.validTo ? new Date(lic.validTo.getTime() + graceDays * 86_400_000) : null);
    const graceActive = lic.status === 'grace' && graceUntil !== null && now < graceUntil;

    return res.json({
      license: {
        status:        lic.status,
        plan:          lic.plan,
        daysLeft:      daysLeft ?? 0,
        graceActive,
        graceUntil:    graceUntil?.toISOString() ?? null,
        validTo:       lic.validTo?.toISOString() ?? null,
        isExpiringSoon: daysLeft !== null && daysLeft > 0 && daysLeft <= 30,
        usedSchools:   lic.integrator._count.schools,
        maxSchools:    lic.maxSchools,
        usedDevices,
        maxDevices:    lic.maxDevices,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// All routes below require superadmin
router.use(requireRole('superadmin'));

// ─── GET /api/licenses — List all licenses with usage ────────────────────────

router.get('/', async (req: Request, res: Response) => {
  try {
    const licenses = await prisma.license.findMany({
      include: {
        integrator: {
          select: {
            name: true,
            slug: true,
            status: true,
            _count: { select: { schools: { where: { status: 'active' } } } },
          },
        },
      },
      orderBy: { validTo: 'asc' },
    });

    const result = await Promise.all(licenses.map(async (lic) => {
      const usedDevices = await prisma.device.count({
        where: { schoolUnit: { school: { integratorId: lic.integratorId } } },
      });

      const now = new Date();
      const daysLeft = lic.validTo
        ? Math.ceil((lic.validTo.getTime() - now.getTime()) / 86_400_000)
        : null;

      return {
        id:              lic.id,
        integratorId:    lic.integratorId,
        integratorName:  lic.integrator.name,
        integratorSlug:  lic.integrator.slug,
        integratorStatus: lic.integrator.status,
        plan:            lic.plan,
        status:          lic.status,
        maxSchools:      lic.maxSchools,
        usedSchools:     lic.integrator._count.schools,
        maxDevices:      lic.maxDevices,
        usedDevices,
        validFrom:       lic.validFrom,
        validTo:         lic.validTo,
        daysLeft,
        expired:         daysLeft !== null && daysLeft <= 0,
        expiringSoon:    daysLeft !== null && daysLeft > 0 && daysLeft <= 30,
        createdAt:       lic.createdAt,
      };
    }));

    return res.json({ licenses: result });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/licenses/:id — Single license detail ───────────────────────────

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const lic = await prisma.license.findUnique({
      where: { id: req.params.id },
      include: {
        integrator: {
          select: {
            id: true, name: true, slug: true, status: true,
            _count: { select: { schools: { where: { status: 'active' } } } },
          },
        },
      },
    });
    if (!lic) return res.status(404).json({ message: 'Licença não encontrada' });

    const usedDevices = await prisma.device.count({
      where: { schoolUnit: { school: { integratorId: lic.integratorId } } },
    });

    return res.json({
      license: {
        ...lic,
        usedSchools: lic.integrator._count.schools,
        usedDevices,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/licenses — Apply plan to integrator ───────────────────────────
// Creates a new license. Any previous active licenses remain until they expire
// or are manually suspended. Use this to upgrade / add a new period.

router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      integratorId,
      plan,
      maxSchools,
      maxDevices,
      validFrom,
      validTo,
    } = req.body;

    if (!integratorId) return res.status(400).json({ message: '"integratorId" é obrigatório' });
    if (!plan || !VALID_PLANS.includes(plan)) {
      return res.status(400).json({ message: `Plano inválido. Use: ${VALID_PLANS.join(', ')}` });
    }
    if (maxSchools === undefined) return res.status(400).json({ message: '"maxSchools" é obrigatório' });
    if (maxDevices === undefined) return res.status(400).json({ message: '"maxDevices" é obrigatório' });
    if (!validTo)                 return res.status(400).json({ message: '"validTo" é obrigatório' });

    const integrator = await prisma.integrator.findUnique({ where: { id: integratorId } });
    if (!integrator) return res.status(404).json({ message: 'Integrador não encontrado' });

    const now = new Date();
    const licValidFrom = validFrom ? new Date(validFrom) : now;
    const licValidTo   = new Date(validTo);

    const license = await prisma.license.create({
      data: {
        integratorId,
        plan,
        status:     'active',
        maxSchools,
        maxDevices,
        validFrom:  licValidFrom,
        validTo:    licValidTo,
      },
    });

    await auditLog(integratorId, req.user!.profileId, 'license.created', license.id, { plan, maxSchools: license.maxSchools, maxDevices: license.maxDevices }, req.ip);
    return res.status(201).json({ license });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── PUT /api/licenses/:id — Alter plan / limits / dates ─────────────────────

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const {
      plan,
      maxSchools,
      maxDevices,
      validFrom,
      validTo,
      status,
    } = req.body;

    const lic = await prisma.license.findUnique({ where: { id: req.params.id } });
    if (!lic) return res.status(404).json({ message: 'Licença não encontrada' });

    if (plan && !VALID_PLANS.includes(plan)) {
      return res.status(400).json({ message: `Plano inválido. Use: ${VALID_PLANS.join(', ')}` });
    }

    const newMaxSchools = maxSchools;
    const newMaxDevices = maxDevices;

    const validStatuses = ['active', 'suspended', 'expired'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ message: `Status inválido. Use: ${validStatuses.join(', ')}` });
    }

    const updated = await prisma.license.update({
      where: { id: req.params.id },
      data: {
        ...(plan          !== undefined && { plan }),
        ...(newMaxSchools !== undefined && { maxSchools: newMaxSchools }),
        ...(newMaxDevices !== undefined && { maxDevices: newMaxDevices }),
        ...(validFrom     !== undefined && { validFrom: new Date(validFrom) }),
        ...(validTo       !== undefined && { validTo:   new Date(validTo) }),
        ...(status        !== undefined && { status }),
      },
    });

    await auditLog(lic.integratorId, req.user!.profileId, 'license.updated', lic.id, { plan, maxSchools: newMaxSchools, maxDevices: newMaxDevices, validTo, status }, req.ip);
    return res.json({ license: updated });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/licenses/:id/suspend ──────────────────────────────────────────

router.post('/:id/suspend', async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    const lic = await prisma.license.findUnique({ where: { id: req.params.id } });
    if (!lic) return res.status(404).json({ message: 'Licença não encontrada' });
    if (lic.status === 'suspended') return res.status(409).json({ message: 'Licença já está suspensa' });

    await prisma.license.update({ where: { id: lic.id }, data: { status: 'suspended' } });
    await auditLog(lic.integratorId, req.user!.profileId, 'license.suspended', lic.id, { reason }, req.ip);
    return res.json({ message: 'Licença suspensa' });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/licenses/:id/activate ─────────────────────────────────────────

router.post('/:id/activate', async (req: Request, res: Response) => {
  try {
    const lic = await prisma.license.findUnique({ where: { id: req.params.id } });
    if (!lic) return res.status(404).json({ message: 'Licença não encontrada' });
    if (lic.status === 'active') return res.status(409).json({ message: 'Licença já está ativa' });

    if (lic.validTo && new Date(lic.validTo) < new Date()) {
      return res.status(422).json({ message: 'Licença expirada. Atualize a data de validade antes de reativar.' });
    }

    await prisma.license.update({ where: { id: lic.id }, data: { status: 'active' } });
    await auditLog(lic.integratorId, req.user!.profileId, 'license.activated', lic.id, {}, req.ip);
    return res.json({ message: 'Licença reativada' });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/licenses/:id/renew ────────────────────────────────────────────
// Creates a renewal license linked to the current one.
// The new license starts right after the current validTo (or now, whichever is later).

router.post('/:id/renew', async (req: Request, res: Response) => {
  try {
    const { plan, maxSchools, maxDevices, validTo, note } = req.body;
    const lic = await prisma.license.findUnique({ where: { id: req.params.id } });
    if (!lic) return res.status(404).json({ message: 'Licença não encontrada' });
    if (!validTo) return res.status(400).json({ message: '"validTo" é obrigatório para renovação' });

    const now      = new Date();
    const newFrom  = lic.validTo > now ? lic.validTo : now;
    const newTo    = new Date(validTo);
    if (newTo <= newFrom) return res.status(422).json({ message: '"validTo" deve ser posterior à data de início' });

    const cfg = await prisma.platformConfig.findUnique({ where: { id: 'singleton' } }).catch(() => null);
    const graceDays = cfg?.licenseGraceDays ?? 12;
    const graceUntil = new Date(newTo.getTime() + graceDays * 86_400_000);

    const renewal = await prisma.$transaction(async (tx) => {
      const newLic = await tx.license.create({
        data: {
          integratorId:  lic.integratorId,
          plan:          plan ?? lic.plan,
          status:        'active',
          maxSchools:    maxSchools ?? lic.maxSchools,
          maxDevices:    maxDevices ?? lic.maxDevices,
          validFrom:     newFrom,
          validTo:       newTo,
          graceUntil,
          renewedFromId: lic.id,
        },
      });
      // Reactivate integrator if it was blocked/expired due to this license
      await tx.integrator.update({
        where: { id: lic.integratorId },
        data:  { status: 'active' },
      });
      await tx.licenseEvent.create({
        data: {
          licenseId:  newLic.id,
          event:      'renewed',
          prevStatus: null,
          nextStatus: 'active',
          actorId:    req.user!.profileId,
          note:       note ?? `Renewed by ${req.user!.role}`,
          metadata:   { renewedFromId: lic.id },
        },
      });
      return newLic;
    });

    await auditLog(lic.integratorId, req.user!.profileId, 'license.renewed', renewal.id, { renewedFromId: lic.id, validTo }, req.ip);
    return res.status(201).json({ license: renewal });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/licenses/:id/events ────────────────────────────────────────────

router.get('/:id/events', async (req: Request, res: Response) => {
  try {
    const lic = await prisma.license.findUnique({ where: { id: req.params.id } });
    if (!lic) return res.status(404).json({ message: 'Licença não encontrada' });

    const events = await prisma.licenseEvent.findMany({
      where:   { licenseId: lic.id },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ events });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── DELETE /api/licenses/:id ─────────────────────────────────────────────────
// Remove a license. Only allowed if it's expired or suspended and is not the
// only license of the integrator.

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const lic = await prisma.license.findUnique({ where: { id: req.params.id } });
    if (!lic) return res.status(404).json({ message: 'Licença não encontrada' });

    if (lic.status === 'active') {
      return res.status(409).json({ message: 'Não é possível excluir uma licença ativa. Suspenda-a primeiro.' });
    }

    const totalLicenses = await prisma.license.count({ where: { integratorId: lic.integratorId } });
    if (totalLicenses === 1) {
      return res.status(409).json({ message: 'O integrador deve ter ao menos uma licença.' });
    }

    await prisma.license.delete({ where: { id: lic.id } });
    await auditLog(lic.integratorId, req.user!.profileId, 'license.deleted', lic.id, {}, req.ip);
    return res.status(204).send();
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
