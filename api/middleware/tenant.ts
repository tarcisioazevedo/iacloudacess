import { Prisma } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';
import type { AuthUser } from './auth';

/**
 * Tenant middleware — extracts integrator/school scope from authenticated user.
 * All downstream Prisma queries use these filters.
 */
export function resolveTenant(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ message: 'Autenticação necessária' });

  // Superadmin can see everything (no filter)
  if (req.user.role === 'superadmin') {
    return next();
  }

  // Integrator roles must have integratorId
  if (['integrator_admin', 'integrator_support'].includes(req.user.role)) {
    if (!req.user.integratorId) {
      return res.status(403).json({ message: 'Perfil sem integrador associado' });
    }
    return next();
  }

  // School roles must have schoolId
  if (['school_admin', 'coordinator', 'operator'].includes(req.user.role)) {
    if (!req.user.schoolId) {
      return res.status(403).json({ message: 'Perfil sem escola associada' });
    }
    return next();
  }

  return res.status(403).json({ message: 'Role não reconhecida' });
}

/**
 * Helper to build Prisma "where" clauses based on tenant scope.
 * Returns a filter object safe for Prisma (never contains null values).
 */
export function tenantFilter(user: Express.Request['user']): Record<string, any> {
  if (!user) return { id: '__deny_all__' };

  if (user.role === 'superadmin') return {};

  if (['integrator_admin', 'integrator_support'].includes(user.role)) {
    if (!user.integratorId) return { id: '__deny_all__' };
    return { integratorId: user.integratorId };
  }

  if (['school_admin', 'coordinator', 'operator'].includes(user.role)) {
    if (!user.schoolId) return { id: '__deny_all__' };
    return { schoolId: user.schoolId };
  }

  return { id: '__deny_all__' };
}

function denyAll<T extends Record<string, unknown>>(field: keyof T & string = 'id' as keyof T & string): Record<string, string> {
  return { [field]: '__deny_all__' };
}

export function schoolUnitTenantWhere(user?: AuthUser): Prisma.SchoolUnitWhereInput {
  if (!user) return denyAll<Prisma.SchoolUnitWhereInput>();
  if (user.role === 'superadmin') return {};
  if (['integrator_admin', 'integrator_support'].includes(user.role)) {
    return user.integratorId
      ? { school: { integratorId: user.integratorId } }
      : denyAll<Prisma.SchoolUnitWhereInput>();
  }
  if (['school_admin', 'coordinator', 'operator'].includes(user.role)) {
    return user.schoolId
      ? { schoolId: user.schoolId }
      : denyAll<Prisma.SchoolUnitWhereInput>();
  }
  return denyAll<Prisma.SchoolUnitWhereInput>();
}

export function schoolTenantWhere(user?: AuthUser): Prisma.SchoolWhereInput {
  if (!user) return denyAll<Prisma.SchoolWhereInput>();
  if (user.role === 'superadmin') return {};
  if (['integrator_admin', 'integrator_support'].includes(user.role)) {
    return user.integratorId
      ? { integratorId: user.integratorId }
      : denyAll<Prisma.SchoolWhereInput>();
  }
  if (['school_admin', 'coordinator', 'operator'].includes(user.role)) {
    return user.schoolId
      ? { id: user.schoolId }
      : denyAll<Prisma.SchoolWhereInput>();
  }
  return denyAll<Prisma.SchoolWhereInput>();
}

export function studentTenantWhere(user?: AuthUser): Prisma.StudentWhereInput {
  if (!user) return denyAll<Prisma.StudentWhereInput>();
  if (user.role === 'superadmin') return {};
  if (['integrator_admin', 'integrator_support'].includes(user.role)) {
    return user.integratorId
      ? { school: { integratorId: user.integratorId } }
      : denyAll<Prisma.StudentWhereInput>();
  }
  if (['school_admin', 'coordinator', 'operator'].includes(user.role)) {
    return user.schoolId
      ? { schoolId: user.schoolId }
      : denyAll<Prisma.StudentWhereInput>();
  }
  return denyAll<Prisma.StudentWhereInput>();
}

export function eventTenantWhere(user?: AuthUser): Prisma.AccessEventWhereInput {
  if (!user) return denyAll<Prisma.AccessEventWhereInput>();
  if (user.role === 'superadmin') return {};
  if (['integrator_admin', 'integrator_support'].includes(user.role)) {
    return user.integratorId
      ? { school: { integratorId: user.integratorId } }
      : denyAll<Prisma.AccessEventWhereInput>();
  }
  if (['school_admin', 'coordinator', 'operator'].includes(user.role)) {
    return user.schoolId
      ? { schoolId: user.schoolId }
      : denyAll<Prisma.AccessEventWhereInput>();
  }
  return denyAll<Prisma.AccessEventWhereInput>();
}

export function deviceTenantWhere(user?: AuthUser): Prisma.DeviceWhereInput {
  if (!user) return denyAll<Prisma.DeviceWhereInput>();
  if (user.role === 'superadmin') return {};
  if (['integrator_admin', 'integrator_support'].includes(user.role)) {
    return user.integratorId
      ? { schoolUnit: { school: { integratorId: user.integratorId } } }
      : denyAll<Prisma.DeviceWhereInput>();
  }
  if (['school_admin', 'coordinator', 'operator'].includes(user.role)) {
    return user.schoolId
      ? { schoolUnit: { schoolId: user.schoolId } }
      : denyAll<Prisma.DeviceWhereInput>();
  }
  return denyAll<Prisma.DeviceWhereInput>();
}

/**
 * Tenant-scoped WHERE for guardians.
 * Guardians are scoped via their studentLinks → student → school chain.
 */
export function guardianTenantWhere(user?: AuthUser): Prisma.GuardianWhereInput {
  if (!user) return denyAll<Prisma.GuardianWhereInput>();
  if (user.role === 'superadmin') return {};
  if (['integrator_admin', 'integrator_support'].includes(user.role)) {
    return user.integratorId
      ? { studentLinks: { some: { student: { school: { integratorId: user.integratorId } } } } }
      : denyAll<Prisma.GuardianWhereInput>();
  }
  if (['school_admin', 'coordinator', 'operator'].includes(user.role)) {
    return user.schoolId
      ? { studentLinks: { some: { student: { schoolId: user.schoolId } } } }
      : denyAll<Prisma.GuardianWhereInput>();
  }
  return denyAll<Prisma.GuardianWhereInput>();
}

/**
 * Tenant-scoped WHERE for audit logs.
 * Always returns a valid integratorId filter — never an empty where for non-superadmin.
 */
export function auditLogTenantWhere(user?: AuthUser): Prisma.AuditLogWhereInput {
  if (!user) return denyAll<Prisma.AuditLogWhereInput>();
  if (user.role === 'superadmin') return {};
  if (['integrator_admin', 'integrator_support'].includes(user.role)) {
    return user.integratorId
      ? { integratorId: user.integratorId }
      : denyAll<Prisma.AuditLogWhereInput>();
  }
  // School-level roles: scope to their school's integrator
  if (['school_admin', 'coordinator', 'operator'].includes(user.role)) {
    return denyAll<Prisma.AuditLogWhereInput>(); // No audit access for school roles
  }
  return denyAll<Prisma.AuditLogWhereInput>();
}

/**
 * Resolve the caller's integratorId — enforcing tenant boundaries.
 * integrator_admin ALWAYS uses their JWT integratorId, never the body's.
 * Only superadmin can specify an arbitrary integratorId.
 */
export function resolveIntegratorId(user: AuthUser, bodyIntegratorId?: string | null): string | null {
  if (user.role === 'superadmin') return bodyIntegratorId || null;
  if (['integrator_admin', 'integrator_support'].includes(user.role)) return user.integratorId;
  // School-level users: inherit from their school (looked up separately)
  return user.integratorId || null;
}

/**
 * Validate that an integrator has capacity under their active license.
 * Returns { ok: true } or { ok: false, message: string }.
 */
export async function validateIntegratorLicense(
  integratorId: string,
  check: 'school' | 'device',
  prismaClient: any,
): Promise<{ ok: boolean; message?: string }> {
  const license = await prismaClient.license.findFirst({
    where: { integratorId, status: 'active' },
    orderBy: { validTo: 'desc' },
    select: { maxSchools: true, maxDevices: true, validTo: true, plan: true },
  });

  if (!license) {
    return { ok: false, message: 'Integrador sem licença ativa. Contate o suporte.' };
  }

  if (new Date(license.validTo) < new Date()) {
    return { ok: false, message: 'Licença expirada. Contate o suporte.' };
  }

  if (check === 'school') {
    const currentCount = await prismaClient.school.count({ where: { integratorId, status: 'active' } });
    if (currentCount >= license.maxSchools) {
      return { ok: false, message: `Limite de escolas atingido (${license.maxSchools}). Upgrade do plano necessário.` };
    }
  }

  if (check === 'device') {
    const currentCount = await prismaClient.device.count({
      where: { schoolUnit: { school: { integratorId } } },
    });
    if (currentCount >= license.maxDevices) {
      return { ok: false, message: `Limite de dispositivos atingido (${license.maxDevices}). Upgrade do plano necessário.` };
    }
  }

  return { ok: true };
}
