/**
 * License Lifecycle Job
 * Runs daily at 01:00. Manages commercial license state machine:
 *
 * active → expiring (30d / 14d / 7d / 3d / 1d warnings)
 *       → expired  (validTo passed)
 *       → grace    (up to licenseGraceDays days after validTo)
 *       → blocked  (graceUntil passed → hard block)
 */

import { prisma } from '../prisma';
import { logger } from '../lib/logger';
import {
  sendLicenseExpiryWarning,
  sendLicenseGraceStarted,
  sendLicenseBlocked,
} from '../services/emailService';

async function getIntegratorContact(integratorId: string) {
  const [profile, integrator] = await Promise.all([
    prisma.profile.findFirst({
      where: { integratorId, role: 'integrator_admin' },
      select: { email: true, name: true },
    }),
    prisma.integrator.findUnique({
      where: { id: integratorId },
      select: { name: true, contactEmail: true, contactName: true },
    }),
  ]);
  return {
    email: profile?.email ?? integrator?.contactEmail ?? null,
    name:  profile?.name ?? integrator?.contactName ?? integrator?.name ?? 'Integrador',
    integratorName: integrator?.name ?? '',
  };
}

async function getGraceDays(): Promise<number> {
  try {
    const cfg = await prisma.platformConfig.findUnique({ where: { id: 'singleton' } });
    return cfg?.licenseGraceDays ?? 12;
  } catch {
    return 12;
  }
}

export async function runLicenseLifecycleJob(): Promise<void> {
  logger.info('[LicenseLifecycle] Starting');
  const now       = new Date();
  const graceDays = await getGraceDays();

  // ── Fetch all non-cancelled, non-trial licenses ──────────────────────────
  const licenses = await prisma.license.findMany({
    where: {
      status:   { notIn: ['cancelled', 'blocked'] },
      plan:     { not: 'trial' },
    },
    include: {
      integrator: {
        select: { id: true, name: true, contactEmail: true, status: true },
      },
    },
  });

  let activated = 0, expiring = 0, expired = 0, graced = 0, blocked = 0;

  for (const lic of licenses) {
    const validTo     = new Date(lic.validTo);
    const daysLeft    = Math.ceil((validTo.getTime() - now.getTime()) / 86_400_000);
    const graceUntil  = lic.graceUntil ?? new Date(validTo.getTime() + graceDays * 86_400_000);

    // ── Hard block: grace period over ─────────────────────────────────────
    if (now > graceUntil && lic.status !== 'blocked') {
      await prisma.$transaction([
        prisma.license.update({
          where: { id: lic.id },
          data:  { status: 'blocked', graceUntil },
        }),
        prisma.integrator.update({
          where: { id: lic.integratorId },
          data:  { status: 'blocked' },
        }),
        prisma.licenseEvent.create({
          data: {
            licenseId:  lic.id,
            event:      'grace_blocked',
            prevStatus: lic.status,
            nextStatus: 'blocked',
            actorId:    'system',
            note:       `Grace period ended (${graceDays} days)`,
          },
        }),
      ]);
      // Send blocked email (non-fatal)
      const contact = await getIntegratorContact(lic.integratorId);
      if (contact.email) {
        sendLicenseBlocked(contact.email, {
          recipientName:   contact.name,
          integratorName:  contact.integratorName,
          plan:            lic.plan,
        }).catch(e => logger.error('[LicenseLifecycle] blocked email failed', { licenseId: lic.id, err: e?.message }));
      }
      blocked++;
      continue;
    }

    // ── Grace period started ──────────────────────────────────────────────
    if (now > validTo && lic.status !== 'grace' && lic.status !== 'blocked') {
      await prisma.$transaction([
        prisma.license.update({
          where: { id: lic.id },
          data:  { status: 'grace', graceUntil },
        }),
        prisma.licenseEvent.create({
          data: {
            licenseId:  lic.id,
            event:      'grace_started',
            prevStatus: lic.status,
            nextStatus: 'grace',
            actorId:    'system',
            note:       `License expired. Grace until ${graceUntil.toISOString().split('T')[0]}`,
            metadata:   { graceUntil: graceUntil.toISOString(), graceDays },
          },
        }),
      ]);
      // Send grace email (non-fatal)
      const contact = await getIntegratorContact(lic.integratorId);
      if (contact.email) {
        sendLicenseGraceStarted(contact.email, {
          recipientName:   contact.name,
          integratorName:  contact.integratorName,
          plan:            lic.plan,
          graceUntil,
        }).catch(e => logger.error('[LicenseLifecycle] grace email failed', { licenseId: lic.id, err: e?.message }));
      }
      graced++;
      continue;
    }

    // ── Expiry warnings (only for active/expiring licenses) ───────────────
    if (['active', 'expiring'].includes(lic.status) && daysLeft > 0) {
      let notifField: string | null = null;
      let eventName:  string | null = null;

      if (daysLeft <= 1  && !lic.notifiedAt1d)  { notifField = 'notifiedAt1d';  eventName = 'expiring_1d';  }
      else if (daysLeft <= 3  && !lic.notifiedAt3d)  { notifField = 'notifiedAt3d';  eventName = 'expiring_3d';  }
      else if (daysLeft <= 7  && !lic.notifiedAt7d)  { notifField = 'notifiedAt7d';  eventName = 'expiring_7d';  }
      else if (daysLeft <= 14 && !lic.notifiedAt14d) { notifField = 'notifiedAt14d'; eventName = 'expiring_14d'; }
      else if (daysLeft <= 30 && !lic.notifiedAt30d) { notifField = 'notifiedAt30d'; eventName = 'expiring_30d'; }

      if (notifField && eventName) {
        const newStatus = lic.status === 'active' ? 'expiring' : lic.status;
        await prisma.$transaction([
          prisma.license.update({
            where: { id: lic.id },
            data: {
              status:        newStatus,
              graceUntil,
              [notifField]:  now,
            },
          }),
          prisma.licenseEvent.create({
            data: {
              licenseId:  lic.id,
              event:      eventName,
              prevStatus: lic.status,
              nextStatus: newStatus,
              actorId:    'system',
              metadata:   { daysLeft, graceUntil: graceUntil.toISOString() },
            },
          }),
        ]);
        // Send expiry warning email (non-fatal)
        const contact = await getIntegratorContact(lic.integratorId);
        if (contact.email) {
          sendLicenseExpiryWarning(contact.email, {
            recipientName:  contact.name,
            integratorName: contact.integratorName,
            plan:           lic.plan,
            daysLeft,
            validTo,
          }).catch(e => logger.error('[LicenseLifecycle] expiry warning email failed', { licenseId: lic.id, err: e?.message }));
        }
        expiring++;
      }
    }

    // ── Reactivate if was expiring but validTo is still in future ─────────
    if (lic.status === 'grace' && now <= validTo) {
      await prisma.license.update({
        where: { id: lic.id },
        data:  { status: 'active' },
      });
      activated++;
    }
  }

  logger.info('[LicenseLifecycle] Done', { activated, expiring, expired, graced, blocked });
}
