import { Queue, Worker } from 'bullmq';
import { prisma } from '../prisma';
import { cleanExpiredAICache } from '../services/aiService';
import { redisGlobal, isRedisAvailable } from '../lib/redis';
import { runLicenseLifecycleJob } from './licenseLifecycle';
import { runTrialLifecycleJob } from './trialLifecycle';
import { runSchoolBillingJob } from './schoolBillingJob';

/**
 * Analytics Aggregation Jobs
 * Hourly: aggregates access_events into analytics_hourly
 * Daily (midnight): rolls up into analytics_daily + attendance_snapshots
 */
export async function startAnalyticsJobs() {
  if (!(await isRedisAvailable())) return;
  const conn = redisGlobal;
  const queue = new Queue('analytics', { connection: conn });

  await queue.upsertJobScheduler('hourly-aggregation', { pattern: '5 * * * *' }, {
    name: 'hourly-aggregation',
    data: { type: 'hourly' },
  });

  await queue.upsertJobScheduler('daily-summary', { pattern: '15 0 * * *' }, {
    name: 'daily-summary',
    data: { type: 'daily' },
  });

  const worker = new Worker('analytics', async (job) => {
    const { type } = job.data;
    if (type === 'hourly') {
      await aggregateHourly();
    } else if (type === 'daily') {
      await aggregateDaily();
      await generateAttendanceSnapshots();
    }
  }, { connection: conn, concurrency: 1 });

  worker.on('completed', (job) => console.log(`[Analytics] Job ${job.name} completed`));
  worker.on('failed', (job, err) => console.error(`[Analytics] Job ${job?.name} failed:`, err.message));

  // Clean expired AI report cache every 30 min (no Redis needed)
  setInterval(() => cleanExpiredAICache().catch(() => {}), 30 * 60_000);

  // ── License / trial / school-billing lifecycle jobs ──────────────────
  const licQueue = new Queue('license-lifecycle', { connection: conn });

  await licQueue.upsertJobScheduler('license-lifecycle-daily', { pattern: '0 1 * * *' }, {
    name: 'license-lifecycle',
    data: { type: 'commercial' },
  });
  await licQueue.upsertJobScheduler('trial-lifecycle-daily', { pattern: '30 1 * * *' }, {
    name: 'trial-lifecycle',
    data: { type: 'trial' },
  });
  await licQueue.upsertJobScheduler('school-billing-daily', { pattern: '0 2 * * *' }, {
    name: 'school-billing',
    data: { type: 'school-billing' },
  });

  const licWorker = new Worker('license-lifecycle', async (job) => {
    const { type } = job.data;
    if (type === 'commercial')     await runLicenseLifecycleJob();
    else if (type === 'trial')     await runTrialLifecycleJob();
    else if (type === 'school-billing') await runSchoolBillingJob();
  }, { connection: conn, concurrency: 1 });

  licWorker.on('failed', (job, err) =>
    console.error(`[LicenseLifecycle] Job ${job?.name} failed:`, err.message));
}

/**
 * Aggregate access events from the previous hour into analytics_hourly
 */
async function aggregateHourly() {
  const now = new Date();
  const bucketHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0);
  const prevHour = new Date(bucketHour.getTime() - 3_600_000);

  const schools = await prisma.school.findMany({
    where: { status: 'active' },
    select: { id: true, integratorId: true },
  });

  for (const school of schools) {
    const [events, devices, notifications] = await Promise.all([
      prisma.accessEvent.findMany({
        where: { schoolId: school.id, occurredAt: { gte: prevHour, lt: bucketHour } },
        select: { direction: true, status: true, studentId: true },
      }),
      prisma.device.findMany({
        where: { schoolUnit: { schoolId: school.id } },
        select: { status: true },
      }),
      prisma.notificationJob.findMany({
        where: { event: { schoolId: school.id }, createdAt: { gte: prevHour, lt: bucketHour } },
        select: { status: true },
      }),
    ]);

    const uniqueStudents = new Set(events.filter(e => e.studentId).map(e => e.studentId)).size;

    const data = {
      schoolId:           school.id,
      integratorId:       school.integratorId,
      bucketHour:         prevHour,
      totalEvents:        events.length,
      entryEvents:        events.filter(e => e.direction === 'entry').length,
      exitEvents:         events.filter(e => e.direction === 'exit').length,
      grantedEvents:      events.filter(e => e.status === 'granted').length,
      deniedEvents:       events.filter(e => e.status === 'denied').length,
      pendingEvents:      events.filter(e => e.status === 'pending_link').length,
      uniqueStudents,
      notificationsSent:   notifications.filter(n => n.status === 'sent').length,
      notificationsFailed: notifications.filter(n => ['failed', 'dead'].includes(n.status)).length,
      devicesOnline:      devices.filter(d => d.status === 'online').length,
      devicesOffline:     devices.filter(d => d.status !== 'online').length,
    };

    await prisma.analyticsHourly.upsert({
      where: { schoolId_bucketHour: { schoolId: school.id, bucketHour: prevHour } },
      create: data,
      update: {
        totalEvents:         data.totalEvents,
        entryEvents:         data.entryEvents,
        exitEvents:          data.exitEvents,
        grantedEvents:       data.grantedEvents,
        deniedEvents:        data.deniedEvents,
        pendingEvents:       data.pendingEvents,
        uniqueStudents:      data.uniqueStudents,
        notificationsSent:   data.notificationsSent,
        notificationsFailed: data.notificationsFailed,
        devicesOnline:       data.devicesOnline,
        devicesOffline:      data.devicesOffline,
      },
    });
  }

  console.log(`[Analytics] Hourly aggregation done for ${schools.length} schools at ${prevHour.toISOString()}`);
}

/**
 * Roll up hourly rows into a daily summary for yesterday
 */
async function aggregateDaily() {
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const today     = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const schools = await prisma.school.findMany({
    where: { status: 'active' },
    select: { id: true, integratorId: true },
  });

  for (const school of schools) {
    const [totalStudents, presentStudents, hourlyRows] = await Promise.all([
      prisma.student.count({ where: { schoolId: school.id, status: 'active' } }),

      // Any event for the day counts the student as present (consistent with real-time cockpit)
      prisma.accessEvent.findMany({
        where: {
          schoolId: school.id,
          occurredAt: { gte: yesterday, lt: today },
          studentId: { not: null },
        },
        distinct: ['studentId'],
        select: { studentId: true },
      }),

      prisma.analyticsHourly.findMany({
        where: { schoolId: school.id, bucketHour: { gte: yesterday, lt: today } },
        select: {
          totalEvents: true, entryEvents: true, exitEvents: true,
          deniedEvents: true, pendingEvents: true,
          notificationsSent: true, notificationsFailed: true,
          bucketHour: true,
        },
      }),
    ]);

    const totalEvents   = hourlyRows.reduce((s, r) => s + r.totalEvents,   0);
    const totalEntries  = hourlyRows.reduce((s, r) => s + r.entryEvents,   0);
    const totalExits    = hourlyRows.reduce((s, r) => s + r.exitEvents,    0);
    const totalDenied   = hourlyRows.reduce((s, r) => s + r.deniedEvents,  0);
    const totalUnlinked = hourlyRows.reduce((s, r) => s + r.pendingEvents, 0);
    const notifSent     = hourlyRows.reduce((s, r) => s + r.notificationsSent,   0);
    const notifFailed   = hourlyRows.reduce((s, r) => s + r.notificationsFailed, 0);
    const notifTotal    = notifSent + notifFailed;

    const peakRow = hourlyRows.reduce<typeof hourlyRows[0] | null>(
      (best, r) => (!best || r.entryEvents > best.entryEvents) ? r : best,
      null,
    );
    const peakHour = peakRow ? peakRow.bucketHour.getHours() : null;

    const attendanceRate = totalStudents > 0
      ? Math.round((presentStudents.length / totalStudents) * 10000) / 100
      : 0;
    const deliveryRate = notifTotal > 0
      ? Math.round((notifSent / notifTotal) * 10000) / 100
      : 100;

    const data = {
      schoolId:              school.id,
      integratorId:          school.integratorId,
      reportDate:            yesterday,
      totalStudentsExpected: totalStudents,
      totalStudentsPresent:  presentStudents.length,
      attendanceRate,
      totalEvents,
      totalEntries,
      totalExits,
      totalDenied,
      totalUnlinked,
      peakHour,
      notificationsTotal:  notifTotal,
      notificationsSent:   notifSent,
      notificationsFailed: notifFailed,
      deliveryRate,
    };

    await prisma.analyticsDaily.upsert({
      where: { schoolId_reportDate: { schoolId: school.id, reportDate: yesterday } },
      create: data,
      update: {
        totalStudentsExpected: data.totalStudentsExpected,
        totalStudentsPresent:  data.totalStudentsPresent,
        attendanceRate:        data.attendanceRate,
        totalEvents:           data.totalEvents,
        totalEntries:          data.totalEntries,
        totalExits:            data.totalExits,
        totalDenied:           data.totalDenied,
        totalUnlinked:         data.totalUnlinked,
        peakHour:              data.peakHour,
        notificationsTotal:    data.notificationsTotal,
        notificationsSent:     data.notificationsSent,
        notificationsFailed:   data.notificationsFailed,
        deliveryRate:          data.deliveryRate,
      },
    });
  }

  console.log(`[Analytics] Daily summary generated for ${schools.length} schools — date: ${yesterday.toISOString().split('T')[0]}`);
}

/**
 * Generate per-student attendance snapshots for yesterday.
 * Uses batch processing (500 students per chunk) to avoid N+1 queries
 * and prevent out-of-memory issues on large schools.
 */
async function generateAttendanceSnapshots() {
  const now       = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const today     = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const CHUNK     = 500;

  let totalProcessed = 0;
  let cursor: string | undefined;

  while (true) {
    // Paginate students in cursor-based chunks to avoid loading all into memory
    const students = await prisma.student.findMany({
      where: { status: 'active' },
      select: { id: true, schoolId: true },
      orderBy: { id: 'asc' },
      take: CHUNK,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    if (students.length === 0) break;
    cursor = students[students.length - 1].id;

    const studentIds = students.map(s => s.id);
    const schoolMap  = new Map(students.map(s => [s.id, s.schoolId]));

    // Single batch query — fetch all events for this chunk at once
    const events = await prisma.accessEvent.findMany({
      where: {
        studentId: { in: studentIds },
        occurredAt: { gte: yesterday, lt: today },
      },
      select: { studentId: true, direction: true, occurredAt: true },
      orderBy: { occurredAt: 'asc' },
    });

    // Group events by studentId in memory (O(n), no extra DB round trips)
    const eventsByStudent = new Map<string, typeof events>();
    for (const ev of events) {
      if (!ev.studentId) continue;
      const arr = eventsByStudent.get(ev.studentId) ?? [];
      arr.push(ev);
      eventsByStudent.set(ev.studentId, arr);
    }

    // Build upsert payload for every student in chunk
    const upserts = students.map(student => {
      const evs        = eventsByStudent.get(student.id) ?? [];
      const firstEntry = evs.find(e => e.direction === 'entry')?.occurredAt ?? null;
      const lastExit   = [...evs].reverse().find(e => e.direction === 'exit')?.occurredAt ?? null;

      return {
        schoolId:     schoolMap.get(student.id)!,
        studentId:    student.id,
        snapshotDate: yesterday,
        present:      evs.length > 0,
        firstEntry,
        lastExit,
        totalEvents:  evs.length,
      };
    });

    // Batch upsert — Prisma doesn't support createMany with conflict resolution
    // so we use Promise.all to parallelise within the chunk (already bounded to 500)
    await Promise.all(
      upserts.map(data =>
        prisma.attendanceSnapshot.upsert({
          where: { studentId_snapshotDate: { studentId: data.studentId, snapshotDate: yesterday } },
          create: data,
          update: {
            present:     data.present,
            firstEntry:  data.firstEntry,
            lastExit:    data.lastExit,
            totalEvents: data.totalEvents,
          },
        })
      )
    );

    totalProcessed += students.length;

    if (students.length < CHUNK) break; // last page
  }

  console.log(`[Analytics] Attendance snapshots generated for ${totalProcessed} students`);
}

/**
 * Device Health Checker — runs every 5 minutes
 */
export async function startDeviceHealthChecker() {
  if (!(await isRedisAvailable())) return;
  const conn = redisGlobal;
  const queue = new Queue('device-health', { connection: conn });

  await queue.upsertJobScheduler('health-check', { pattern: '*/5 * * * *' }, {
    name: 'device-health-check',
    data: {},
  });

  const worker = new Worker('device-health', async () => {
    const fiveMinutesAgo   = new Date(Date.now() - 5  * 60_000);
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60_000);

    const directDevicesToPing = await prisma.device.findMany({
      where: {
        connectivityMode: 'direct',
        OR: [{ lastHeartbeat: { lt: fiveMinutesAgo } }, { lastHeartbeat: null }],
      },
    });

    const { IntelbrasClient } = await import('../services/intelbrasClient');
    const { autoRegisterPresenceService } = await import('../services/autoRegisterPresenceService');

    if (directDevicesToPing.length > 0) {
      console.log(`[DeviceHealth] Pinging ${directDevicesToPing.length} direct devices...`);
      for (const device of directDevicesToPing) {
        if (!device.ipAddress) continue;
        try {
          const client = new IntelbrasClient(device.ipAddress, device.port, device.username, device.passwordEnc || 'admin');
          await client.getDeviceInfo();
          await prisma.device.update({
            where: { id: device.id },
            data: { status: 'online', lastHeartbeat: new Date() },
          });
        } catch {
          // Will fall into unstable/offline buckets below
        }
      }
    }

    // Process AutoRegister Cloud Devices
    const autoRegDevices = await prisma.device.findMany({
      where: { connectionPolicy: 'cloud_autoreg_only' },
      select: { id: true, status: true }
    });

    for (const dev of autoRegDevices) {
      const isConnected = autoRegisterPresenceService.hasSession(dev.id);
      const targetStatus = isConnected ? 'online' : 'offline';
      if (dev.status !== targetStatus) {
        await prisma.device.update({
          where: { id: dev.id },
          data: { status: targetStatus, ...(isConnected ? { lastHeartbeat: new Date() } : {}) }
        });
      }
    }

    // Process non-autoregister devices for unstable/offline fallback
    await prisma.device.updateMany({
      where: {
        status: 'online',
        connectionPolicy: { not: 'cloud_autoreg_only' },
        OR: [{ lastHeartbeat: { lt: fiveMinutesAgo } }, { lastHeartbeat: null }],
      },
      data: { status: 'unstable' },
    });

    await prisma.device.updateMany({
      where: {
        status: { in: ['online', 'unstable'] },
        connectionPolicy: { not: 'cloud_autoreg_only' },
        OR: [{ lastHeartbeat: { lt: thirtyMinutesAgo } }, { lastHeartbeat: null }],
      },
      data: { status: 'offline' },
    });

    const stats = await prisma.device.groupBy({ by: ['status'], _count: true });
    console.log(`[DeviceHealth] Check complete — ${stats.map(s => `${s.status}: ${s._count}`).join(', ')}`);
  }, { connection: conn, concurrency: 1 });

  worker.on('failed', (job, err) => console.error(`[DeviceHealth] Job failed:`, err.message));
}
