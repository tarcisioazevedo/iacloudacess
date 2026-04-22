import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { VirtualDeviceSimulator } from '../services/virtualDeviceSimulator';

const router = Router();
router.use(requireAuth);

const tenantWhere = (user: any) => {
  if (user?.role === 'superadmin') return {};
  if (user?.integratorId) return { schoolUnit: { school: { integratorId: user.integratorId } } };
  return { schoolUnit: { schoolId: user?.schoolId } };
};

// ─── GET /api/virtual-devices — list virtual devices with sim status ──────
router.get('/', async (req: Request, res: Response) => {
  try {
    const simulator = VirtualDeviceSimulator.getInstance();
    const devices = await prisma.device.findMany({
      where: { isVirtual: true, ...tenantWhere((req as any).user) },
      include: {
        schoolUnit: { select: { name: true, school: { select: { name: true } } } },
        _count: { select: { accessEvents: true } },
      },
      orderBy: { lastHeartbeat: 'desc' },
    });

    const enriched = devices.map(d => ({
      ...d,
      simulationRunning: simulator.isRunning(d.id),
      eventCount: d._count.accessEvents,
    }));

    return res.json({ devices: enriched });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/virtual-devices/:id/start — start simulation ──────────────
router.post(
  '/:id/start',
  requireRole('integrator_admin', 'integrator_support', 'superadmin', 'school_admin'),
  async (req: Request, res: Response) => {
    try {
      const device = await prisma.device.findFirst({
        where: { id: req.params.id, isVirtual: true, ...tenantWhere((req as any).user) },
      });
      if (!device) return res.status(404).json({ message: 'Dispositivo virtual não encontrado' });

      const { intervalMs } = req.body;
      const simulator = VirtualDeviceSimulator.getInstance();

      await simulator.start(device.id, { intervalMs: intervalMs || 30_000 });
      return res.json({ message: 'Simulação iniciada', deviceId: device.id });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }
);

// ─── POST /api/virtual-devices/:id/stop — stop simulation ────────────────
router.post(
  '/:id/stop',
  requireRole('integrator_admin', 'integrator_support', 'superadmin', 'school_admin'),
  async (req: Request, res: Response) => {
    try {
      const device = await prisma.device.findFirst({
        where: { id: req.params.id, isVirtual: true, ...tenantWhere((req as any).user) },
      });
      if (!device) return res.status(404).json({ message: 'Dispositivo virtual não encontrado' });

      const simulator = VirtualDeviceSimulator.getInstance();
      await simulator.stop(device.id);
      return res.json({ message: 'Simulação pausada', deviceId: device.id });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }
);

// ─── POST /api/virtual-devices/:id/trigger — fire one event manually ─────
router.post(
  '/:id/trigger',
  requireRole('integrator_admin', 'integrator_support', 'superadmin', 'school_admin'),
  async (req: Request, res: Response) => {
    try {
      const device = await prisma.device.findFirst({
        where: { id: req.params.id, isVirtual: true, ...tenantWhere((req as any).user) },
        include: {
          schoolUnit: { include: { school: { select: { id: true } } } },
          studentLinks: { select: { studentId: true, userId: true }, take: 50 },
        },
      });
      if (!device) return res.status(404).json({ message: 'Dispositivo virtual não encontrado' });

      const schoolId = (device.schoolUnit as any)?.school?.id;
      if (!schoolId) return res.status(400).json({ message: 'Escola não associada ao device' });

      const { direction = 'entry', method = 'Face', studentId } = req.body;

      // Pick student: use specified or random linked student
      let resolvedStudentId = studentId || null;
      let userIdRaw = `MANUAL-${Date.now()}`;
      if (!resolvedStudentId && device.studentLinks.length > 0) {
        const link = device.studentLinks[Math.floor(Math.random() * device.studentLinks.length)];
        resolvedStudentId = link.studentId;
        userIdRaw = link.userId;
      } else if (!resolvedStudentId && device.studentLinks.length === 0) {
        // Fallback para pegar qualquer aluno da escola (útil para testes rápidos com Dispositivo Virtual novo)
        const randomStudent = await prisma.student.findFirst({
          where: { schoolId },
          orderBy: { createdAt: 'desc' }
        });
        if (randomStudent) {
          resolvedStudentId = randomStudent.id;
          userIdRaw = randomStudent.enrollment || `MANUAL-${Date.now()}`;
        }
      }

      const crypto = await import('crypto');
      const event = await prisma.accessEvent.create({
        data: {
          schoolId,
          deviceId: device.id,
          studentId: resolvedStudentId,
          eventCode: 'AccessControl',
          method,
          door: 1,
          direction,
          status: 'granted',
          userIdRaw,
          idempotencyKey: crypto.randomUUID(),
          occurredAt: new Date(),
          rawPayload: { _virtual: true, _manual: true },
        },
        include: {
          student: {
            select: {
              name: true,
              guardianLinks: {
                include: { guardian: { select: { phone: true, email: true, name: true } } },
              },
            },
          },
        },
      });

      await prisma.device.update({
        where: { id: device.id },
        data: { lastEventAt: event.occurredAt, status: 'online', lastHeartbeat: new Date() },
      });

      // Importar dinamicamente para evitar problemas circulares ou simplesmente requerer
      const { triggerNotification } = await import('../services/n8nTrigger');
      
      if (resolvedStudentId && event.student) {
        await triggerNotification(event as any).catch((err: any) =>
          console.warn(`[VirtualSim] Notification pipeline error: ${err.message}`)
        );
      }

      return res.json({ message: 'Evento gerado com sucesso', event: { id: event.id, direction, method } });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }
);

// ─── DELETE /api/virtual-devices/:id — delete virtual device ─────────────
router.delete(
  '/:id',
  requireRole('integrator_admin', 'superadmin'),
  async (req: Request, res: Response) => {
    try {
      const device = await prisma.device.findFirst({
        where: { id: req.params.id, isVirtual: true, ...tenantWhere((req as any).user) },
      });
      if (!device) return res.status(404).json({ message: 'Dispositivo virtual não encontrado' });

      const simulator = VirtualDeviceSimulator.getInstance();
      await simulator.stop(device.id);
      await prisma.device.delete({ where: { id: device.id } });

      return res.json({ message: 'Dispositivo virtual removido' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }
);

export default router;
