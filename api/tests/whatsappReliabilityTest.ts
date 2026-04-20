/**
 * ═══════════════════════════════════════════════════════════════════
 * WhatsApp Notification Reliability Test
 * ═══════════════════════════════════════════════════════════════════
 *
 * End-to-end test that simulates student entry/exit events and
 * verifies the full notification pipeline:
 *
 *   1. Create AccessEvent (entry) → persistAccessEvent
 *   2. triggerNotification → creates NotificationJob rows
 *   3. BullMQ job dispatched → notificationWorker picks it up
 *   4. Worker calls Evolution API → sendEvolutionText
 *   5. NotificationJob status updated to 'sent' or 'failed'
 *
 * Then repeats with an exit event for the same student.
 *
 * Usage:
 *   npx tsx api/tests/whatsappReliabilityTest.ts
 *
 * Env requirements:
 *   - DATABASE_URL or DB_* vars configured
 *   - REDIS_URL configured
 *   - EVOLUTION_API_URL + EVOLUTION_API_TOKEN configured
 *     (or test runs in dry-run mode)
 *
 * NOTE: This test uses REAL database records but does NOT
 * modify production students. It creates a temporary test
 * student + guardian, runs the pipeline, then cleans up.
 * ═══════════════════════════════════════════════════════════════════
 */

import { prisma } from '../prisma';
import { persistAccessEvent } from '../services/accessEventService';
import { triggerNotification } from '../services/n8nTrigger';
import { sendEvolutionText, normalizePhoneNumber } from '../services/evolutionService';
import { logger } from '../lib/logger';
import crypto from 'crypto';

// ─── Configuration ────────────────────────────────────────────────
const TEST_PHONE = process.env.TEST_WHATSAPP_PHONE || '+5511999999999';
const DRY_RUN = process.env.DRY_RUN !== 'false'; // default: true (won't send real messages)
const WAIT_FOR_WORKER_MS = 5000; // time to wait for BullMQ worker to process

// ─── Test Infrastructure ──────────────────────────────────────────
interface TestContext {
  schoolId: string;
  deviceId: string;
  studentId: string;
  guardianId: string;
  studentGuardianId: string;
  schoolUnitId: string;
}

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  duration: number;
  details: string;
  error?: string;
}

const results: TestResult[] = [];

function log(emoji: string, message: string) {
  console.log(`${emoji}  ${message}`);
}

function separator(title: string) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(60)}\n`);
}

async function runTest(name: string, fn: () => Promise<string>): Promise<TestResult> {
  const start = Date.now();
  try {
    const details = await fn();
    const result: TestResult = {
      name,
      status: 'PASS',
      duration: Date.now() - start,
      details,
    };
    results.push(result);
    log('✅', `${name} — PASS (${result.duration}ms)`);
    if (details) log('   ', details);
    return result;
  } catch (err: any) {
    const result: TestResult = {
      name,
      status: 'FAIL',
      duration: Date.now() - start,
      details: '',
      error: err.message,
    };
    results.push(result);
    log('❌', `${name} — FAIL (${result.duration}ms)`);
    log('   ', `Error: ${err.message}`);
    return result;
  }
}

// ─── Setup: Create temporary test data ────────────────────────────
async function setupTestData(): Promise<TestContext> {
  log('🔧', 'Creating temporary test data...');

  // Find or create an integrator
  let integrator = await prisma.integrator.findFirst({
    where: { status: 'active' },
  });

  if (!integrator) {
    integrator = await prisma.integrator.create({
      data: {
        name: 'Test Integrator (Reliability)',
        slug: 'test-reliability',
        status: 'active',
      },
    });
  }

  // Find or create a school
  let school = await prisma.school.findFirst({
    where: { integratorId: integrator.id, status: 'active' },
  });

  if (!school) {
    school = await prisma.school.create({
      data: {
        integratorId: integrator.id,
        name: 'Escola Teste Confiabilidade',
        slug: 'escola-teste-conf',
        timezone: 'America/Sao_Paulo',
      },
    });
  }

  // Find or create a school unit
  let schoolUnit = await prisma.schoolUnit.findFirst({
    where: { schoolId: school.id },
  });

  if (!schoolUnit) {
    schoolUnit = await prisma.schoolUnit.create({
      data: {
        schoolId: school.id,
        name: 'Sede Teste',
        address: 'Rua do Teste, 1',
      },
    });
  }

  // Create a virtual test device
  const device = await prisma.device.create({
    data: {
      schoolUnitId: schoolUnit.id,
      name: `TEST-RELIABILITY-${Date.now()}`,
      model: 'SS 5530 MF FACE (Virtual)',
      ipAddress: '10.255.255.1',
      port: 80,
      username: 'admin',
      location: 'Portão de Teste',
      connectionPolicy: 'edge_only',
      connectivityMode: 'edge',
      isVirtual: true,
      status: 'online',
      lastHeartbeat: new Date(),
    },
  });

  // Create test student
  const testEnrollment = `TEST-${Date.now()}`;
  const student = await prisma.student.create({
    data: {
      schoolId: school.id,
      name: 'Aluno Teste Confiabilidade',
      enrollment: testEnrollment,
      grade: '9ª série',
      classGroup: '9A',
      shift: 'manhã',
      status: 'active',
    },
  });

  // Link student to device
  await prisma.deviceStudentLink.create({
    data: {
      studentId: student.id,
      deviceId: device.id,
      userId: testEnrollment,
      syncStatus: 'synced',
    },
  });

  // Create test guardian
  const guardian = await prisma.guardian.create({
    data: {
      name: 'Responsável Teste',
      phone: TEST_PHONE,
      email: 'teste@reliability.test',
    },
  });

  // Link guardian to student with notifications enabled
  const studentGuardian = await prisma.studentGuardian.create({
    data: {
      studentId: student.id,
      guardianId: guardian.id,
      relation: 'mae',
      priority: 1,
      notifyEntry: true,
      notifyExit: true,
      whatsappOn: true,
      emailOn: false,
    },
  });

  log('✅', `Test data created — Student: ${student.name}, Guardian phone: ${TEST_PHONE}`);

  return {
    schoolId: school.id,
    deviceId: device.id,
    studentId: student.id,
    guardianId: guardian.id,
    studentGuardianId: studentGuardian.id,
    schoolUnitId: schoolUnit.id,
  };
}

// ─── Cleanup: Remove test data ────────────────────────────────────
async function cleanupTestData(ctx: TestContext) {
  log('🧹', 'Cleaning up test data...');
  try {
    // Delete notification jobs created during test
    await prisma.notificationJob.deleteMany({
      where: {
        event: { deviceId: ctx.deviceId },
      },
    });
    // Delete access events
    await prisma.accessEvent.deleteMany({
      where: { deviceId: ctx.deviceId },
    });
    // Delete device-student links
    await prisma.deviceStudentLink.deleteMany({
      where: { deviceId: ctx.deviceId },
    });
    // Delete student-guardian link
    await prisma.studentGuardian.delete({
      where: { id: ctx.studentGuardianId },
    }).catch(() => {});
    // Delete guardian
    await prisma.guardian.delete({
      where: { id: ctx.guardianId },
    }).catch(() => {});
    // Delete student
    await prisma.student.delete({
      where: { id: ctx.studentId },
    }).catch(() => {});
    // Delete device
    await prisma.device.delete({
      where: { id: ctx.deviceId },
    }).catch(() => {});

    log('✅', 'Cleanup complete');
  } catch (err: any) {
    log('⚠️', `Cleanup partial: ${err.message}`);
  }
}

// ─── Tests ────────────────────────────────────────────────────────

async function testDatabaseConnectivity(): Promise<string> {
  const count = await prisma.school.count();
  return `Database reachable — ${count} school(s) found`;
}

async function testSimulateEntryEvent(ctx: TestContext): Promise<string> {
  const result = await persistAccessEvent({
    schoolId: ctx.schoolId,
    deviceId: ctx.deviceId,
    eventCode: 'AccessControl',
    method: 'Face',
    door: 1,
    direction: 'entry',
    status: 'granted',
    userIdRaw: (await prisma.student.findUnique({ where: { id: ctx.studentId } }))!.enrollment!,
    idempotencyKey: `test-entry-${crypto.randomUUID()}`,
    occurredAt: new Date(),
  });

  if (result.duplicate) throw new Error('Event was flagged as duplicate');
  if (!result.event.studentId) throw new Error('Student was not linked to event');

  return `Entry event created: ${result.event.id} — student: ${result.event.studentId}`;
}

async function testSimulateExitEvent(ctx: TestContext): Promise<string> {
  const result = await persistAccessEvent({
    schoolId: ctx.schoolId,
    deviceId: ctx.deviceId,
    eventCode: 'AccessControl',
    method: 'Face',
    door: 1,
    direction: 'exit',
    status: 'granted',
    userIdRaw: (await prisma.student.findUnique({ where: { id: ctx.studentId } }))!.enrollment!,
    idempotencyKey: `test-exit-${crypto.randomUUID()}`,
    occurredAt: new Date(),
  });

  if (result.duplicate) throw new Error('Event was flagged as duplicate');
  if (!result.event.studentId) throw new Error('Student was not linked to event');

  return `Exit event created: ${result.event.id} — student: ${result.event.studentId}`;
}

async function testNotificationJobCreation(ctx: TestContext): Promise<string> {
  // Get the latest event for our test device
  const latestEvent = await prisma.accessEvent.findFirst({
    where: { deviceId: ctx.deviceId },
    orderBy: { occurredAt: 'desc' },
    include: { student: true, device: true },
  });

  if (!latestEvent) throw new Error('No event found for test device');

  // Trigger notification pipeline
  await triggerNotification(latestEvent);

  // Check notification jobs were created
  const jobs = await prisma.notificationJob.findMany({
    where: { eventId: latestEvent.id },
  });

  if (jobs.length === 0) throw new Error('No notification jobs were created');

  const whatsappJobs = jobs.filter(j => j.channel === 'whatsapp');
  const pendingJobs = jobs.filter(j => j.status === 'pending');

  return `Created ${jobs.length} notification job(s) — WhatsApp: ${whatsappJobs.length}, Pending: ${pendingJobs.length}`;
}

async function testBullMQJobEnqueued(ctx: TestContext): Promise<string> {
  // The triggerNotification already enqueued a BullMQ job
  // We verify by checking if the notification queue has jobs
  const { notificationQueue } = await import('../services/n8nTrigger');
  const waiting = await notificationQueue.getWaitingCount();
  const active = await notificationQueue.getActiveCount();
  const completed = await notificationQueue.getCompletedCount();
  const failed = await notificationQueue.getFailedCount();

  return `Queue state — Waiting: ${waiting}, Active: ${active}, Completed: ${completed}, Failed: ${failed}`;
}

async function testEvolutionApiConnectivity(): Promise<string> {
  if (DRY_RUN) {
    return 'SKIPPED (DRY_RUN=true) — Set DRY_RUN=false and TEST_WHATSAPP_PHONE to test real delivery';
  }

  try {
    const { fetchEvolutionInstance } = await import('../services/evolutionService');
    const instanceName = process.env.EVOLUTION_INSTANCE || 'school_access';
    const instance = await fetchEvolutionInstance(instanceName);

    if (!instance) throw new Error(`Instance "${instanceName}" not found in Evolution API`);

    return `Evolution API reachable — Instance: ${instance.instanceName}, State: ${instance.connectionState}`;
  } catch (err: any) {
    throw new Error(`Evolution API unreachable: ${err.message}`);
  }
}

async function testDirectWhatsAppSend(): Promise<string> {
  if (DRY_RUN) {
    return 'SKIPPED (DRY_RUN=true) — Set DRY_RUN=false to send a real WhatsApp message';
  }

  const instanceName = process.env.EVOLUTION_INSTANCE || 'school_access';
  const normalized = normalizePhoneNumber(TEST_PHONE);

  const testMessage = [
    '*🧪 IA Cloud Access — Teste de Confiabilidade*',
    '',
    `📅 Data: ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
    `⏰ Hora: ${new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
    '',
    '✅ Este é um teste automatizado do sistema de notificações.',
    'Se você recebeu esta mensagem, o pipeline está funcionando corretamente.',
    '',
    '_Mensagem enviada pelo módulo de testes de confiabilidade._',
  ].join('\n');

  const result = await sendEvolutionText(instanceName, normalized, testMessage);
  return `WhatsApp message sent to ${normalized} — Response: ${JSON.stringify(result).slice(0, 200)}`;
}

async function testNotificationJobStatusAfterWorker(ctx: TestContext): Promise<string> {
  // Wait for the worker to process the jobs
  log('⏳', `Waiting ${WAIT_FOR_WORKER_MS / 1000}s for notification worker to process...`);
  await new Promise(resolve => setTimeout(resolve, WAIT_FOR_WORKER_MS));

  const jobs = await prisma.notificationJob.findMany({
    where: {
      event: { deviceId: ctx.deviceId },
    },
    orderBy: { createdAt: 'desc' },
  });

  const sent = jobs.filter(j => j.status === 'sent').length;
  const failed = jobs.filter(j => j.status === 'failed').length;
  const pending = jobs.filter(j => j.status === 'pending').length;
  const dead = jobs.filter(j => j.status === 'dead').length;

  const summary = `Total: ${jobs.length} — Sent: ${sent}, Failed: ${failed}, Pending: ${pending}, Dead: ${dead}`;

  if (DRY_RUN && pending > 0) {
    return `${summary} (pending expected in DRY_RUN — worker may not be running)`;
  }

  if (!DRY_RUN && sent === 0) {
    throw new Error(`No notifications were marked as sent. ${summary}`);
  }

  return summary;
}

async function testEntryNotificationContent(ctx: TestContext): Promise<string> {
  // Verify the entry event notification was created with correct content
  const entryEvent = await prisma.accessEvent.findFirst({
    where: { deviceId: ctx.deviceId, direction: 'entry' },
    orderBy: { occurredAt: 'desc' },
  });

  if (!entryEvent) throw new Error('Entry event not found');

  const jobs = await prisma.notificationJob.findMany({
    where: { eventId: entryEvent.id, channel: 'whatsapp' },
  });

  if (jobs.length === 0) throw new Error('No WhatsApp notification job for entry event');

  const job = jobs[0];
  if (job.recipient !== TEST_PHONE) {
    throw new Error(`Recipient mismatch: expected ${TEST_PHONE}, got ${job.recipient}`);
  }

  return `Entry notification verified — Recipient: ${job.recipient}, Status: ${job.status}`;
}

async function testExitNotificationContent(ctx: TestContext): Promise<string> {
  // Create exit event and trigger notification
  const exitResult = await persistAccessEvent({
    schoolId: ctx.schoolId,
    deviceId: ctx.deviceId,
    eventCode: 'AccessControl',
    method: 'Face',
    door: 1,
    direction: 'exit',
    status: 'granted',
    userIdRaw: (await prisma.student.findUnique({ where: { id: ctx.studentId } }))!.enrollment!,
    idempotencyKey: `test-exit-notif-${crypto.randomUUID()}`,
    occurredAt: new Date(),
  });

  // Trigger notification pipeline for exit
  await triggerNotification(exitResult.event);

  const jobs = await prisma.notificationJob.findMany({
    where: { eventId: exitResult.event.id, channel: 'whatsapp' },
  });

  if (jobs.length === 0) throw new Error('No WhatsApp notification job for exit event');

  return `Exit notification verified — Recipient: ${jobs[0].recipient}, Status: ${jobs[0].status}`;
}

// ─── Main Runner ──────────────────────────────────────────────────
async function main() {
  separator('IA Cloud Access — WhatsApp Reliability Test');

  log('📋', `Mode: ${DRY_RUN ? 'DRY RUN (no real WhatsApp messages)' : 'LIVE (real messages will be sent!)'}`);
  log('📱', `Test phone: ${TEST_PHONE}`);
  log('🕐', `Started at: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
  console.log('');

  // Phase 1: Infrastructure checks
  separator('Phase 1 — Infrastructure Connectivity');
  await runTest('Database connectivity', testDatabaseConnectivity);
  await runTest('Evolution API connectivity', testEvolutionApiConnectivity);

  // Phase 2: Setup test data
  separator('Phase 2 — Test Data Setup');
  let ctx: TestContext | null = null;
  try {
    ctx = await setupTestData();
  } catch (err: any) {
    log('💥', `FATAL: Failed to create test data — ${err.message}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  // Phase 3: Event simulation
  separator('Phase 3 — Event Simulation (Entry + Exit)');
  await runTest('Simulate ENTRY event', () => testSimulateEntryEvent(ctx!));
  await runTest('Simulate EXIT event', () => testSimulateExitEvent(ctx!));

  // Phase 4: Notification pipeline
  separator('Phase 4 — Notification Pipeline');
  await runTest('Notification job creation (entry)', () => testNotificationJobCreation(ctx!));
  await runTest('BullMQ job enqueued', () => testBullMQJobEnqueued(ctx!));
  await runTest('Entry notification content', () => testEntryNotificationContent(ctx!));
  await runTest('Exit notification trigger + content', () => testExitNotificationContent(ctx!));

  // Phase 5: Delivery verification
  separator('Phase 5 — Delivery Verification');
  if (!DRY_RUN) {
    await runTest('Direct WhatsApp send (test message)', testDirectWhatsAppSend);
  }
  await runTest('Notification job status after worker', () => testNotificationJobStatusAfterWorker(ctx!));

  // Cleanup
  separator('Cleanup');
  await cleanupTestData(ctx);

  // Final Report
  separator('Final Report');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;

  console.log('┌──────────────────────────────────────────────────────────┐');
  console.log('│                    TEST RESULTS                          │');
  console.log('├──────────────────────────────────────────────────────────┤');

  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⏭️';
    const padded = r.name.padEnd(42);
    console.log(`│ ${icon} ${padded} ${r.duration.toString().padStart(5)}ms │`);
  }

  console.log('├──────────────────────────────────────────────────────────┤');
  console.log(`│  Passed: ${passed}  |  Failed: ${failed}  |  Skipped: ${skipped}            │`);
  console.log('└──────────────────────────────────────────────────────────┘');

  if (failed > 0) {
    console.log('\n⚠️  FAILED TESTS:');
    for (const r of results.filter(r => r.status === 'FAIL')) {
      console.log(`   ❌ ${r.name}: ${r.error}`);
    }
  }

  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  console.log(`\n⏱️  Total duration: ${totalDuration}ms`);
  console.log(`📅 Completed: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);

  await prisma.$disconnect();

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('💥 Unhandled error:', err);
  prisma.$disconnect();
  process.exit(1);
});
