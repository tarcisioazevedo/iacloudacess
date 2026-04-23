import { Queue } from 'bullmq';
import { prisma } from '../prisma';
import { redisGlobal } from '../lib/redis';

// Create the unified background queue
export const notificationQueue = new Queue('notifications', { connection: redisGlobal });

/**
 * Triggers notification workflow for a processed access event.
 * Creates notification_jobs in DB then fires a fast BullMQ job.
 */
export async function triggerNotification(event: any) {
  // Fetch student with guardians
  if (!event.studentId) return;

  const student = await prisma.student.findUnique({
    where: { id: event.studentId },
    include: {
      school: { select: { id: true, integratorId: true, name: true, allowPhotoNotifications: true, whatsappTemplate: true } },
      guardianLinks: {
        include: { guardian: true },
        where: {
          OR: [
            { notifyEntry: true },
            { notifyExit: true },
          ],
        },
      },
    },
  });

  if (!student || student.guardianLinks.length === 0) return;

  const device = await prisma.device.findUnique({ where: { id: event.deviceId } });

  // Filter guardians based on direction
  const isEntry = event.direction === 'entry';
  const activeGuardians = student.guardianLinks.filter(link =>
    isEntry ? link.notifyEntry : link.notifyExit
  );

  // Create notification jobs in DB
  const jobs = [];
  for (const link of activeGuardians) {
    if (link.whatsappOn && link.guardian.phone) {
      jobs.push({
        eventId: event.id,
        channel: 'whatsapp',
        recipient: link.guardian.phone,
        recipientName: link.guardian.name,
        template: 'access_notification',
        status: 'pending',
      });
    }
    if (link.emailOn && link.guardian.email) {
      jobs.push({
        eventId: event.id,
        channel: 'email',
        recipient: link.guardian.email,
        recipientName: link.guardian.name,
        template: 'access_notification',
        status: 'pending',
      });
    }
  }

  if (jobs.length === 0) return;

  // Bulk instert for DB tracking
  await prisma.notificationJob.createMany({ data: jobs });

  // Push to Redis Queue so the main thread answers the facial controller IMMEDIATELY.
  const payload = {
    eventId: event.id,
    schoolId: student.schoolId,
    integratorId: student.school.integratorId,
    studentName: student.name,
    classGroup: student.classGroup,
    enrollment: student.enrollment,
    schoolName: student.school.name,
    deviceLocation: device?.location || device?.name || '',
    method: event.method,
    direction: event.direction,
    occurredAt: event.occurredAt,
    photoUrl: event.photoPath || null,
    base64Photo: event.base64Photo || null,
    allowPhotoConfig: student.school.allowPhotoNotifications,
    whatsappTemplate: student.school.whatsappTemplate || null,
    guardians: activeGuardians.map(link => ({
      name: link.guardian.name,
      phone: link.guardian.phone,
      email: link.guardian.email,
      whatsappOn: link.whatsappOn,
      emailOn: link.emailOn,
      relation: link.relation,
      allowPhoto: (link as any).allowPhoto || false,
    })),
  };

  try {
    await notificationQueue.add('dispatch_notifications', payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true, // Keep redis clean
    });
  } catch (err: any) {
    console.warn(`[NotificationQueue] Failed to enqueue event: ${err.message}`);
  }
}
