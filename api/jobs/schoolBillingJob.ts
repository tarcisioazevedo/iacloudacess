/**
 * School Billing Lifecycle Job
 * Runs daily at 02:00. Manages per-school billing state:
 *
 * ok → warning (billingWarningAt reached) → blocked (billingBlockAt reached)
 * Integrator controls dates via PUT /api/schools/:id/billing-policy
 */

import { prisma } from '../prisma';
import { logger } from '../lib/logger';

export async function runSchoolBillingJob(): Promise<void> {
  logger.info('[SchoolBilling] Starting');
  const now = new Date();

  const schools = await prisma.school.findMany({
    where: {
      billingStatus: { not: null },
      billingBlockAt: { not: null },  // only schools with billing dates set
    },
    select: {
      id: true,
      name: true,
      integratorId: true,
      billingStatus: true,
      billingWarningAt: true,
      billingBlockAt: true,
      billingValidUntil: true,
    },
  });

  let warned = 0, blocked = 0, recovered = 0;

  for (const school of schools) {
    const currentStatus = school.billingStatus ?? 'ok';

    // ── Hard block ───────────────────────────────────────────────────────
    if (school.billingBlockAt && now >= school.billingBlockAt && currentStatus !== 'blocked') {
      await prisma.$transaction([
        prisma.school.update({
          where: { id: school.id },
          data:  {
            billingStatus:    'blocked',
            billingUpdatedAt: now,
            billingUpdatedBy: 'system',
          },
        }),
        prisma.schoolBillingEvent.create({
          data: {
            schoolId:   school.id,
            event:      'blocked',
            prevStatus: currentStatus,
            nextStatus: 'blocked',
            actorId:    'system',
            note:       `Auto-blocked: billingBlockAt reached (${school.billingBlockAt.toISOString().split('T')[0]})`,
          },
        }),
      ]);
      blocked++;
      continue;
    }

    // ── Warning ───────────────────────────────────────────────────────────
    if (school.billingWarningAt && now >= school.billingWarningAt && currentStatus === 'ok') {
      await prisma.$transaction([
        prisma.school.update({
          where: { id: school.id },
          data:  {
            billingStatus:    'warning',
            billingUpdatedAt: now,
            billingUpdatedBy: 'system',
          },
        }),
        prisma.schoolBillingEvent.create({
          data: {
            schoolId:   school.id,
            event:      'warning_sent',
            prevStatus: 'ok',
            nextStatus: 'warning',
            actorId:    'system',
            note:       `Auto-warning: billingWarningAt reached (${school.billingWarningAt.toISOString().split('T')[0]})`,
          },
        }),
      ]);
      warned++;
    }
  }

  logger.info('[SchoolBilling] Done', { warned, blocked, recovered });
}
