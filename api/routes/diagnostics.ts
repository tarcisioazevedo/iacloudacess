import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { IntelbrasAutoRegisterService } from '../services/intelbrasAutoRegisterService';
import { getDeviceClient } from '../services/deviceClientFactory';
import { getDeviceReverseId, resolveDeviceTransport } from '../services/deviceTransport';
import { writeOpsLog } from '../services/opsLogService';

const router = Router();
router.use(requireAuth);

// Middleware to scope device access to tenant
const deviceTenantWhere = (user: any) => {
  if (user.role === 'superadmin') return {};
  if (user.role === 'school_admin' && user.schoolId) return { schoolId: user.schoolId };
  if (['integrator_admin', 'integrator_support'].includes(user.role)) return { school: { integratorId: user.integratorId } };
  return { id: 'auth_block' };
};

// GET /api/diagnostics/active-sockets — Lists devices currently maintaining a Reverse TCP Tunnel
router.get('/active-sockets', requireRole('integrator_admin', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const service = IntelbrasAutoRegisterService.getInstance();
    const activeIds = service.getActiveDevices();
    
    const devices = await prisma.device.findMany({
      where: {
        OR: [
          { id: { in: activeIds } },
          { localIdentifier: { in: activeIds } },
        ],
        ...deviceTenantWhere(req.user)
      },
      include: {
        edgeConnector: {
          select: { id: true, name: true, status: true },
        },
      }
    });

    return res.json({
      connectedDevices: devices.map((device) => ({
        id: device.id,
        name: device.name,
        location: device.location,
        firmwareVer: device.firmwareVer,
        localIdentifier: device.localIdentifier,
        transport: resolveDeviceTransport(device, { autoRegisterConnected: true }),
      })),
      count: devices.length,
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// POST /api/diagnostics/device/:id/ping — Attempts to test connection to a device
router.post('/device/:id/ping', requireRole('integrator_admin', 'integrator_support', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const device = await prisma.device.findFirst({
      where: { id: req.params.id, ...deviceTenantWhere(req.user) },
      include: {
        schoolUnit: {
          include: {
            school: {
              select: {
                id: true,
                integratorId: true,
                name: true,
              },
            },
          },
        },
        edgeConnector: {
          select: { id: true, name: true, status: true },
        },
      },
    });
    
    if (!device) return res.status(404).json({ message: 'Dispositivo não encontrado ou acesso restrito' });

    const start = Date.now();
    const transport = resolveDeviceTransport(device);
    const requestId = typeof req.headers['x-request-id'] === 'string'
      ? req.headers['x-request-id']
      : null;
    const baseOpsLog = {
      source: 'device_diagnostics',
      category: 'connectivity',
      requestId,
      integratorId: device.schoolUnit.school.integratorId,
      schoolId: device.schoolUnit.school.id,
      schoolUnitId: device.schoolUnitId,
      schoolName: device.schoolUnit.school.name,
      deviceId: device.id,
      deviceName: device.name,
      deviceRef: device.localIdentifier || device.serialNumber || device.id,
      transport: transport.effectiveTransport,
      metadata: {
        reverseIdentifier: getDeviceReverseId(device),
      },
    };
    
    try {
      if (transport.effectiveTransport === 'cloud_autoreg' || transport.effectiveTransport === 'direct_http') {
        const client = getDeviceClient(device);
        await client.getDeviceInfo();
        const latency = Date.now() - start;
        void writeOpsLog({
          ...baseOpsLog,
          level: 'info',
          outcome: 'ping_ok',
          message: 'Teste ativo de conectividade concluido com sucesso',
          metadata: {
            ...baseOpsLog.metadata,
            latencyMs: latency,
          },
        });
        return res.json({
          status: 'online',
          method: transport.effectiveTransport,
          latency: `${latency}ms`,
          transport,
          reverseIdentifier: getDeviceReverseId(device),
        });
      } else if (transport.deliveryMode === 'edge') {
        void writeOpsLog({
          ...baseOpsLog,
          level: 'warn',
          outcome: 'edge_required',
          message: 'Diagnostico remoto solicitado para dispositivo operando via edge local',
          metadata: {
            ...baseOpsLog.metadata,
            reason: transport.reason,
          },
        });
        return res.json({
          status: 'offline',
          method: 'edge_polling_required',
          transport,
          message: 'Dispositivo configurado para operação via edge local. O diagnóstico precisa ser executado pelo edge.',
        });
      } else {
        void writeOpsLog({
          ...baseOpsLog,
          level: 'warn',
          outcome: 'transport_unavailable',
          message: 'Diagnostico remoto indisponivel para o transporte atual do dispositivo',
          metadata: {
            ...baseOpsLog.metadata,
            reason: transport.reason,
          },
        });
        return res.status(409).json({
          status: 'offline',
          method: 'unavailable',
          transport,
          message: transport.reason,
        });
      }
    } catch(err: any) {
      void writeOpsLog({
        ...baseOpsLog,
        level: 'error',
        outcome: 'ping_failed',
        message: 'Teste ativo de conectividade falhou',
        metadata: {
          ...baseOpsLog.metadata,
          error: err.message,
          latencyMs: Date.now() - start,
        },
      });
      return res.status(500).json({ status: 'offline', error: err.message, latency: `${Date.now() - start}ms` });
    }
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
