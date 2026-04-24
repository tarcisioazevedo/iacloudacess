import { describe, it, expect } from 'vitest';
import type { AuthUser } from '../api/middleware/auth';
import {
  tenantFilter,
  schoolTenantWhere,
  studentTenantWhere,
  deviceTenantWhere,
  eventTenantWhere,
  guardianTenantWhere,
  auditLogTenantWhere,
  schoolUnitTenantWhere,
  resolveIntegratorId,
} from '../api/middleware/tenant';

// ─── Test Fixtures ──────────────────────────────────────────────────────────

const superadmin: AuthUser = {
  profileId: 'profile-super',
  role: 'superadmin',
  integratorId: null,
  schoolId: null,
};

const integratorAdmin: AuthUser = {
  profileId: 'profile-int-a',
  role: 'integrator_admin',
  integratorId: 'integrator-AAA',
  schoolId: null,
};

const integratorAdminB: AuthUser = {
  profileId: 'profile-int-b',
  role: 'integrator_admin',
  integratorId: 'integrator-BBB',
  schoolId: null,
};

const schoolAdmin: AuthUser = {
  profileId: 'profile-school-a',
  role: 'school_admin',
  integratorId: 'integrator-AAA',
  schoolId: 'school-111',
};

const schoolAdminB: AuthUser = {
  profileId: 'profile-school-b',
  role: 'school_admin',
  integratorId: 'integrator-BBB',
  schoolId: 'school-222',
};

const operator: AuthUser = {
  profileId: 'profile-op',
  role: 'operator',
  integratorId: 'integrator-AAA',
  schoolId: 'school-111',
};

const orphanIntegrator: AuthUser = {
  profileId: 'profile-orphan',
  role: 'integrator_admin',
  integratorId: null, // Missing integrator — must be denied
  schoolId: null,
};

const orphanSchool: AuthUser = {
  profileId: 'profile-orphan-school',
  role: 'school_admin',
  integratorId: null,
  schoolId: null, // Missing school — must be denied
};

// ─── tenantFilter() ─────────────────────────────────────────────────────────

describe('tenantFilter()', () => {
  it('superadmin returns empty filter (sees everything)', () => {
    expect(tenantFilter(superadmin)).toEqual({});
  });

  it('integrator_admin filters by their integratorId', () => {
    expect(tenantFilter(integratorAdmin)).toEqual({ integratorId: 'integrator-AAA' });
  });

  it('school_admin filters by their schoolId', () => {
    expect(tenantFilter(schoolAdmin)).toEqual({ schoolId: 'school-111' });
  });

  it('null user is denied', () => {
    expect(tenantFilter(undefined)).toEqual({ id: '__deny_all__' });
  });

  it('integrator without integratorId is denied', () => {
    expect(tenantFilter(orphanIntegrator)).toEqual({ id: '__deny_all__' });
  });

  it('school_admin without schoolId is denied', () => {
    expect(tenantFilter(orphanSchool)).toEqual({ id: '__deny_all__' });
  });

  it('unknown role is denied', () => {
    const unknown: AuthUser = { profileId: 'x', role: 'hacker', integratorId: null, schoolId: null };
    expect(tenantFilter(unknown)).toEqual({ id: '__deny_all__' });
  });
});

// ─── IDOR: Cross-Tenant Isolation ───────────────────────────────────────────

describe('IDOR — Cross-Tenant Isolation', () => {
  it('school A admin cannot produce filter that includes school B', () => {
    const filterA = studentTenantWhere(schoolAdmin);   // school-111
    const filterB = studentTenantWhere(schoolAdminB);  // school-222
    expect(filterA).toHaveProperty('schoolId', 'school-111');
    expect(filterB).toHaveProperty('schoolId', 'school-222');
    // They must never be equal
    expect(filterA).not.toEqual(filterB);
  });

  it('integrator A cannot see integrator B schools', () => {
    const filterA = schoolTenantWhere(integratorAdmin);   // integrator-AAA
    const filterB = schoolTenantWhere(integratorAdminB);  // integrator-BBB
    expect(filterA).toHaveProperty('integratorId', 'integrator-AAA');
    expect(filterB).toHaveProperty('integratorId', 'integrator-BBB');
    expect(filterA).not.toEqual(filterB);
  });

  it('school_admin event filter is scoped to their school only', () => {
    const filter = eventTenantWhere(schoolAdmin);
    expect(filter).toEqual({ schoolId: 'school-111' });
  });

  it('school_admin device filter is scoped to their school only', () => {
    const filter = deviceTenantWhere(schoolAdmin);
    expect(filter).toEqual({ schoolUnit: { schoolId: 'school-111' } });
  });

  it('operator has same scope as school_admin (school-level)', () => {
    const opFilter = studentTenantWhere(operator);
    const adminFilter = studentTenantWhere(schoolAdmin);
    expect(opFilter).toEqual(adminFilter);
  });
});

// ─── schoolTenantWhere() ────────────────────────────────────────────────────

describe('schoolTenantWhere()', () => {
  it('superadmin has no filter', () => {
    expect(schoolTenantWhere(superadmin)).toEqual({});
  });

  it('integrator scopes to their integratorId', () => {
    expect(schoolTenantWhere(integratorAdmin)).toEqual({ integratorId: 'integrator-AAA' });
  });

  it('school_admin scopes to their own school id', () => {
    expect(schoolTenantWhere(schoolAdmin)).toEqual({ id: 'school-111' });
  });
});

// ─── schoolUnitTenantWhere() ────────────────────────────────────────────────

describe('schoolUnitTenantWhere()', () => {
  it('superadmin has no filter', () => {
    expect(schoolUnitTenantWhere(superadmin)).toEqual({});
  });

  it('integrator scopes via school.integratorId', () => {
    expect(schoolUnitTenantWhere(integratorAdmin)).toEqual({ school: { integratorId: 'integrator-AAA' } });
  });

  it('school_admin scopes to their schoolId', () => {
    expect(schoolUnitTenantWhere(schoolAdmin)).toEqual({ schoolId: 'school-111' });
  });
});

// ─── deviceTenantWhere() ────────────────────────────────────────────────────

describe('deviceTenantWhere()', () => {
  it('integrator scopes via schoolUnit.school.integratorId', () => {
    expect(deviceTenantWhere(integratorAdmin)).toEqual({
      schoolUnit: { school: { integratorId: 'integrator-AAA' } },
    });
  });

  it('school_admin scopes via schoolUnit.schoolId', () => {
    expect(deviceTenantWhere(schoolAdmin)).toEqual({
      schoolUnit: { schoolId: 'school-111' },
    });
  });
});

// ─── guardianTenantWhere() ──────────────────────────────────────────────────

describe('guardianTenantWhere()', () => {
  it('integrator scopes via studentLinks chain', () => {
    expect(guardianTenantWhere(integratorAdmin)).toEqual({
      studentLinks: { some: { student: { school: { integratorId: 'integrator-AAA' } } } },
    });
  });

  it('school_admin scopes via studentLinks.student.schoolId', () => {
    expect(guardianTenantWhere(schoolAdmin)).toEqual({
      studentLinks: { some: { student: { schoolId: 'school-111' } } },
    });
  });
});

// ─── auditLogTenantWhere() ──────────────────────────────────────────────────

describe('auditLogTenantWhere()', () => {
  it('superadmin has no filter', () => {
    expect(auditLogTenantWhere(superadmin)).toEqual({});
  });

  it('integrator scopes to their integratorId', () => {
    expect(auditLogTenantWhere(integratorAdmin)).toEqual({ integratorId: 'integrator-AAA' });
  });

  it('school_admin has NO audit access (deny all)', () => {
    expect(auditLogTenantWhere(schoolAdmin)).toEqual({ id: '__deny_all__' });
  });
});

// ─── resolveIntegratorId() ──────────────────────────────────────────────────

describe('resolveIntegratorId()', () => {
  it('superadmin can specify arbitrary integratorId', () => {
    expect(resolveIntegratorId(superadmin, 'any-integrator')).toBe('any-integrator');
  });

  it('superadmin gets null when no body integratorId', () => {
    expect(resolveIntegratorId(superadmin, null)).toBeNull();
  });

  it('integrator_admin ALWAYS uses their JWT integratorId (ignores body)', () => {
    // Even if body says 'integrator-EVIL', the JWT wins
    expect(resolveIntegratorId(integratorAdmin, 'integrator-EVIL')).toBe('integrator-AAA');
  });

  it('school_admin inherits their integratorId', () => {
    expect(resolveIntegratorId(schoolAdmin, 'anything')).toBe('integrator-AAA');
  });
});
