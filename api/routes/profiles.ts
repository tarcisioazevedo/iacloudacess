import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { auditMiddleware } from '../middleware/auditLogger';
import { logger } from '../lib/logger';

const router = Router();
router.use(requireAuth);

// ── Role hierarchy: which roles each requester may create ─────────────────────
const CREATABLE_ROLES: Record<string, string[]> = {
  superadmin:        ['superadmin', 'integrator_admin', 'integrator_support', 'school_admin', 'coordinator', 'operator'],
  integrator_admin:  ['integrator_support', 'school_admin', 'coordinator', 'operator'],
  integrator_support:['school_admin', 'coordinator', 'operator'],
  school_admin:      ['coordinator', 'operator'],
};

function canCreateRole(requesterRole: string, targetRole: string): boolean {
  return (CREATABLE_ROLES[requesterRole] ?? []).includes(targetRole);
}

/**
 * Build a WHERE clause that scopes profiles to the caller's tenant.
 * superadmin → sees all
 * integrator_admin/support → sees own integrator's profiles
 * school_admin/coordinator → sees own school's profiles
 */
function profileTenantWhere(user: Express.Request['user']): object {
  if (!user) return { id: '__deny__' };
  if (user.role === 'superadmin') return {};
  if (['integrator_admin', 'integrator_support'].includes(user.role)) {
    return user.integratorId ? { integratorId: user.integratorId } : { id: '__deny__' };
  }
  if (['school_admin', 'coordinator'].includes(user.role)) {
    return user.schoolId ? { schoolId: user.schoolId } : { id: '__deny__' };
  }
  return { id: '__deny__' };
}

// ── GET /api/profiles — list users scoped to caller's tenant ─────────────────
router.get('/', requireRole('superadmin', 'integrator_admin', 'integrator_support', 'school_admin', 'coordinator'), async (req: Request, res: Response) => {
  try {
    const where: any = { ...profileTenantWhere(req.user) };

    // Optional filters
    if (req.query.role)     where.role     = req.query.role;
    if (req.query.schoolId) where.schoolId = req.query.schoolId;
    if (req.query.active !== undefined) where.isActive = req.query.active !== 'false';

    const profiles = await prisma.profile.findMany({
      where,
      select: {
        id: true, email: true, name: true, role: true,
        integratorId: true, schoolId: true, isActive: true,
        lastLoginAt: true, createdAt: true,
        school:      { select: { name: true } },
        integrator:  { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ profiles });
  } catch (err: any) {
    logger.error('[Profiles] List error', { error: err.message });
    return res.status(500).json({ message: err.message });
  }
});

// ── POST /api/profiles — create a new user ───────────────────────────────────
router.post('/',
  requireRole('superadmin', 'integrator_admin', 'integrator_support', 'school_admin'),
  auditMiddleware('CREATE', 'Profile'),
  async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const { email, name, role, password, schoolId, integratorId: bodyIntegratorId } = req.body;

      if (!email || !name || !role || !password) {
        return res.status(400).json({ message: 'email, nome, role e senha são obrigatórios' });
      }

      // Enforce role hierarchy — can't create a role equal to or above your own
      if (!canCreateRole(user.role, role)) {
        return res.status(403).json({ message: `Você não pode criar usuários com a role "${role}"` });
      }

      // Determine target integratorId and schoolId
      let targetIntegratorId: string | null = null;
      let targetSchoolId: string | null = null;

      if (user.role === 'superadmin') {
        targetIntegratorId = bodyIntegratorId || null;
        targetSchoolId = schoolId || null;
      } else if (['integrator_admin', 'integrator_support'].includes(user.role)) {
        targetIntegratorId = user.integratorId!;
        // Validate that provided schoolId belongs to this integrator
        if (schoolId) {
          const school = await prisma.school.findFirst({
            where: { id: schoolId, integratorId: user.integratorId! },
            select: { id: true },
          });
          if (!school) return res.status(403).json({ message: 'Escola não pertence ao seu integrador' });
          targetSchoolId = schoolId;
        }
      } else if (['school_admin'].includes(user.role)) {
        targetIntegratorId = user.integratorId;
        targetSchoolId = user.schoolId!;
        // school_admin can only create users for their own school
        if (schoolId && schoolId !== user.schoolId) {
          return res.status(403).json({ message: 'Você só pode criar usuários para a sua escola' });
        }
      }

      // School-level roles require a schoolId
      if (['school_admin', 'coordinator', 'operator'].includes(role) && !targetSchoolId) {
        return res.status(400).json({ message: `A role "${role}" requer um schoolId` });
      }

      // Integrator-level roles require an integratorId
      if (['integrator_admin', 'integrator_support'].includes(role) && !targetIntegratorId) {
        return res.status(400).json({ message: `A role "${role}" requer um integratorId` });
      }

      // Check for duplicate email
      const existing = await prisma.profile.findUnique({ where: { email } });
      if (existing) return res.status(409).json({ message: 'E-mail já cadastrado' });

      const passwordHash = await bcrypt.hash(password, 12);

      const profile = await prisma.profile.create({
        data: {
          email,
          name,
          role: role as any,
          passwordHash,
          integratorId: targetIntegratorId,
          schoolId: targetSchoolId,
          isActive: true,
        },
        select: {
          id: true, email: true, name: true, role: true,
          integratorId: true, schoolId: true, isActive: true, createdAt: true,
        },
      });

      logger.info('[Profiles] Created', { profileId: profile.id, role, by: user.role });
      return res.status(201).json({ profile });
    } catch (err: any) {
      logger.error('[Profiles] Create error', { error: err.message });
      return res.status(500).json({ message: err.message });
    }
  }
);

// ── PUT /api/profiles/:id — update a user ────────────────────────────────────
router.put('/:id',
  requireRole('superadmin', 'integrator_admin', 'school_admin'),
  auditMiddleware('UPDATE', 'Profile'),
  async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const { name, isActive, password } = req.body;

      // Must be in the caller's scope
      const existing = await prisma.profile.findFirst({
        where: { id: req.params.id, ...profileTenantWhere(user) },
        select: { id: true, role: true },
      });
      if (!existing) return res.status(404).json({ message: 'Usuário não encontrado ou sem permissão' });

      // Cannot deactivate someone with equal or higher role
      if (isActive === false && !canCreateRole(user.role, existing.role)) {
        return res.status(403).json({ message: 'Sem permissão para desativar este usuário' });
      }

      const data: Record<string, unknown> = {};
      if (name     !== undefined) data.name     = name;
      if (isActive !== undefined) data.isActive = isActive;
      if (password) data.passwordHash = await bcrypt.hash(password, 12);

      const profile = await prisma.profile.update({
        where: { id: req.params.id },
        data,
        select: {
          id: true, email: true, name: true, role: true,
          integratorId: true, schoolId: true, isActive: true,
        },
      });

      return res.json({ profile });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }
);

// ── DELETE /api/profiles/:id — deactivate a user (soft delete) ───────────────
router.delete('/:id',
  requireRole('superadmin', 'integrator_admin', 'school_admin'),
  auditMiddleware('DELETE', 'Profile'),
  async (req: Request, res: Response) => {
    try {
      const user = req.user!;

      const existing = await prisma.profile.findFirst({
        where: { id: req.params.id, ...profileTenantWhere(user) },
        select: { id: true, role: true },
      });
      if (!existing) return res.status(404).json({ message: 'Usuário não encontrado ou sem permissão' });

      if (!canCreateRole(user.role, existing.role)) {
        return res.status(403).json({ message: 'Sem permissão para remover este usuário' });
      }

      // Prevent self-deletion
      if (req.params.id === user.profileId) {
        return res.status(400).json({ message: 'Você não pode remover sua própria conta' });
      }

      await prisma.profile.update({
        where: { id: req.params.id },
        data: { isActive: false },
      });

      return res.json({ message: 'Usuário desativado' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }
);

export default router;
