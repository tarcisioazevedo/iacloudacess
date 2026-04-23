import { Worker } from 'bullmq';
import { prisma } from '../prisma';
import { getDeviceClient } from '../services/deviceClientFactory';
import { deviceSyncConnection, deviceSyncQueue } from '../services/deviceSyncQueue';
import { resolveDeviceTransport } from '../services/deviceTransport';

let workerInstance: Worker | null = null;

export { deviceSyncQueue };

export function startDeviceSyncWorker() {
  if (workerInstance) {
    return workerInstance;
  }

  workerInstance = new Worker('device-sync', async (job) => {
    const { syncJobId } = job.data as { syncJobId: string };

    const syncJob = await prisma.deviceSyncJob.findUnique({
      where: { id: syncJobId },
      include: { device: true },
    });

    if (!syncJob || syncJob.status === 'synced') return;

    const device = syncJob.device;
    const transport = resolveDeviceTransport(device);

    if (transport.deliveryMode === 'edge') {
      await prisma.deviceSyncJob.update({
        where: { id: syncJobId },
        data: {
          status: 'pending',
          lastError: 'Job reservado para entrega via edge local',
        },
      });
      return;
    }

    if (transport.deliveryMode === 'unavailable') {
      await prisma.deviceSyncJob.update({
        where: { id: syncJobId },
        data: {
          status: 'failed',
          attempts: syncJob.attempts + 1,
          lastError: transport.reason,
        },
      });
      return;
    }

    await prisma.deviceSyncJob.update({
      where: { id: syncJobId },
      data: { status: 'in_progress', lastAttemptAt: new Date() },
    });

    // Use factory: prefers CGI reverse TCP tunnel when available, falls back to HTTP direct
    const client = getDeviceClient(device);
    const payload = syncJob.payload as Record<string, any>;

    try {
      switch (syncJob.syncType) {
        case 'user_insert': {
          await client.insertUsers([{
            UserID: payload.UserID,
            UserName: payload.UserName,
            UserType: payload.UserType ?? 0,
            Doors: payload.Doors ?? [0],
            TimeSections: payload.TimeSections ?? [255],
            ValidDateStart: payload.ValidDateStart ?? payload.ValidFrom ?? '2026-01-01 00:00:00',
            ValidDateEnd: payload.ValidDateEnd ?? payload.ValidTo ?? '2037-12-31 23:59:59',
          }]);
          break;
        }
        case 'face_insert': {
          await client.insertFaces([{
            UserID: payload.UserID,
            PhotoData: [payload.PhotoData],
          }]);
          break;
        }
        case 'user_update': {
          await client.removeUser(payload.UserID).catch(() => undefined);
          await client.insertUsers([payload]);
          break;
        }
        case 'face_remove': {
          if (payload.action === 'clearAll') {
            await client.wipeFaces();
          } else {
            await client.removeFace(payload.UserID);
          }
          break;
        }
        case 'user_remove': {
          if (payload.action === 'clearAll') {
            await client.wipeUsers();
            await prisma.deviceStudentLink.deleteMany({
              where: { deviceId: device.id },
            });
          } else {
            // P1 FIX: Complete removal — remove face first, then user record
            await client.removeFace(payload.UserID).catch(() => undefined);
            await client.removeUser(payload.UserID);

            // Mark device-student link as removed
            await prisma.deviceStudentLink.updateMany({
              where: { deviceId: device.id, userId: String(payload.UserID) },
              data: { syncStatus: 'removed' },
            });
          }
          break;
        }
        default:
          throw new Error(`Unknown syncType: ${syncJob.syncType}`);
      }

      await prisma.deviceSyncJob.update({
        where: { id: syncJobId },
        data: {
          status: 'synced',
          attempts: syncJob.attempts + 1,
          lastError: null,
          claimedByEdgeId: null,
          claimedAt: null,
          leaseExpiresAt: null,
        },
      });

      if (['user_insert', 'face_insert', 'user_update'].includes(syncJob.syncType)) {
        await prisma.deviceStudentLink.updateMany({
          where: { deviceId: device.id, userId: String(payload.UserID) },
          data: { syncStatus: 'synced' },
        });
      }

      await prisma.device.update({
        where: { id: device.id },
        data: { status: 'online', lastHeartbeat: new Date() },
      });

      console.log(`[DeviceSync] direct:${syncJob.syncType} ok for ${payload.UserID} on ${device.name}`);
    } catch (err: any) {
      const attempts = syncJob.attempts + 1;
      const isFinal = attempts >= 5;

      await prisma.deviceSyncJob.update({
        where: { id: syncJobId },
        data: {
          status: isFinal ? 'failed' : 'retrying',
          attempts,
          lastError: err.message?.slice(0, 500),
          claimedByEdgeId: null,
          claimedAt: null,
          leaseExpiresAt: null,
        },
      });

      if (['user_insert', 'face_insert', 'user_update'].includes(syncJob.syncType)) {
        await prisma.deviceStudentLink.updateMany({
          where: { deviceId: device.id, userId: String(payload.UserID) },
          data: { syncStatus: isFinal ? 'failed' : 'pending' },
        });
      }

      console.error(`[DeviceSync] direct:${syncJob.syncType} fail ${attempts}/5 on ${device.name}: ${err.message}`);

      if (!isFinal) throw err;
    }
  }, {
    connection: deviceSyncConnection,
    concurrency: 3,
    limiter: { max: 5, duration: 1000 },
  });

  workerInstance.on('completed', (job) => {
    console.log(`[DeviceSync] Job ${job.id} completed`);
  });

  workerInstance.on('failed', (job, err) => {
    console.error(`[DeviceSync] Job ${job?.id} failed: ${err.message}`);
  });

  return workerInstance;
}

export default startDeviceSyncWorker;
