/**
 * Absence Alert Job
 *
 * Runs every 5 minutes. For each school with absenceAlertEnabled:
 * 1. Check if current time >= cutoff time AND today is a school day
 * 2. Skip if today is a holiday/recess (SchoolCalendarEvent)
 * 3. Find students with NO entry event today
 * 4. Notify guardians via WhatsApp (reuses notification queue)
 * 5. Send daily absence report email to school admin
 *
 * Idempotency: Uses AttendanceSnapshot to track that alerts were already sent today.
 */

import { prisma } from '../prisma';
import { logger } from '../lib/logger';
import { notificationQueue } from '../services/n8nTrigger';

const DAY_MAP: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

const DEFAULT_TEMPLATE = `*IA Cloud Access — Aviso de Falta*

Olá {{guardianName}},

Informamos que o(a) aluno(a) *{{studentName}}* (Turma: {{classGroup}}) não registrou entrada na escola *{{schoolName}}* até às {{cutoffTime}} de hoje ({{dateText}}).

Se a ausência é justificada, por favor desconsidere esta mensagem.

_Este é um aviso automático._`;

export async function runAbsenceAlertJob(): Promise<void> {
  const now = new Date();
  const currentDayOfWeek = now.getDay(); // 0=Sun, 6=Sat

  // Get all schools with absence alerts enabled
  const schools = await prisma.school.findMany({
    where: {
      status: 'active',
      absenceAlertEnabled: true,
    },
    select: {
      id: true,
      name: true,
      timezone: true,
      absenceAlertCutoffTime: true,
      absenceAlertDays: true,
      absenceAlertTemplate: true,
      absenceReportEmail: true,
      integratorId: true,
    },
  });

  if (schools.length === 0) return;

  let totalAlerts = 0;
  let totalReports = 0;

  for (const school of schools) {
    try {
      // 1. Check if today is an active day for this school
      const dayName = Object.entries(DAY_MAP).find(([, v]) => v === currentDayOfWeek)?.[0];
      if (!dayName || !school.absenceAlertDays.includes(dayName)) continue;

      // 2. Check if current time >= cutoff time (in school timezone)
      const nowInTz = new Date(now.toLocaleString('en-US', { timeZone: school.timezone }));
      const [cutoffH, cutoffM] = school.absenceAlertCutoffTime.split(':').map(Number);
      const cutoffMinutes = cutoffH * 60 + cutoffM;
      const currentMinutes = nowInTz.getHours() * 60 + nowInTz.getMinutes();

      if (currentMinutes < cutoffMinutes) continue; // Too early
      if (currentMinutes > cutoffMinutes + 30) continue; // Window passed (avoid re-sending)

      // 3. Check if today is a holiday/recess
      const todayStart = new Date(nowInTz.getFullYear(), nowInTz.getMonth(), nowInTz.getDate());
      const todayEnd = new Date(todayStart.getTime() + 86_400_000);

      const calendarBlock = await prisma.schoolCalendarEvent.findFirst({
        where: {
          schoolId: school.id,
          eventDate: { lte: todayStart },
          OR: [
            { endDate: null, eventDate: todayStart },
            { endDate: { gte: todayStart } },
          ],
        },
      });

      if (calendarBlock) {
        logger.debug(`[AbsenceAlert] Skipping ${school.name}: calendar event "${calendarBlock.title}"`);
        continue;
      }

      // 4. Find students with NO entry event today
      const allStudents = await prisma.student.findMany({
        where: { schoolId: school.id, status: 'active' },
        select: {
          id: true,
          name: true,
          enrollment: true,
          classGroup: true,
          grade: true,
          shift: true,
        },
      });

      if (allStudents.length === 0) continue;

      const studentIds = allStudents.map(s => s.id);

      // Get students who DID have an entry event today
      const presentStudents = await prisma.accessEvent.findMany({
        where: {
          schoolId: school.id,
          studentId: { in: studentIds },
          direction: 'entry',
          occurredAt: { gte: todayStart, lt: todayEnd },
        },
        distinct: ['studentId'],
        select: { studentId: true },
      });

      const presentIds = new Set(presentStudents.map(e => e.studentId));
      const absentStudents = allStudents.filter(s => !presentIds.has(s.id));

      if (absentStudents.length === 0) {
        logger.debug(`[AbsenceAlert] ${school.name}: 0 absences detected`);
        continue;
      }

      // 5. Check idempotency — skip students already alerted today
      const existingSnapshots = await prisma.attendanceSnapshot.findMany({
        where: {
          schoolId: school.id,
          snapshotDate: todayStart,
          studentId: { in: absentStudents.map(s => s.id) },
          present: false,
        },
        select: { studentId: true },
      });
      const alreadyAlerted = new Set(existingSnapshots.map(s => s.studentId));
      const newAbsences = absentStudents.filter(s => !alreadyAlerted.has(s.id));

      if (newAbsences.length === 0) {
        logger.debug(`[AbsenceAlert] ${school.name}: all absences already alerted`);
        continue;
      }

      // 6. Send alerts for each absent student
      const dateText = todayStart.toLocaleDateString('pt-BR');
      const template = school.absenceAlertTemplate || DEFAULT_TEMPLATE;

      for (const student of newAbsences) {
        // Get guardians with whatsapp enabled
        const guardianLinks = await prisma.studentGuardian.findMany({
          where: { studentId: student.id, whatsappOn: true },
          include: { guardian: true },
        });

        if (guardianLinks.length === 0) continue;

        const guardians = guardianLinks
          .filter(link => link.guardian.phone)
          .map(link => ({
            name: link.guardian.name,
            phone: link.guardian.phone,
            whatsappOn: true,
            emailOn: false,
            allowPhoto: false,
          }));

        if (guardians.length === 0) continue;

        // Enqueue via existing notification pipeline
        try {
          await notificationQueue.add('dispatch_absence_alert', {
            type: 'absence_alert',
            schoolId: school.id,
            schoolName: school.name,
            studentName: student.name,
            enrollment: student.enrollment,
            classGroup: student.classGroup || '',
            grade: student.grade || '',
            cutoffTime: school.absenceAlertCutoffTime,
            dateText,
            template,
            guardians,
          }, {
            attempts: 2,
            backoff: { type: 'exponential', delay: 3000 },
            removeOnComplete: true,
          });
          totalAlerts++;
        } catch (err: any) {
          logger.warn(`[AbsenceAlert] Failed to enqueue for ${student.name}: ${err.message}`);
        }

        // Mark as alerted (idempotency)
        await prisma.attendanceSnapshot.upsert({
          where: { studentId_snapshotDate: { studentId: student.id, snapshotDate: todayStart } },
          create: {
            schoolId: school.id,
            studentId: student.id,
            snapshotDate: todayStart,
            present: false,
            totalEvents: 0,
          },
          update: {}, // Already exists, don't overwrite
        });
      }

      // 7. Send daily report email to school
      if (school.absenceReportEmail && absentStudents.length > 0) {
        try {
          await sendAbsenceReportEmail(school, absentStudents, allStudents.length, dateText);
          totalReports++;
        } catch (err: any) {
          logger.warn(`[AbsenceAlert] Email report failed for ${school.name}: ${err.message}`);
        }
      }

      logger.info(`[AbsenceAlert] ${school.name}: ${newAbsences.length} alerts sent, ${absentStudents.length}/${allStudents.length} absent`);
    } catch (err: any) {
      logger.error(`[AbsenceAlert] Error processing school ${school.name}: ${err.message}`);
    }
  }

  if (totalAlerts > 0 || totalReports > 0) {
    logger.info(`[AbsenceAlert] Job complete: ${totalAlerts} alerts enqueued, ${totalReports} email reports sent`);
  }
}

/**
 * Send a daily absence summary report to the school's email
 */
async function sendAbsenceReportEmail(
  school: { id: string; name: string; absenceReportEmail: string | null; integratorId: string },
  absentStudents: Array<{ name: string; enrollment: string | null; classGroup: string | null; grade: string | null; shift: string | null }>,
  totalStudents: number,
  dateText: string,
) {
  if (!school.absenceReportEmail) return;

  const presentCount = totalStudents - absentStudents.length;
  const attendanceRate = totalStudents > 0
    ? ((presentCount / totalStudents) * 100).toFixed(1)
    : '0.0';

  // Build the absent students table
  const rows = absentStudents
    .sort((a, b) => (a.classGroup || '').localeCompare(b.classGroup || '') || a.name.localeCompare(b.name))
    .map((s, i) => `${i + 1}. ${s.name} | Turma: ${s.classGroup || '-'} | Série: ${s.grade || '-'} | Turno: ${s.shift || '-'} | Mat: ${s.enrollment || '-'}`)
    .join('\n');

  const subject = `[IA Cloud] Relatório de Faltas — ${school.name} — ${dateText}`;
  const body = `
RELATÓRIO DIÁRIO DE FALTAS
═══════════════════════════════════════
Escola: ${school.name}
Data: ${dateText}
Total de Alunos: ${totalStudents}
Presentes: ${presentCount}
Ausentes: ${absentStudents.length}
Taxa de Presença: ${attendanceRate}%
═══════════════════════════════════════

ALUNOS AUSENTES:
${rows || '(Nenhum aluno ausente)'}

═══════════════════════════════════════
Relatório gerado automaticamente pelo IA Cloud Access.
Para configurar este relatório, acesse o painel da escola.
  `.trim();

  // Use nodemailer from platform config
  const config = await prisma.platformConfig.findUnique({ where: { id: 'singleton' } });
  if (!config?.smtpHost) {
    logger.warn('[AbsenceAlert] SMTP not configured, skipping email report');
    return;
  }

  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort || 587,
    secure: config.smtpSecure,
    auth: {
      user: config.smtpUser || '',
      pass: config.smtpPassEnc || '',
    },
  });

  await transporter.sendMail({
    from: `"${config.smtpFromName || 'IA Cloud Access'}" <${config.smtpFrom || config.smtpUser}>`,
    to: school.absenceReportEmail,
    subject,
    text: body,
  });
}
