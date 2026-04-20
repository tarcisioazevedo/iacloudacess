import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();
router.use(requireAuth);
router.use(requireRole('superadmin'));

// Trial: fixed limits. All other plans are fully manual (no presets).
const TRIAL_MAX_SCHOOLS = 1;
const TRIAL_MAX_DEVICES = 1;
const TRIAL_DAYS        = 7;
const VALID_PLANS       = ['trial', 'starter', 'professional', 'enterprise', 'custom'] as const;

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

async function auditLog(integratorId: string, profileId: string | undefined, action: string, entity: string, entityId: string, details?: object, ip?: string) {
  await prisma.auditLog.create({
    data: { integratorId, profileId: profileId ?? null, action, entity, entityId, details: details ?? {}, ipAddress: ip ?? null },
  }).catch(() => { /* non-fatal */ });
}

// ─── GET /api/integrators ────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  try {
    const integrators = await prisma.integrator.findMany({
      include: {
        _count: {
          select: {
            schools: { where: { status: 'active' } },
            profiles: { where: { isActive: true } },
          },
        },
        licenses: {
          where: { status: 'active' },
          orderBy: { validTo: 'desc' },
          take: 1,
          select: { plan: true, status: true, validTo: true, maxSchools: true, maxDevices: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    const result = await Promise.all(integrators.map(async (intg) => {
      const [totalDevices, totalStudents] = await Promise.all([
        prisma.device.count({ where: { schoolUnit: { school: { integratorId: intg.id } } } }),
        prisma.student.count({ where: { school: { integratorId: intg.id }, status: 'active' } }),
      ]);

      const license = intg.licenses[0] || null;
      return {
        id:                intg.id,
        name:              intg.name,
        slug:              intg.slug,
        status:            intg.status,
        totalSchools:      intg._count.schools,
        totalProfiles:     intg._count.profiles,
        totalDevices,
        totalStudents,
        license:           license ? {
          plan:        license.plan,
          status:      license.status,
          maxSchools:  license.maxSchools,
          maxDevices:  license.maxDevices,
          expiresAt:   license.validTo,
        } : null,
        createdAt: intg.createdAt,
      };
    }));

    return res.json({ integrators: result });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/integrators/:id ─────────────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const intg = await prisma.integrator.findUnique({
      where: { id: req.params.id },
      include: {
        schools:  { select: { id: true, name: true, slug: true, status: true, createdAt: true } },
        licenses: { orderBy: { createdAt: 'desc' } },
        profiles: {
          where: { role: 'integrator_admin' },
          select: { id: true, name: true, email: true, isActive: true, lastLoginAt: true },
        },
        _count: { select: { schools: true, profiles: true, auditLogs: true } },
      },
    });
    if (!intg) return res.status(404).json({ message: 'Integrador não encontrado' });
    return res.json({ integrator: intg });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/integrators — Create tenant ────────────────────────────────────
// Creates integrator + initial license + admin profile in one transaction.

router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      name,
      slug: slugOverride,
      // License
      plan = 'trial',
      maxSchools,
      maxDevices,
      validFrom,
      validTo,
      // Admin profile
      adminEmail,
      adminName,
      adminPassword,
    } = req.body;

    if (!name) return res.status(400).json({ message: '"name" é obrigatório' });
    if (!adminEmail) return res.status(400).json({ message: '"adminEmail" é obrigatório' });
    if (!VALID_PLANS.includes(plan)) {
      return res.status(400).json({ message: `Plano inválido. Use: ${VALID_PLANS.join(', ')}` });
    }

    // Non-trial plans require explicit limits
    if (plan !== 'trial') {
      if (maxSchools === undefined) return res.status(400).json({ message: '"maxSchools" é obrigatório para planos não-trial' });
      if (maxDevices === undefined) return res.status(400).json({ message: '"maxDevices" é obrigatório para planos não-trial' });
      if (!validTo)                 return res.status(400).json({ message: '"validTo" é obrigatório para planos não-trial' });
    }

    const slug = slugOverride ? String(slugOverride).toLowerCase().trim() : generateSlug(name);

    const existing = await prisma.integrator.findUnique({ where: { slug } });
    if (existing) return res.status(409).json({ message: `Slug "${slug}" já está em uso` });

    const existingProfile = await prisma.profile.findUnique({ where: { email: adminEmail } });
    if (existingProfile) return res.status(409).json({ message: `E-mail "${adminEmail}" já está cadastrado` });

    const now = new Date();
    const licValidFrom = validFrom ? new Date(validFrom) : now;
    const licValidTo   = plan === 'trial'
      ? new Date(now.getTime() + TRIAL_DAYS * 86_400_000)
      : new Date(validTo);
    const password     = adminPassword || randomBytes(10).toString('base64url').substring(0, 14);
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await prisma.$transaction(async (tx) => {
      const integrator = await tx.integrator.create({
        data: { name, slug, status: plan === 'trial' ? 'trial' : 'active' },
      });

      const license = await tx.license.create({
        data: {
          integratorId: integrator.id,
          plan,
          status:     'active',
          maxSchools: plan === 'trial' ? TRIAL_MAX_SCHOOLS : maxSchools,
          maxDevices: plan === 'trial' ? TRIAL_MAX_DEVICES : maxDevices,
          validFrom:  licValidFrom,
          validTo:    licValidTo,
        },
      });

      const adminProfile = await tx.profile.create({
        data: {
          email:        adminEmail,
          name:         adminName || `Admin ${name}`,
          passwordHash,
          role:         'integrator_admin',
          integratorId: integrator.id,
        },
      });

      return { integrator, license, adminProfile };
    });

    await auditLog(
      result.integrator.id,
      req.user!.profileId,
      'integrator.created',
      'integrator',
      result.integrator.id,
      { plan, slug },
      req.ip,
    );

    return res.status(201).json({
      integrator:   result.integrator,
      license:      result.license,
      adminProfile: {
        id:    result.adminProfile.id,
        email: result.adminProfile.email,
        name:  result.adminProfile.name,
      },
      // Return generated password only at creation time — never stored in plaintext
      ...(adminPassword ? {} : { generatedPassword: password }),
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── PUT /api/integrators/:id — Update commercial info ────────────────────────

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const {
      name, slug,
      cnpj, tradeName, contactName, contactEmail, contactPhone,
      contractNumber, address, notes,
    } = req.body;

    const intg = await prisma.integrator.findUnique({ where: { id: req.params.id } });
    if (!intg) return res.status(404).json({ message: 'Integrador não encontrado' });

    if (slug && slug !== intg.slug) {
      const conflict = await prisma.integrator.findUnique({ where: { slug } });
      if (conflict) return res.status(409).json({ message: `Slug "${slug}" já está em uso` });
    }

    // CNPJ uniqueness check
    if (cnpj && cnpj !== intg.cnpj) {
      const normalized = cnpj.replace(/\D/g, '');
      const conflict = await prisma.integrator.findFirst({ where: { cnpj: normalized } });
      if (conflict && conflict.id !== intg.id) {
        return res.status(409).json({ message: 'CNPJ já cadastrado para outro integrador' });
      }
    }

    const updated = await prisma.integrator.update({
      where: { id: req.params.id },
      data: {
        ...(name           !== undefined && { name }),
        ...(slug           !== undefined && { slug: String(slug).toLowerCase().trim() }),
        ...(cnpj           !== undefined && { cnpj: cnpj ? cnpj.replace(/\D/g, '') : null }),
        ...(tradeName      !== undefined && { tradeName }),
        ...(contactName    !== undefined && { contactName }),
        ...(contactEmail   !== undefined && { contactEmail }),
        ...(contactPhone   !== undefined && { contactPhone }),
        ...(contractNumber !== undefined && { contractNumber }),
        ...(address        !== undefined && { address }),
        ...(notes          !== undefined && { notes }),
      },
    });

    await auditLog(intg.id, req.user!.profileId, 'integrator.updated', 'integrator', intg.id, { name, slug, cnpj: updated.cnpj }, req.ip);
    return res.json({ integrator: updated });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/integrators/:id/suspend ────────────────────────────────────────
// Suspends the integrator and, optionally, cascades to schools and active license.

router.post('/:id/suspend', async (req: Request, res: Response) => {
  try {
    const { cascadeSchools = false, reason } = req.body;

    const intg = await prisma.integrator.findUnique({ where: { id: req.params.id } });
    if (!intg) return res.status(404).json({ message: 'Integrador não encontrado' });
    if (intg.status === 'suspended') return res.status(409).json({ message: 'Integrador já está suspenso' });

    await prisma.$transaction(async (tx) => {
      await tx.integrator.update({ where: { id: intg.id }, data: { status: 'suspended' } });

      // Suspend active license
      await tx.license.updateMany({
        where: { integratorId: intg.id, status: 'active' },
        data: { status: 'suspended' },
      });

      if (cascadeSchools) {
        await tx.school.updateMany({
          where: { integratorId: intg.id, status: 'active' },
          data: { status: 'suspended' },
        });
      }
    });

    await auditLog(intg.id, req.user!.profileId, 'integrator.suspended', 'integrator', intg.id, { cascadeSchools, reason }, req.ip);
    return res.json({ message: 'Integrador suspenso com sucesso' });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/integrators/:id/activate ───────────────────────────────────────

router.post('/:id/activate', async (req: Request, res: Response) => {
  try {
    const intg = await prisma.integrator.findUnique({
      where: { id: req.params.id },
      include: { licenses: { where: { status: 'suspended' }, orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!intg) return res.status(404).json({ message: 'Integrador não encontrado' });
    if (intg.status === 'active') return res.status(409).json({ message: 'Integrador já está ativo' });

    await prisma.$transaction(async (tx) => {
      await tx.integrator.update({ where: { id: intg.id }, data: { status: 'active' } });

      // Reactivate most recent suspended license (if not expired)
      const suspendedLicense = intg.licenses[0];
      if (suspendedLicense && new Date(suspendedLicense.validTo) > new Date()) {
        await tx.license.update({ where: { id: suspendedLicense.id }, data: { status: 'active' } });
      }
    });

    await auditLog(intg.id, req.user!.profileId, 'integrator.activated', 'integrator', intg.id, {}, req.ip);
    return res.json({ message: 'Integrador reativado com sucesso' });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── DELETE /api/integrators/:id ──────────────────────────────────────────────
// Hard delete — only allowed if integrator has no schools.

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const intg = await prisma.integrator.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { schools: true } } },
    });
    if (!intg) return res.status(404).json({ message: 'Integrador não encontrado' });

    if (intg._count.schools > 0) {
      return res.status(409).json({
        message: `Não é possível excluir: integrador possui ${intg._count.schools} escola(s). Suspenda o integrador ou remova as escolas primeiro.`,
      });
    }

    await prisma.integrator.delete({ where: { id: req.params.id } });
    return res.status(204).send();
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
