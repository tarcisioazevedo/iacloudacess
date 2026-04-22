import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { deviceTenantWhere, schoolUnitTenantWhere } from '../middleware/tenant';
import { auditMiddleware } from '../middleware/auditLogger';
import { getAutoRegisterConnectUrl, getIntelbrasEventPushConfig } from '../lib/runtimeConfig';
import {
  deriveLegacyConnectivityMode,
  getDeviceReverseId,
  normalizeDeviceConnectionPolicy,
  resolveDeviceTransport,
} from '../services/deviceTransport';

const router = Router();
router.use(requireAuth);

async function loadAuthorizedSchoolUnit(req: Request, schoolUnitId: string) {
  return prisma.schoolUnit.findFirst({
    where: {
      id: schoolUnitId,
      ...schoolUnitTenantWhere(req.user),
    },
    include: {
      edgeConnectors: {
        select: { id: true, name: true, status: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
}

function sanitizeDevice(device: any) {
  const reverseIdentifier = getDeviceReverseId(device);
  const transport = resolveDeviceTransport({
    id: device.id,
    connectivityMode: device.connectivityMode,
    connectionPolicy: device.connectionPolicy,
    localIdentifier: device.localIdentifier,
    edgeConnectorId: device.edgeConnectorId,
    edgeConnector: device.edgeConnector,
    passwordEnc: device.passwordEnc,
  });
  const { passwordEnc, ...safeDevice } = device;

  return {
    ...safeDevice,
    connectionPolicy: transport.connectionPolicy,
    transport,
    reverseIdentifier,
    cloudConnection: {
      reverseIdentifier,
      autoRegisterConnected: transport.autoRegisterConnected,
      autoRegisterConnectUrl: getAutoRegisterConnectUrl(),
      connectionStatusLabel: transport.autoRegisterConnected ? 'Tunel CGI ativo' : 'Aguardando conexao CGI',
    },
    intelbrasEventPush: getIntelbrasEventPushConfig(reverseIdentifier),
  };
}

function pickEdgeConnectorId(
  requestedPolicy: string | null | undefined,
  requestedEdgeId: string | null | undefined,
  availableEdges: Array<{ id: string }>,
  fallbackEdgeId?: string | null,
) {
  const normalizedPolicy = normalizeDeviceConnectionPolicy(requestedPolicy);
  const allowedEdgeIds = new Set(availableEdges.map((edge) => edge.id));
  const edgeSelectionProvided = requestedEdgeId !== undefined;
  const safeRequestedEdgeId = typeof requestedEdgeId === 'string' && allowedEdgeIds.has(requestedEdgeId)
    ? requestedEdgeId
    : null;
  const safeFallbackEdgeId = typeof fallbackEdgeId === 'string' && allowedEdgeIds.has(fallbackEdgeId)
    ? fallbackEdgeId
    : null;

  if (normalizedPolicy === 'edge_only') {
    return safeRequestedEdgeId || safeFallbackEdgeId || availableEdges[0]?.id || null;
  }

  if (normalizedPolicy === 'auto') {
    if (edgeSelectionProvided) {
      return safeRequestedEdgeId;
    }
    return safeRequestedEdgeId || safeFallbackEdgeId || null;
  }

  return null;
}

// GET /api/devices — filtered by tenant
router.get('/', async (req: Request, res: Response) => {
  try {
    const { schoolId, integratorId } = req.query;
    
    // Base tenant filters
    const baseWhere = deviceTenantWhere(req.user);
    
    // Explicit query filters
    const queryWhere: any = {};
    if (typeof schoolId === 'string' && schoolId.trim()) {
      queryWhere.schoolUnit = { ...queryWhere.schoolUnit, schoolId: schoolId.trim() };
    }
    if (typeof integratorId === 'string' && integratorId.trim()) {
      queryWhere.schoolUnit = queryWhere.schoolUnit || {};
      queryWhere.schoolUnit.school = { integratorId: integratorId.trim() };
    }

    const devices = await prisma.device.findMany({
      where: {
        AND: [baseWhere, queryWhere]
      },
      include: {
        schoolUnit: {
          include: {
            school: { 
              select: { 
                id: true, 
                name: true, 
                status: true, 
                billingStatus: true,
                integrator: {
                  select: {
                    id: true,
                    status: true,
                    licenses: {
                      where: { status: 'active' },
                      orderBy: { validTo: 'desc' },
                      take: 1
                    }
                  }
                }
              } 
            },
            edgeConnectors: {
              select: { id: true, name: true, status: true, lastSeenAt: true },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
        edgeConnector: {
          select: { id: true, name: true, status: true, lastSeenAt: true },
        },
        _count: { select: { studentLinks: true, syncJobs: true } },
      },
      orderBy: { name: 'asc' },
    });

    const mappedDevices = devices.map(d => {
      const sanitized = sanitizeDevice(d);
      
      const school = d.schoolUnit?.school;
      const integrator = school?.integrator;
      const license = integrator?.licenses?.[0];
      
      const isSchoolBlocked = school?.billingStatus === 'blocked' || school?.status !== 'active';
      const isIntegratorBlocked = integrator?.status !== 'active' || (!license) || new Date(license.validTo) < new Date();
      
      return {
        ...sanitized,
        operationStatus: {
          ok: !isSchoolBlocked && !isIntegratorBlocked,
          isSchoolBlocked,
          isIntegratorBlocked
        }
      };
    });

    return res.json({ devices: mappedDevices });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/devices/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const device = await prisma.device.findFirst({
      where: {
        id: req.params.id,
        ...deviceTenantWhere(req.user),
      },
      include: {
        schoolUnit: {
          include: {
            school: true,
            edgeConnectors: {
              select: { id: true, name: true, status: true },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
        edgeConnector: true,
        studentLinks: { include: { student: { select: { name: true, enrollment: true } } } },
        syncJobs: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!device) return res.status(404).json({ message: 'Dispositivo não encontrado' });
    return res.json({ device: sanitizeDevice(device) });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// POST /api/devices
router.post('/', requireRole('integrator_admin', 'integrator_support', 'superadmin'), auditMiddleware('CREATE', 'Device'), async (req: Request, res: Response) => {
  try {
    const {
      schoolUnitId,
      name,
      model,
      serialNumber,
      localIdentifier,
      ipAddress,
      port,
      username,
      passwordEnc,
      location,
      connectionPolicy,
      connectivityMode,
      edgeConnectorId,
      isVirtual,
      simulatorIntervalMs,
    } = req.body;

    // Virtual devices don't need a real IP/credentials
    if (!schoolUnitId || !name) {
      return res.status(400).json({ message: 'schoolUnitId e name são obrigatórios' });
    }
    if (!isVirtual && !ipAddress) {
      return res.status(400).json({ message: 'ipAddress é obrigatório para dispositivos não-virtuais' });
    }

    const schoolUnit = await loadAuthorizedSchoolUnit(req, schoolUnitId);
    if (!schoolUnit) {
      return res.status(404).json({ message: 'Unidade escolar não encontrada ou fora do escopo' });
    }

    // ─── LICENSE LIMIT CHECK ─────────────────────────────────────────────
    // Resolve integratorId from the school unit's school chain
    const school = await prisma.school.findUnique({
      where: { id: schoolUnit.schoolId },
      select: { integratorId: true },
    });
    if (school?.integratorId) {
      const { validateIntegratorLicense } = await import('../middleware/tenant');
      const licenseCheck = await validateIntegratorLicense(school.integratorId, 'device', prisma);
      if (!licenseCheck.ok) {
        return res.status(403).json({ message: licenseCheck.message });
      }
    }

    const normalizedPolicy = normalizeDeviceConnectionPolicy(connectionPolicy, connectivityMode);
    const selectedEdgeId = pickEdgeConnectorId(
      normalizedPolicy,
      edgeConnectorId,
      schoolUnit.edgeConnectors,
    );

    if (normalizedPolicy === 'edge_only' && !selectedEdgeId && schoolUnit.edgeConnectors.length === 0) {
      return res.status(400).json({ message: 'Cadastre um edge para esta unidade antes de usar modo edge' });
    }

    const device = await prisma.device.create({
      data: {
        schoolUnitId,
        name,
        model,
        serialNumber,
        localIdentifier,
        ipAddress,
        port: port || 80,
        username: username || 'admin',
        passwordEnc: passwordEnc || null,
        location,
        connectionPolicy: isVirtual ? 'virtual' : normalizedPolicy,
        connectivityMode: isVirtual ? 'virtual' : deriveLegacyConnectivityMode(normalizedPolicy, selectedEdgeId),
        edgeConnectorId: isVirtual ? null : selectedEdgeId,
        isVirtual: Boolean(isVirtual),
        status: isVirtual ? 'online' : 'offline',
      },
      include: {
        edgeConnector: {
          select: { id: true, name: true, status: true },
        },
      },
    });

    // Auto-start simulator for virtual devices
    if (isVirtual) {
      const { VirtualDeviceSimulator } = await import('../services/virtualDeviceSimulator');
      await VirtualDeviceSimulator.getInstance().start(device.id, {
        intervalMs: simulatorIntervalMs || 30_000,
      });
    }

    return res.status(201).json({ device: sanitizeDevice(device) });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// PUT /api/devices/:id
router.put('/:id', requireRole('integrator_admin', 'integrator_support', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const existing = await prisma.device.findFirst({
      where: {
        id: req.params.id,
        ...deviceTenantWhere(req.user),
      },
      include: {
        schoolUnit: {
          include: {
            edgeConnectors: {
              select: { id: true, name: true, status: true },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
    });

    if (!existing) {
      return res.status(404).json({ message: 'Dispositivo não encontrado ou fora do escopo' });
    }

    const {
      name,
      ipAddress,
      port,
      username,
      passwordEnc,
      location,
      model,
      serialNumber,
      localIdentifier,
      connectionPolicy,
      connectivityMode,
      edgeConnectorId,
      status,
    } = req.body;

    const normalizedPolicy = normalizeDeviceConnectionPolicy(
      connectionPolicy ?? existing.connectionPolicy,
      connectivityMode || existing.connectivityMode,
    );
    const selectedEdgeId = pickEdgeConnectorId(
      normalizedPolicy,
      edgeConnectorId,
      existing.schoolUnit.edgeConnectors,
      existing.edgeConnectorId,
    );

    if (normalizedPolicy === 'edge_only' && !selectedEdgeId) {
      return res.status(400).json({ message: 'Este dispositivo precisa de um edge associado para operar em modo edge' });
    }

    const device = await prisma.device.update({
      where: { id: req.params.id },
      data: {
        name,
        ipAddress,
        port,
        username,
        passwordEnc: passwordEnc === undefined ? existing.passwordEnc : passwordEnc || null,
        location,
        model,
        serialNumber,
        localIdentifier,
        status,
        connectionPolicy: normalizedPolicy,
        connectivityMode: deriveLegacyConnectivityMode(normalizedPolicy, selectedEdgeId),
        edgeConnectorId: selectedEdgeId,
      },
      include: {
        edgeConnector: {
          select: { id: true, name: true, status: true, lastSeenAt: true },
        },
      },
    });
    return res.json({ device: sanitizeDevice(device) });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
