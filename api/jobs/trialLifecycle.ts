/**
 * Trial Lifecycle Job
 * Runs daily at 01:30. Manages trial license state machine:
 *
 * No grace period for trial — hard block immediately on expiry.
 * D-2 and D-1 warning emails.
 * On block: record CNPJ/CPF in blocked_documents table (anti-abuse).
 */

import { prisma } from '../prisma';
import { logger } from '../lib/logger';
import { sendTrialExpiryWarning, sendTrialBlocked } from '../services/emailService';

export async function runTrialLifecycleJob(): Promise<void> {
  logger.info('[TrialLifecycle] Starting');
  const now = new Date();

  // Get trial settings from PlatformConfig
  let trialGraceDays = 0;
  let trialBlockOnExpiry = true;
  try {
    const cfg = await prisma.platformConfig.findUnique({ where: { id: 'singleton' } });
    trialGraceDays     = cfg?.trialGraceDays ?? 0;
    trialBlockOnExpiry = cfg?.trialBlockOnExpiry ?? true;
  } catch { /* use defaults */ }

  const trialLicenses = await prisma.license.findMany({
    where: {
      plan:   'trial',
      status: { notIn: ['blocked', 'cancelled'] },
    },
    include: {
      integrator: {
        select: { id: true, name: true, contactEmail: true, cnpj: true, trialStartedAt: true },
      },
    },
  });

  let warned2d = 0, warned1d = 0, blocked = 0;

  for (const lic of trialLicenses) {
    const validTo  = new Date(lic.validTo);
    const daysLeft = Math.ceil((validTo.getTime() - now.getTime()) / 86_400_000);

    // ── Hard block (no grace for trial) ───────────────────────────────────
    if (now > validTo && trialBlockOnExpiry) {
      await prisma.$transaction(async (tx) => {
        await tx.license.update({
          where: { id: lic.id },
          data:  { status: 'blocked' },
        });
        await tx.integrator.update({
          where: { id: lic.integratorId },
          data:  { status: 'blocked', trialBlockedAt: now },
        });
        await tx.licenseEvent.create({
          data: {
            licenseId:  lic.id,
            event:      'trial_expired_blocked',
            prevStatus: lic.status,
            nextStatus: 'blocked',
            actorId:    'system',
          },
        });

        // Record CNPJ/CPF in blocked_documents to prevent re-registration
        if (lic.integrator.cnpj) {
          const normalized = lic.integrator.cnpj.replace(/\D/g, '');
          await tx.blockedDocument.upsert({
            where:  { document: normalized },
            create: {
              document:     normalized,
              docType:      normalized.length === 14 ? 'cnpj' : 'cpf',
              reason:       'trial_used',
              integratorId: lic.integratorId,
              blockedBy:    'system',
            },
            update: {},
          });
        }
      });
      // Send trial blocked email (non-fatal)
      const adminProfile = await prisma.profile.findFirst({
        where: { integratorId: lic.integratorId, role: 'integrator_admin' },
        select: { email: true, name: true },
      });
      if (adminProfile?.email) {
        sendTrialBlocked(adminProfile.email, {
          recipientName: adminProfile.name ?? lic.integrator.name,
          companyName:   lic.integrator.name,
        }).catch(e => logger.error('[TrialLifecycle] blocked email failed', { licenseId: lic.id, err: e?.message }));
      }
      blocked++;
      continue;
    }

    // ── D-1 warning ───────────────────────────────────────────────────────
    if (daysLeft <= 1 && !lic.notifiedAt1d) {
      await prisma.$transaction([
        prisma.license.update({
          where: { id: lic.id },
          data:  { notifiedAt1d: now },
        }),
        prisma.licenseEvent.create({
          data: {
            licenseId:  lic.id,
            event:      'trial_expiring_1d',
            prevStatus: lic.status,
            nextStatus: lic.status,
            actorId:    'system',
            metadata:   { daysLeft },
          },
        }),
      ]);
      // Send D-1 warning email (non-fatal)
      const adminProfile = await prisma.profile.findFirst({
        where: { integratorId: lic.integratorId, role: 'integrator_admin' },
        select: { email: true, name: true },
      });
      if (adminProfile?.email) {
        sendTrialExpiryWarning(adminProfile.email, {
          recipientName: adminProfile.name ?? lic.integrator.name,
          companyName:   lic.integrator.name,
          daysLeft,
          validTo:       new Date(lic.validTo),
        }).catch(e => logger.error('[TrialLifecycle] D-1 email failed', { licenseId: lic.id, err: e?.message }));
      }
      warned1d++;
    }
    // ── D-2 warning ───────────────────────────────────────────────────────
    else if (daysLeft <= 2 && !lic.notifiedAt3d) {
      await prisma.$transaction([
        prisma.license.update({
          where: { id: lic.id },
          data:  { notifiedAt3d: now }, // reuse notifiedAt3d as D-2 slot for trial
        }),
        prisma.licenseEvent.create({
          data: {
            licenseId:  lic.id,
            event:      'trial_expiring_2d',
            prevStatus: lic.status,
            nextStatus: lic.status,
            actorId:    'system',
            metadata:   { daysLeft },
          },
        }),
      ]);
      // Send D-2 warning email (non-fatal)
      const adminProfile = await prisma.profile.findFirst({
        where: { integratorId: lic.integratorId, role: 'integrator_admin' },
        select: { email: true, name: true },
      });
      if (adminProfile?.email) {
        sendTrialExpiryWarning(adminProfile.email, {
          recipientName: adminProfile.name ?? lic.integrator.name,
          companyName:   lic.integrator.name,
          daysLeft,
          validTo:       new Date(lic.validTo),
        }).catch(e => logger.error('[TrialLifecycle] D-2 email failed', { licenseId: lic.id, err: e?.message }));
      }
      warned2d++;
    }
  }

  logger.info('[TrialLifecycle] Done', { warned2d, warned1d, blocked });
}
