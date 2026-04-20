/**
 * VirtualDeviceSimulator — Motor de simulação de dispositivos Intelbras.
 *
 * Quando um Device tem isVirtual=true, este serviço:
 *  1. Registra o device como "online" imediatamente.
 *  2. A cada intervalo configurável (padrão 30s), seleciona um aluno aleatório
 *     vinculado ao device e gera um AccessEvent realista (entry/exit alternados).
 *  3. Encadeia o pipeline de notificações (n8nTrigger) igual ao fluxo real.
 *  4. Atualiza analytics, heartbeat e lastEventAt normalmente.
 *
 * Cada instância de simulação roda em um setInterval próprio por deviceId.
 * O serviço é um singleton que sobrevive reinicializações do processo (até o PM2/Swarm reiniciar).
 */

import { prisma } from '../prisma';
import { triggerNotification as n8nTrigger } from './n8nTrigger';
import crypto from 'crypto';

interface SimulationConfig {
  intervalMs: number;     // default 30_000 ms
  eventTypes: string[];   // 'entry' | 'exit'
  methods: string[];      // 'Face' | 'Card' | 'Password'
}

const DEFAULT_CONFIG: SimulationConfig = {
  intervalMs: 30_000,
  eventTypes: ['entry', 'exit'],
  methods: ['Face', 'Card'],
};

export class VirtualDeviceSimulator {
  private static instance: VirtualDeviceSimulator;
  private timers = new Map<string, NodeJS.Timeout>();
  // track last direction per device for alternating entry/exit
  private lastDirection = new Map<string, string>();

  private constructor() {}

  static getInstance(): VirtualDeviceSimulator {
    if (!VirtualDeviceSimulator.instance) {
      VirtualDeviceSimulator.instance = new VirtualDeviceSimulator();
    }
    return VirtualDeviceSimulator.instance;
  }

  /** Start simulation for a virtual device. Idempotent. */
  async start(deviceId: string, config: Partial<SimulationConfig> = {}) {
    if (this.timers.has(deviceId)) return; // already running

    const cfg = { ...DEFAULT_CONFIG, ...config };

    // Mark online immediately
    await prisma.device.update({
      where: { id: deviceId },
      data: { status: 'online', lastHeartbeat: new Date() },
    });

    console.log(`[VirtualSim] Started simulation for device ${deviceId} (interval: ${cfg.intervalMs}ms)`);

    const timer = setInterval(async () => {
      await this.tick(deviceId, cfg);
    }, cfg.intervalMs);

    this.timers.set(deviceId, timer);

    // Run first tick immediately after 3s so tenant sees something fast
    setTimeout(() => this.tick(deviceId, cfg), 3000);
  }

  /** Stop simulation for a device. */
  async stop(deviceId: string) {
    const timer = this.timers.get(deviceId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(deviceId);
      this.lastDirection.delete(deviceId);

      await prisma.device.update({
        where: { id: deviceId },
        data: { status: 'offline' },
      }).catch(() => {});

      console.log(`[VirtualSim] Stopped simulation for device ${deviceId}`);
    }
  }

  /** Is the simulator running for this device? */
  isRunning(deviceId: string) {
    return this.timers.has(deviceId);
  }

  /** List all currently running virtual device IDs. */
  runningDevices() {
    return Array.from(this.timers.keys());
  }

  /** On server startup — restart all virtual devices that were previously online. */
  async resumeAll() {
    const virtualDevices = await prisma.device.findMany({
      where: { isVirtual: true },
    });

    for (const device of virtualDevices) {
      await this.start(device.id);
    }

    if (virtualDevices.length > 0) {
      console.log(`[VirtualSim] Resumed ${virtualDevices.length} virtual device(s)`);
    }
  }

  /** Core tick — generate one synthetic access event. */
  private async tick(deviceId: string, cfg: SimulationConfig) {
    try {
      const device = await prisma.device.findUnique({
        where: { id: deviceId },
        include: {
          schoolUnit: { include: { school: { select: { id: true } } } },
          studentLinks: {
            select: { studentId: true, userId: true },
            take: 50,
          },
        },
      });

      if (!device) {
        await this.stop(deviceId);
        return;
      }

      // Update heartbeat
      await prisma.device.update({
        where: { id: deviceId },
        data: { status: 'online', lastHeartbeat: new Date() },
      });

      // Need at least one linked student to generate realistic events
      if (device.studentLinks.length === 0) {
        // Generate anonymous "unidentified" event instead
        await this.createEvent(device, null, null, cfg);
        return;
      }

      // Pick a random linked student
      const link = device.studentLinks[Math.floor(Math.random() * device.studentLinks.length)];
      await this.createEvent(device, link.studentId, link.userId, cfg);

    } catch (err: any) {
      console.error(`[VirtualSim] Tick error for device ${deviceId}:`, err.message);
    }
  }

  private async createEvent(
    device: any,
    studentId: string | null,
    userIdRaw: string | null,
    cfg: SimulationConfig,
  ) {
    const schoolId = device.schoolUnit?.school?.id;
    if (!schoolId) return;

    // Alternate entry/exit per device for realism
    const lastDir = this.lastDirection.get(device.id) || 'exit';
    const direction = lastDir === 'exit' ? 'entry' : 'exit';
    this.lastDirection.set(device.id, direction);

    const method = cfg.methods[Math.floor(Math.random() * cfg.methods.length)];
    const status = Math.random() > 0.05 ? 'granted' : 'denied'; // 95% granted
    const occurredAt = new Date();
    const idempotencyKey = crypto.randomUUID();

    const event = await prisma.accessEvent.create({
      data: {
        schoolId,
        deviceId: device.id,
        studentId,
        eventCode: 'AccessControl',
        method,
        door: 1,
        direction,
        status,
        userIdRaw: userIdRaw ?? `VIRTUAL-${Math.floor(Math.random() * 9999)}`,
        idempotencyKey,
        occurredAt,
        rawPayload: {
          _virtual: true,
          simulatedAt: occurredAt.toISOString(),
          deviceName: device.name,
        },
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

    // Update device lastEventAt
    await prisma.device.update({
      where: { id: device.id },
      data: { lastEventAt: occurredAt },
    });

    // Trigger notification pipeline (same as real webhook flow)
    if (studentId && event.student) {
      await n8nTrigger(event as any).catch((err: any) =>
        console.warn(`[VirtualSim] Notification pipeline error: ${err.message}`)
      );
    }

    console.log(`[VirtualSim] Event: ${direction} / ${status} / student=${studentId ?? 'anon'} / device=${device.name}`);
  }
}
