import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { deviceTenantWhere } from '../middleware/tenant';
import { deviceSyncQueue } from '../services/deviceSyncQueue';
import { getDeviceClient } from '../services/deviceClientFactory';
import { resolveDeviceTransport } from '../services/deviceTransport';
import { checkDeviceOperationStatus } from '../services/deviceBusinessRules';

const router = Router();
router.use(requireAuth);

async function loadAuthorizedDevice(req: Request, deviceId: string) {
  return prisma.device.findFirst({
    where: {
      id: deviceId,
      ...deviceTenantWhere(req.user),
    },
    include: {
      studentLinks: {
        include: {
          student: {
            include: { photo: true },
          },
        },
      },
      edgeConnector: {
        select: { id: true, name: true, status: true },
      },
    },
  });
}

// POST /api/device-sync/:deviceId/sync-all — Trigger full sync for a device
router.post('/:deviceId/sync-all', requireRole('school_admin', 'integrator_admin', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;

    const operationStatus = await checkDeviceOperationStatus(deviceId);
    if (!operationStatus.ok) {
      return res.status(403).json({ message: operationStatus.reason });
    }

    const device = await loadAuthorizedDevice(req, deviceId);
    if (!device) return res.status(404).json({ message: 'Dispositivo não encontrado' });
    const transport = resolveDeviceTransport(device);

    const createdJobs: Array<{ id: string; syncType: string }> = [];
    for (const link of device.studentLinks) {
      const userJob = await prisma.deviceSyncJob.create({
        data: {
          deviceId,
          syncType: 'user_insert',
          payload: {
            UserID: link.userId,
            UserName: link.student.name,
            UserType: 0,
            Doors: [0],
            TimeSections: [255],
            ValidFrom: '2026-01-01 00:00:00',
            ValidTo: '2037-12-31 23:59:59',
          },
          status: 'pending',
        },
        select: { id: true, syncType: true },
      });
      createdJobs.push(userJob);

      if (link.student.photo?.base64Optimized) {
        const faceJob = await prisma.deviceSyncJob.create({
          data: {
            deviceId,
            syncType: 'face_insert',
            payload: {
              UserID: link.userId,
              PhotoData: link.student.photo.base64Optimized,
            },
            status: 'pending',
          },
          select: { id: true, syncType: true },
        });
        createdJobs.push(faceJob);
      }
    }

    if (transport.deliveryMode === 'cloud') {
      await Promise.all(
        createdJobs.map((job) =>
          deviceSyncQueue.add('device-sync', { syncJobId: job.id }, {
            attempts: 5,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: 100,
            removeOnFail: 500,
          }),
        ),
      );
    }

    return res.json({
      message: transport.deliveryMode === 'edge'
        ? `${createdJobs.length} jobs criados e aguardando coleta do edge ${device.edgeConnector?.name || ''}`.trim()
        : transport.deliveryMode === 'cloud'
          ? `${createdJobs.length} jobs criados e enviados para a fila BullMQ`
          : `${createdJobs.length} jobs criados, mas a rota atual do dispositivo está indisponível`,
      count: createdJobs.length,
      deliveryMode: transport.deliveryMode,
      effectiveTransport: transport.effectiveTransport,
      transport,
      edgeConnector: device.edgeConnector,
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/device-sync/:deviceId/status — Get sync status for a device
router.get('/:deviceId/status', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const device = await loadAuthorizedDevice(req, deviceId);
    if (!device) return res.status(404).json({ message: 'Dispositivo não encontrado' });
    const transport = resolveDeviceTransport(device);

    const jobs = await prisma.deviceSyncJob.findMany({
      where: { deviceId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const summary = {
      pending: jobs.filter((job) => job.status === 'pending').length,
      inProgress: jobs.filter((job) => job.status === 'in_progress').length,
      retrying: jobs.filter((job) => job.status === 'retrying').length,
      synced: jobs.filter((job) => job.status === 'synced').length,
      failed: jobs.filter((job) => job.status === 'failed').length,
    };

    return res.json({
      deliveryMode: transport.deliveryMode,
      transport,
      edgeConnector: device.edgeConnector,
      summary,
      jobs,
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// POST /api/device-sync/:deviceId/auto-link — Link all school students to this device
router.post('/:deviceId/auto-link', requireRole('school_admin', 'integrator_admin', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;

    const operationStatus = await checkDeviceOperationStatus(deviceId);
    if (!operationStatus.ok) {
      return res.status(403).json({ message: operationStatus.reason });
    }

    const device = await prisma.device.findFirst({
      where: { id: deviceId, ...deviceTenantWhere(req.user) },
      include: { schoolUnit: true, studentLinks: { select: { studentId: true } } },
    });
    if (!device) return res.status(404).json({ message: 'Dispositivo não encontrado' });
    const transport = resolveDeviceTransport(device);

    // Find all active students for this school not already linked
    const linkedIds = new Set(device.studentLinks.map(l => l.studentId));
    const students = await prisma.student.findMany({
      where: { schoolId: device.schoolUnit.schoolId, status: 'active' },
      include: { photo: { select: { base64Optimized: true } } },
    });

    const unlinked = students.filter(s => !linkedIds.has(s.id));
    if (unlinked.length === 0) {
      return res.json({ message: 'Todos os alunos já estão vinculados', linked: 0 });
    }

    // Create links + sync jobs
    let linked = 0;
    for (const student of unlinked) {
      const userId = student.accessId;
      await prisma.deviceStudentLink.create({
        data: { deviceId, studentId: student.id, userId, syncStatus: 'pending' },
      });

      // Create user sync job
      await prisma.deviceSyncJob.create({
        data: {
          deviceId, syncType: 'user_insert', status: 'pending',
          payload: {
            UserID: userId, UserName: student.name, UserType: 0,
            Doors: [0], TimeSections: [255],
            ValidFrom: '2026-01-01 00:00:00', ValidTo: '2037-12-31 23:59:59',
          },
        },
      });

      // Create face sync job if photo exists
      if (student.photo?.base64Optimized) {
        await prisma.deviceSyncJob.create({
          data: {
            deviceId, syncType: 'face_insert', status: 'pending',
            payload: { UserID: userId, PhotoData: student.photo.base64Optimized },
          },
        });
      }
      linked++;
    }

    // Enqueue direct sync jobs
    if (transport.deliveryMode === 'cloud') {
      const pendingJobs = await prisma.deviceSyncJob.findMany({
        where: { deviceId, status: 'pending' },
        select: { id: true },
      });
      await Promise.all(
        pendingJobs.map(j =>
          deviceSyncQueue.add('device-sync', { syncJobId: j.id }, {
            attempts: 5, backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: 100, removeOnFail: 500,
          }),
        ),
      );
    }

    return res.json({
      message: `${linked} alunos vinculados ao dispositivo`,
      linked,
      totalStudents: students.length,
      withPhotos: students.filter(s => s.photo).length,
      deliveryMode: transport.deliveryMode,
      transport,
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// POST /api/device-sync/:deviceId/restore — Restore all school students to this device (Wipe links + Auto-Link)
router.post('/:deviceId/restore', requireRole('superadmin', 'integrator_admin'), async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;

    const operationStatus = await checkDeviceOperationStatus(deviceId);
    if (!operationStatus.ok) {
      return res.status(403).json({ message: operationStatus.reason });
    }

    const device = await prisma.device.findFirst({
      where: { id: deviceId, ...deviceTenantWhere(req.user) },
      include: { schoolUnit: true },
    });
    if (!device) return res.status(404).json({ message: 'Dispositivo não encontrado' });
    const transport = resolveDeviceTransport(device);

    // Wipe links locally
    await prisma.deviceStudentLink.deleteMany({ where: { deviceId } });
    await prisma.deviceSyncJob.deleteMany({ where: { deviceId, status: 'pending' } });

    // Enqueue wipe jobs for the device
    await prisma.deviceSyncJob.create({
      data: { deviceId, syncType: 'user_remove', status: 'pending', payload: { action: 'clearAll' } },
    });
    await prisma.deviceSyncJob.create({
      data: { deviceId, syncType: 'face_remove', status: 'pending', payload: { action: 'clearAll' } },
    });

    // Find all active students for this school
    const students = await prisma.student.findMany({
      where: { schoolId: device.schoolUnit.schoolId, status: 'active' },
      include: { photo: { select: { base64Optimized: true } } },
    });

    // Create links + sync jobs
    let linked = 0;
    for (const student of students) {
      const userId = student.accessId;
      await prisma.deviceStudentLink.create({
        data: { deviceId, studentId: student.id, userId, syncStatus: 'pending' },
      });

      // Create user sync job
      await prisma.deviceSyncJob.create({
        data: {
          deviceId, syncType: 'user_insert', status: 'pending',
          payload: {
            UserID: userId, UserName: student.name, UserType: 0,
            Doors: [0], TimeSections: [255],
            ValidFrom: '2026-01-01 00:00:00', ValidTo: '2037-12-31 23:59:59',
          },
        },
      });

      // Create face sync job if photo exists
      if (student.photo?.base64Optimized) {
        await prisma.deviceSyncJob.create({
          data: {
            deviceId, syncType: 'face_insert', status: 'pending',
            payload: { UserID: userId, PhotoData: student.photo.base64Optimized },
          },
        });
      }
      linked++;
    }

    // Enqueue direct sync jobs if cloud
    if (transport.deliveryMode === 'cloud') {
      const pendingJobs = await prisma.deviceSyncJob.findMany({
        where: { deviceId, status: 'pending' },
        select: { id: true },
      });
      await Promise.all(
        pendingJobs.map(j =>
          deviceSyncQueue.add('device-sync', { syncJobId: j.id }, {
            attempts: 5, backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: 100, removeOnFail: 500,
          }),
        ),
      );
    }

    return res.json({
      message: `${linked} alunos reenviados ao dispositivo com sucesso`,
      linked,
      deliveryMode: transport.deliveryMode,
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// POST /api/device-sync/:deviceId/wipe — Wipe device completely
router.post('/:deviceId/wipe', requireRole('superadmin', 'integrator_admin'), async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;

    const operationStatus = await checkDeviceOperationStatus(deviceId);
    if (!operationStatus.ok) {
      return res.status(403).json({ message: operationStatus.reason });
    }

    const device = await prisma.device.findFirst({
      where: { id: deviceId, ...deviceTenantWhere(req.user) },
    });
    if (!device) return res.status(404).json({ message: 'Dispositivo não encontrado' });
    const transport = resolveDeviceTransport(device);

    await prisma.deviceStudentLink.deleteMany({ where: { deviceId } });
    await prisma.deviceSyncJob.deleteMany({ where: { deviceId, status: 'pending' } });

    await prisma.deviceSyncJob.create({
      data: { deviceId, syncType: 'user_remove', status: 'pending', payload: { action: 'clearAll' } },
    });
    await prisma.deviceSyncJob.create({
      data: { deviceId, syncType: 'face_remove', status: 'pending', payload: { action: 'clearAll' } },
    });

    if (transport.deliveryMode === 'cloud') {
      const pendingJobs = await prisma.deviceSyncJob.findMany({
        where: { deviceId, status: 'pending' },
        select: { id: true },
      });
      await Promise.all(
        pendingJobs.map(j =>
          deviceSyncQueue.add('device-sync', { syncJobId: j.id }, {
            attempts: 5, removeOnComplete: 100, removeOnFail: 500,
          }),
        ),
      );
    }

    return res.json({ message: 'Wipe commands enqueued successfully' });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/device-sync/:deviceId/diagnostics — Get Firmware Version
router.get('/:deviceId/diagnostics', requireRole('superadmin', 'integrator_admin', 'school_admin'), async (req: Request, res: Response) => {
  try {
    const device = await prisma.device.findFirst({
      where: { id: req.params.deviceId, ...deviceTenantWhere(req.user) },
    });
    if (!device) return res.status(404).json({ message: 'Dispositivo não encontrado' });

    const client = await getDeviceClient(device.id);
    const version = await client.getSoftwareVersion();
    return res.json({ firmwareVersion: version });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// POST /api/device-sync/:deviceId/sync-time — Sync Clock
router.post('/:deviceId/sync-time', requireRole('superadmin', 'integrator_admin', 'school_admin'), async (req: Request, res: Response) => {
  try {
    const device = await prisma.device.findFirst({
      where: { id: req.params.deviceId, ...deviceTenantWhere(req.user) },
    });
    if (!device) return res.status(404).json({ message: 'Dispositivo não encontrado' });

    const client = await getDeviceClient(device.id);
    await client.setCurrentTime(new Date());
    return res.json({ message: 'Relógio sincronizado com sucesso' });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// POST /api/device-sync/:deviceId/ping — Check device connectivity
router.post('/:deviceId/ping', requireRole('integrator_admin', 'integrator_support', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const device = await prisma.device.findFirst({
      where: { id: req.params.deviceId, ...deviceTenantWhere(req.user) },
      include: {
        edgeConnector: {
          select: { id: true, name: true, status: true },
        },
      },
    });
    if (!device) return res.status(404).json({ message: 'Dispositivo não encontrado' });

    const start = Date.now();
    const transport = resolveDeviceTransport(device);
    try {
      if (transport.deliveryMode === 'edge') {
        return res.json({
          status: 'pending',
          method: 'edge_local',
          transport,
          message: 'Este dispositivo opera via edge local. Use o edge para diagnóstico local.',
        });
      }

      if (transport.deliveryMode === 'unavailable') {
        return res.status(409).json({
          status: 'offline',
          method: 'unavailable',
          transport,
          error: transport.reason,
        });
      }

      const client = getDeviceClient(device);
      const info = await client.getDeviceInfo();
      const latency = Date.now() - start;

      await prisma.device.update({
        where: { id: device.id },
        data: { status: 'online', lastHeartbeat: new Date() },
      });

      return res.json({
        status: 'online', latency: `${latency}ms`,
        method: transport.effectiveTransport,
        transport,
        deviceInfo: info, lastHeartbeat: new Date(),
      });
    } catch (err: any) {
      const latency = Date.now() - start;
      await prisma.device.update({
        where: { id: device.id },
        data: { status: 'offline' },
      });

      return res.json({
        status: 'offline', latency: `${latency}ms`,
        error: err.message,
      });
    }
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// POST /api/device-sync/:deviceId/reboot — Remote reboot device
router.post('/:deviceId/reboot', requireRole('integrator_admin', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;

    const operationStatus = await checkDeviceOperationStatus(deviceId);
    if (!operationStatus.ok) {
      return res.status(403).json({ message: operationStatus.reason });
    }

    const device = await prisma.device.findFirst({
      where: { id: deviceId, ...deviceTenantWhere(req.user) },
      include: {
        edgeConnector: { select: { id: true, name: true, status: true } },
      },
    });
    if (!device) return res.status(404).json({ message: 'Dispositivo não encontrado' });

    const transport = resolveDeviceTransport(device);
    if (transport.deliveryMode === 'unavailable') {
      return res.status(409).json({ message: 'Dispositivo indisponível: ' + transport.reason });
    }
    if (transport.deliveryMode === 'edge') {
      return res.status(409).json({ message: 'Reboot remoto não suportado via edge local. Use o edge para acesso direto.' });
    }

    const client = getDeviceClient(device);
    await client.reboot();

    await prisma.device.update({
      where: { id: device.id },
      data: { status: 'offline' },
    });

    return res.json({ message: 'Comando de reboot enviado com sucesso. O dispositivo ficará offline por alguns segundos.' });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/device-sync/:deviceId/device-info — Get device hardware info
router.get('/:deviceId/device-info', requireRole('integrator_admin', 'integrator_support', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const device = await prisma.device.findFirst({
      where: { id: req.params.deviceId, ...deviceTenantWhere(req.user) },
      include: {
        edgeConnector: { select: { id: true, name: true, status: true } },
      },
    });
    if (!device) return res.status(404).json({ message: 'Dispositivo não encontrado' });

    const transport = resolveDeviceTransport(device);
    if (transport.deliveryMode === 'unavailable') {
      return res.status(409).json({ message: 'Dispositivo indisponível: ' + transport.reason });
    }

    const client = getDeviceClient(device);
    const info = await client.getDeviceInfo();

    return res.json({ deviceInfo: info, transport });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
