import { Worker, Job } from 'bullmq';
import axios from 'axios';
import { prisma } from '../prisma';
import { redisGlobal } from '../lib/redis';
import { logger } from '../lib/logger';
import { sendEvolutionText, sendEvolutionMedia } from '../services/evolutionService';
import { getSignedUrl } from '../services/storageService';

const LEGACY_EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'school_access';

export function startNotificationWorker() {
  const worker = new Worker('notifications', async (job: Job) => {
    if (job.name === 'dispatch_notifications') {
      await processDispatchNotifications(job.data);
    } else if (job.name === 'dispatch_absence_alert') {
      await processAbsenceAlert(job.data);
    }
  }, {
    connection: redisGlobal,
    concurrency: 50,
  });

  worker.on('completed', (job) => {
    logger.debug(`[NotificationWorker] Job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`[NotificationWorker] Job ${job?.id} failed:`, { error: err.message });
  });

  logger.info('[NotificationWorker] Started and listening to queue');
}

async function resolveTargetInstance(schoolId?: string | null) {
  if (!schoolId) {
    return { instanceName: LEGACY_EVOLUTION_INSTANCE, channel: null };
  }

  const channel = await prisma.schoolMessagingChannel.findUnique({
    where: {
      schoolId_provider: {
        schoolId,
        provider: 'evolution',
      },
    },
  });

  return {
    instanceName: channel?.instanceName || LEGACY_EVOLUTION_INSTANCE,
    channel,
  };
}

async function processDispatchNotifications(payload: any) {
  const { eventId, schoolId, schoolName, studentName, enrollment, direction, occurredAt, guardians, method, deviceLocation, photoUrl, base64Photo, allowPhotoConfig, whatsappTemplate } = payload;

  const actionText = direction === 'entry' ? 'entrou na' : 'saiu da';
  const timeText = new Date(occurredAt).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  });
  const dateText = new Date(occurredAt).toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
  });

  const target = await resolveTargetInstance(schoolId);
  const sentJobs = [];
  const failedJobs = [];
  let lastChannelError: string | null = null;

  for (const guardian of guardians) {
    if (!guardian.whatsappOn || !guardian.phone) {
      continue;
    }

    // Default message or Custom Template
    let message = '';
    if (whatsappTemplate) {
      message = whatsappTemplate
        .replace(/{{guardianName}}/g, guardian.name || '')
        .replace(/{{studentName}}/g, studentName || '')
        .replace(/{{enrollment}}/g, enrollment || '')
        .replace(/{{actionText}}/g, actionText)
        .replace(/{{deviceLocation}}/g, deviceLocation || '')
        .replace(/{{dateText}}/g, dateText)
        .replace(/{{timeText}}/g, timeText)
        .replace(/{{method}}/g, method || '')
        .replace(/{{schoolName}}/g, schoolName || '');
    } else {
      message = `*IA Cloud Access*\n\nOlá ${guardian.name},\n\nRegistramos que o(a) aluno(a) *${studentName}* (Matrícula: ${enrollment || 'N/A'}) ${actionText} instalação *${deviceLocation}* em ${dateText} às ${timeText}.\n\nMétodo: ${method}\n\nEste é um aviso automático.`;
    }

    const canAttemptPhoto = allowPhotoConfig && guardian.allowPhoto && (photoUrl || base64Photo);

    try {
      if (canAttemptPhoto) {
        let mediaData = '';
        if (base64Photo) {
          mediaData = `data:image/jpeg;base64,${base64Photo}`;
        } else {
          mediaData = await getSignedUrl(photoUrl, 900); // 15 min validity
        }
        await sendEvolutionMedia(target.instanceName, guardian.phone, mediaData, message);
      } else {
        await sendEvolutionText(target.instanceName, guardian.phone, message);
      }
      sentJobs.push({ eventId, recipient: guardian.phone, channel: 'whatsapp' });
    } catch (error: any) {
      // Se tentou enviar foto e falhou, tenta fazer fallback para texto
      if (canAttemptPhoto) {
        try {
          logger.warn(`Photo send failed for ${guardian.phone}, falling back to text. Error: ${error.message}`);
          await sendEvolutionText(target.instanceName, guardian.phone, message);
          sentJobs.push({ eventId, recipient: guardian.phone, channel: 'whatsapp' });
          continue;
        } catch (subErr: any) {
          error = subErr;
        }
      }

      lastChannelError = error?.response?.data?.message || error.message;
      logger.warn(`[EvolutionAPI] Falha ao enviar para ${guardian.phone} pela instância ${target.instanceName}: ${lastChannelError}`);
      failedJobs.push({ eventId, recipient: guardian.phone, channel: 'whatsapp' });

      if (!error.response || error.response.status >= 500) {
        throw new Error('Evolution API is unreachable or returned 5xx');
      }
    }
  }

  if (sentJobs.length > 0) {
    for (const job of sentJobs) {
      await prisma.notificationJob.updateMany({
        where: { eventId: job.eventId, recipient: job.recipient, channel: job.channel },
        data: { status: 'sent', sentAt: new Date() },
      });
    }
  }

  if (failedJobs.length > 0) {
    for (const job of failedJobs) {
      await prisma.notificationJob.updateMany({
        where: { eventId: job.eventId, recipient: job.recipient, channel: job.channel },
        data: { status: 'failed' },
      });
    }
  }

  if (target.channel) {
    await prisma.schoolMessagingChannel.update({
      where: { id: target.channel.id },
      data: {
        lastError: lastChannelError,
        lastSyncAt: new Date(),
      },
    }).catch(() => {});
  }

  const N8N_URL = process.env.N8N_URL || 'http://n8n:5678/webhook/notification-trigger';
  try {
    await axios.post(N8N_URL, payload, { timeout: 8000 });
    logger.debug('[Hybrid Orchestrator] Payload successfully relayed to n8n.');
  } catch (n8nError: any) {
    logger.warn(`[Hybrid Orchestrator] n8n unreachable or failed: ${n8nError.message}`);
  }
}

/**
 * Process absence alert notifications — sends customizable WhatsApp message
 * to guardians of absent students.
 */
async function processAbsenceAlert(payload: any) {
  const { schoolId, schoolName, studentName, enrollment, classGroup, grade, cutoffTime, dateText, template, guardians } = payload;

  const target = await resolveTargetInstance(schoolId);

  for (const guardian of guardians) {
    if (!guardian.whatsappOn || !guardian.phone) continue;

    const message = template
      .replace(/\{\{guardianName\}\}/g, guardian.name || '')
      .replace(/\{\{studentName\}\}/g, studentName || '')
      .replace(/\{\{enrollment\}\}/g, enrollment || 'N/A')
      .replace(/\{\{classGroup\}\}/g, classGroup || '')
      .replace(/\{\{grade\}\}/g, grade || '')
      .replace(/\{\{schoolName\}\}/g, schoolName || '')
      .replace(/\{\{cutoffTime\}\}/g, cutoffTime || '')
      .replace(/\{\{dateText\}\}/g, dateText || '');

    try {
      await sendEvolutionText(target.instanceName, guardian.phone, message);
      logger.debug(`[AbsenceAlert] Sent to ${guardian.phone} for ${studentName}`);
    } catch (err: any) {
      logger.warn(`[AbsenceAlert] Failed to send to ${guardian.phone}: ${err.message}`);
    }
  }
}
