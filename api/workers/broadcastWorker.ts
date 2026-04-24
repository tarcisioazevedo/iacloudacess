/**
 * Broadcast Worker
 *
 * Dedicated worker for school announcements (comunicados gerais).
 * Separated from the notification worker to avoid competing with
 * real-time access notifications for WhatsApp throughput.
 *
 * Rate limited: 30 msgs/second max to avoid Evolution API throttling.
 */

import { Queue, Worker } from 'bullmq';
import { prisma } from '../prisma';
import { redisGlobal } from '../lib/redis';
import { logger } from '../lib/logger';
import { sendEvolutionText } from '../services/evolutionService';

const LEGACY_INSTANCE = process.env.EVOLUTION_INSTANCE || 'school_access';

export const broadcastQueue = new Queue('broadcasts', { connection: redisGlobal });

async function resolveInstanceForSchool(schoolId: string): Promise<string> {
  const channel = await prisma.schoolMessagingChannel.findUnique({
    where: {
      schoolId_provider: {
        schoolId,
        provider: 'evolution',
      },
    },
    select: { instanceName: true, connectionState: true },
  });

  return channel?.instanceName || LEGACY_INSTANCE;
}

export function startBroadcastWorker() {
  const worker = new Worker('broadcasts', async (job) => {
    if (job.name === 'process_broadcast_batch') {
      await processBatch(job.data);
    }
  }, {
    connection: redisGlobal,
    concurrency: 5,
    limiter: { max: 30, duration: 1000 }, // 30 msgs/sec
  });

  worker.on('completed', (job) => {
    logger.debug(`[BroadcastWorker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`[BroadcastWorker] Job ${job?.id} failed: ${err.message}`);
  });

  logger.info('[BroadcastWorker] Started');
}

async function processBatch(data: {
  broadcastId: string;
  schoolId: string;
  message: string;
  title: string;
  batchOffset: number;
  batchSize: number;
}) {
  const { broadcastId, schoolId, message, title, batchOffset, batchSize } = data;

  const deliveries = await prisma.broadcastDelivery.findMany({
    where: { broadcastId, status: 'pending' },
    orderBy: { createdAt: 'asc' },
    skip: batchOffset,
    take: batchSize,
  });

  if (deliveries.length === 0) return;

  const instanceName = await resolveInstanceForSchool(schoolId);
  let sent = 0;
  let failed = 0;

  for (const delivery of deliveries) {
    try {
      if (delivery.channel === 'whatsapp' && delivery.recipient) {
        const formattedMessage = `*${title}*\n\n${message}`;
        await sendEvolutionText(instanceName, delivery.recipient, formattedMessage);
      }
      // TODO: Email channel support (nodemailer)

      await prisma.broadcastDelivery.update({
        where: { id: delivery.id },
        data: { status: 'sent', sentAt: new Date() },
      });
      sent++;
    } catch (err: any) {
      await prisma.broadcastDelivery.update({
        where: { id: delivery.id },
        data: { status: 'failed', lastError: err.message?.slice(0, 500) },
      });
      failed++;
      logger.warn(`[BroadcastWorker] Failed to send to ${delivery.recipient}: ${err.message}`);
    }
  }

  // Update broadcast counters atomically
  await prisma.schoolBroadcast.update({
    where: { id: broadcastId },
    data: {
      sentCount: { increment: sent },
      failedCount: { increment: failed },
    },
  });

  // Check if broadcast is complete
  const broadcast = await prisma.schoolBroadcast.findUnique({
    where: { id: broadcastId },
    select: { totalRecipients: true, sentCount: true, failedCount: true },
  });

  if (broadcast && (broadcast.sentCount + broadcast.failedCount) >= broadcast.totalRecipients) {
    const finalStatus = broadcast.failedCount === 0 ? 'sent' : broadcast.sentCount === 0 ? 'failed' : 'partial';
    await prisma.schoolBroadcast.update({
      where: { id: broadcastId },
      data: { status: finalStatus, completedAt: new Date() },
    });
    logger.info(`[BroadcastWorker] Broadcast ${broadcastId} completed: ${broadcast.sentCount} sent, ${broadcast.failedCount} failed`);
  }
}
