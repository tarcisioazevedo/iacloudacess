import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { requireEdgeAuth } from '../middleware/edgeAuth';
import { schoolUnitTenantWhere } from '../middleware/tenant';
import { persistAccessEvent } from '../services/accessEventService';
import { uploadEventResource } from '../services/storageService';
import { logger } from '../lib/logger';
import { summarizeEdgeEnrollment } from '../services/edgeEnrollmentStatus';
import { buildEdgeProvisioningPack } from '../services/edgeProvisioningService';
import {
  generateOpaqueSecret,
  hashSecret,
  normalizeStringArray,
  requestIpAddress,
} from '../services/edgeSecurity';
import {
  getConnectorWireGuardSummary,
  getWireGuardInfrastructureStatus,
  provisionWireGuardForConnector,
} from '../services/wireguardProvisioning';

const router = Router();
const EDGE_QUEUE_LEASE_SECONDS = 120;

function parseLimit(value: unknown, fallback = 20, max = 100): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function normalizeCloudMode(value: unknown): 'outbound_only' | 'wireguard_management' {
  return value === 'wireguard_management' ? 'wireguard_management' : 'outbound_only';
}

function mergeConnectorMetadata(existingMetadata: unknown, management: Record<string, unknown>) {
  const metadata = existingMetadata && typeof existingMetadata === 'object' && !Array.isArray(existingMetadata)
    ? existingMetadata as Record<string, unknown>
    : {};
  const currentManagement = metadata.management && typeof metadata.management === 'object' && !Array.isArray(metadata.management)
    ? metadata.management as Record<string, unknown>
    : {};

  return {
    ...metadata,
    management: {
      ...currentManagement,
      ...management,
    },
  };
}

function normalizeDirection(value: unknown): string | null {
  if (value === 1 || value === '1' || value === 'exit') return 'exit';
  if (value === 0 || value === '0' || value === 'entry') return 'entry';
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function parseOccurredAt(value: unknown): Date {
  if (typeof value === 'number') {
    return new Date(value);
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date();
}

function isCloudSafePhotoPath(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim();
  if (!normalized) {
    return false;
  }

  if (
    normalized.startsWith('/mnt/')
    || normalized.startsWith('/var/')
    || normalized.startsWith('/tmp/')
  ) {
    return false;
  }

  return true;
}

async function resolveEdgeDevice(edgeId: string, payload: Record<string, any>) {
  const orFilters: Array<Record<string, string>> = [];

  if (typeof payload.deviceId === 'string' && payload.deviceId.trim()) {
    orFilters.push({ id: payload.deviceId.trim() });
  }
  if (typeof payload.serialNumber === 'string' && payload.serialNumber.trim()) {
    orFilters.push({ serialNumber: payload.serialNumber.trim() });
  }
  if (typeof payload.localIdentifier === 'string' && payload.localIdentifier.trim()) {
    orFilters.push({ localIdentifier: payload.localIdentifier.trim() });
  }

  if (orFilters.length === 0) {
    return null;
  }

  return prisma.device.findFirst({
    where: {
      edgeConnectorId: edgeId,
      connectivityMode: 'edge',
      OR: orFilters,
    },
    include: {
      schoolUnit: {
        include: {
          school: {
            select: { id: true, integratorId: true },
          },
        },
      },
    },
  });
}

/**
 * Decode a base64 photo from an edge event payload and upload it to Hetzner S3
 * using the tenant-aware hierarchical path.
 */
async function resolveEdgeEventPhoto(
  device: { id: string; schoolUnit: { school: { id: string; integratorId: string } } },
  payload: Record<string, any>,
  occurredAt: Date,
): Promise<string | null> {
  const rawBase64 = payload.photoBase64 || payload.imageBase64;
  if (!rawBase64 || typeof rawBase64 !== 'string') return null;

  try {
    // Strip optional data URI prefix
    const match = rawBase64.match(/^data:([^;]+);base64,(.+)$/i);
    const contentType = match?.[1] || 'image/jpeg';
    const base64Data = (match?.[2] || rawBase64).replace(/\s+/g, '');
    const buffer = Buffer.from(base64Data, 'base64');
    if (!buffer.length) return null;

    const extension = contentType.includes('png') ? 'png' : 'jpg';
    const stamp = occurredAt.toISOString().replace(/[:.]/g, '-');
    const hash = crypto.createHash('md5').update(`${device.id}_${stamp}_${Math.random()}`).digest('hex').slice(0, 10);
    const filename = `${device.id}_${stamp}_${hash}.${extension}`;

    return await uploadEventResource(
      device.schoolUnit.school.integratorId,
      device.schoolUnit.school.id,
      occurredAt,
      filename,
      buffer,
      contentType,
    );
  } catch (err: any) {
    logger.warn('Edge event photo upload failed', {
      deviceId: device.id,
      error: err.message,
    });
    return null;
  }
}

async function loadAuthorizedSchoolUnit(req: Request, schoolUnitId: string) {
  return prisma.schoolUnit.findFirst({
    where: {
      id: schoolUnitId,
      ...schoolUnitTenantWhere(req.user),
    },
    include: {
      school: {
        select: { id: true, name: true, integratorId: true },
      },
    },
  });
}

async function loadAuthorizedConnector(req: Request, connectorId: string) {
  return prisma.edgeConnector.findFirst({
    where: {
      id: connectorId,
      schoolUnit: schoolUnitTenantWhere(req.user),
    },
    include: {
      schoolUnit: {
        include: {
          school: {
            select: { id: true, name: true, integratorId: true },
          },
        },
      },
    },
  });
}

async function loadAuthorizedEnrollmentToken(req: Request, enrollmentId: string) {
  return prisma.edgeEnrollmentToken.findFirst({
    where: {
      id: enrollmentId,
      schoolUnit: schoolUnitTenantWhere(req.user),
    },
    include: {
      edgeConnector: {
        include: {
          devices: {
            select: {
              id: true,
              status: true,
            },
          },
        },
      },
    },
  });
}

// POST /api/edge/enrollment-tokens — generate one-time enrollment for a site
router.post('/enrollment-tokens', requireAuth, requireRole('integrator_admin', 'integrator_support', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const { schoolUnitId, label, expiresInHours, cloudMode } = req.body;
    if (!schoolUnitId) {
      return res.status(400).json({ message: 'schoolUnitId é obrigatório' });
    }

    const schoolUnit = await loadAuthorizedSchoolUnit(req, schoolUnitId);

    if (!schoolUnit) {
      return res.status(404).json({ message: 'Unidade escolar não encontrada ou fora do escopo' });
    }

    const enrollmentToken = generateOpaqueSecret('edge_enroll');
    const selectedCloudMode = normalizeCloudMode(cloudMode);
    const expiresAt = new Date(Date.now() + parseLimit(expiresInHours, 24, 168) * 60 * 60 * 1000);

    const tokenRecord = await prisma.edgeEnrollmentToken.create({
      data: {
        schoolUnitId: schoolUnit.id,
        tokenHash: hashSecret(enrollmentToken),
        label: typeof label === 'string' ? label.trim() || null : null,
        createdByProfileId: req.user?.profileId || null,
        expiresAt,
        metadata: {
          cloudMode: selectedCloudMode,
        },
      },
      select: {
        id: true,
        expiresAt: true,
      },
    });

    const provisioningPack = await buildEdgeProvisioningPack(schoolUnit.id);

    return res.status(201).json({
      enrollmentToken,
      enrollment: {
        id: tokenRecord.id,
        expiresAt: tokenRecord.expiresAt,
        schoolUnit: {
          id: schoolUnit.id,
          name: schoolUnit.name,
        },
        school: schoolUnit.school,
      },
      bootstrap: {
        enrollUrl: '/api/edge/enroll',
        heartbeatUrl: '/api/edge/heartbeat',
        syncJobsUrl: '/api/edge/sync-jobs',
        eventsUrl: '/api/edge/events',
        provisioningPackUrl: `/api/edge/provisioning-pack/${schoolUnit.id}`,
      },
      management: selectedCloudMode === 'wireguard_management'
        ? {
            mode: selectedCloudMode,
            wireguard: getWireGuardInfrastructureStatus(),
          }
        : {
            mode: selectedCloudMode,
          },
      provisioningPack,
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

router.get('/enrollment-tokens', requireAuth, requireRole('integrator_admin', 'integrator_support', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const limit = parseLimit(req.query.limit, 10, 50);
    const schoolUnitId = typeof req.query.schoolUnitId === 'string' ? req.query.schoolUnitId : undefined;

    const tokens = await prisma.edgeEnrollmentToken.findMany({
      where: {
        schoolUnit: schoolUnitTenantWhere(req.user),
        ...(schoolUnitId ? { schoolUnitId } : {}),
      },
      include: {
        schoolUnit: {
          include: {
            school: {
              select: {
                id: true,
                name: true,
                integratorId: true,
              },
            },
          },
        },
        edgeConnector: {
          include: {
            devices: {
              select: {
                id: true,
                status: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return res.json({
      enrollmentTokens: tokens.map((token) => ({
        ...summarizeEdgeEnrollment(token),
        schoolUnit: {
          id: token.schoolUnit.id,
          name: token.schoolUnit.name,
        },
        school: token.schoolUnit.school,
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

router.get('/enrollment-tokens/:id', requireAuth, requireRole('integrator_admin', 'integrator_support', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const enrollmentToken = await loadAuthorizedEnrollmentToken(req, req.params.id);
    if (!enrollmentToken) {
      return res.status(404).json({ message: 'Enrollment nao encontrado ou fora do escopo' });
    }

    return res.json({
      enrollmentStatus: summarizeEdgeEnrollment(enrollmentToken),
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/edge/connectors — list edges available to the authenticated tenant
router.get('/connectors', requireAuth, async (req: Request, res: Response) => {
  try {
    const connectors = await prisma.edgeConnector.findMany({
      where: {
        schoolUnit: schoolUnitTenantWhere(req.user),
      },
      include: {
        schoolUnit: {
          include: {
            school: {
              select: { id: true, name: true, integratorId: true },
            },
          },
        },
        devices: {
          select: { id: true, name: true, connectivityMode: true, status: true },
        },
      },
      orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }],
    });

    return res.json({
      connectors: connectors.map((connector) => ({
        ...connector,
        management: connector.cloudMode === 'wireguard_management'
          ? {
              mode: connector.cloudMode,
              wireguard: getConnectorWireGuardSummary(connector.metadata),
            }
          : {
              mode: connector.cloudMode,
            },
        deviceCount: connector.devices.length,
        onlineDeviceCount: connector.devices.filter((device) => device.status === 'online').length,
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/edge/license — edge reads its effective license and tenant status
router.get('/provisioning-pack/:schoolUnitId', requireAuth, requireRole('integrator_admin', 'integrator_support', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const schoolUnit = await loadAuthorizedSchoolUnit(req, req.params.schoolUnitId);
    if (!schoolUnit) {
      return res.status(404).json({ message: 'Unidade escolar nÃ£o encontrada ou fora do escopo' });
    }

    const provisioningPack = await buildEdgeProvisioningPack(schoolUnit.id);
    if (!provisioningPack) {
      return res.status(404).json({ message: 'Pacote de provisionamento nÃ£o disponÃ­vel' });
    }

    return res.json({ provisioningPack });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

router.get('/license', requireEdgeAuth, async (req: Request, res: Response) => {
  try {
    const now = new Date();

    const [edge, schoolUnit, school, integrator, license, usedSchools, usedDevices] = await Promise.all([
      prisma.edgeConnector.findUnique({
        where: { id: req.edge!.id },
        select: {
          id: true,
          name: true,
          status: true,
          cloudMode: true,
          lastSeenAt: true,
          createdAt: true,
        },
      }),
      prisma.schoolUnit.findUnique({
        where: { id: req.edge!.schoolUnitId },
        select: {
          id: true,
          name: true,
          address: true,
        },
      }),
      prisma.school.findUnique({
        where: { id: req.edge!.schoolId },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
        },
      }),
      prisma.integrator.findUnique({
        where: { id: req.edge!.integratorId },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
        },
      }),
      prisma.license.findFirst({
        where: { integratorId: req.edge!.integratorId },
        orderBy: { validTo: 'desc' },
      }),
      prisma.school.count({
        where: {
          integratorId: req.edge!.integratorId,
          status: 'active',
        },
      }),
      prisma.device.count({
        where: {
          schoolUnit: {
            school: {
              integratorId: req.edge!.integratorId,
            },
          },
        },
      }),
    ]);

    const licenseStatus = !license
      ? 'missing'
      : license.validTo < now
        ? 'expired'
        : license.status;

    const edgeAllowed = Boolean(
      edge &&
      integrator?.status === 'active' &&
      school?.status === 'active' &&
      ['active', 'trial'].includes(licenseStatus),
    );

    return res.json({
      edge,
      schoolUnit,
      school,
      integrator,
      license: license ? {
        id: license.id,
        plan: license.plan,
        status: licenseStatus,
        validFrom: license.validFrom,
        validTo: license.validTo,
        maxSchools: license.maxSchools,
        usedSchools,
        maxDevices: license.maxDevices,
        usedDevices,
      } : null,
      enforcement: {
        edgeAllowed,
        reasons: [
          integrator?.status !== 'active' ? 'integrator_inactive' : null,
          school?.status !== 'active' ? 'school_inactive' : null,
          !license ? 'license_missing' : null,
          license && license.validTo < now ? 'license_expired' : null,
          license && !['active', 'trial'].includes(license.status) ? 'license_not_active' : null,
        ].filter(Boolean),
      },
      serverTime: now.toISOString(),
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// POST /api/edge/enroll — claim the one-time enrollment and receive edge credentials
router.post('/enroll', async (req: Request, res: Response) => {
  try {
    const { enrollmentToken, connectorName, hostname, version, localSubnets, capabilities, adoptDevices } = req.body;

    if (!enrollmentToken || typeof enrollmentToken !== 'string') {
      return res.status(400).json({ message: 'enrollmentToken é obrigatório' });
    }

    const tokenRecord = await prisma.edgeEnrollmentToken.findFirst({
      where: {
        tokenHash: hashSecret(enrollmentToken),
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        schoolUnit: {
          include: {
            school: {
              select: { id: true, name: true, integratorId: true },
            },
          },
        },
      },
    });

    if (!tokenRecord) {
      return res.status(401).json({ message: 'Token de enrollment inválido ou expirado' });
    }

    const edgeKey = generateOpaqueSecret('edge_key');
    const requestedCloudMode = normalizeCloudMode((tokenRecord.metadata as Record<string, unknown> | null)?.cloudMode);
    const edgeName = typeof connectorName === 'string' && connectorName.trim()
      ? connectorName.trim()
      : `edge-${tokenRecord.schoolUnit.name.toLowerCase().replace(/\s+/g, '-')}`;

    const connector = await prisma.edgeConnector.create({
      data: {
        schoolUnitId: tokenRecord.schoolUnitId,
        name: edgeName,
        hostname: typeof hostname === 'string' ? hostname.trim() || null : null,
        version: typeof version === 'string' ? version.trim() || null : null,
        status: 'online',
        cloudMode: requestedCloudMode,
        apiKeyHash: hashSecret(edgeKey),
        lastSeenAt: new Date(),
        lastIp: requestIpAddress(req.headers, req.ip),
        localSubnets: normalizeStringArray(localSubnets),
        capabilities: capabilities && typeof capabilities === 'object' ? capabilities : undefined,
        claimedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        schoolUnitId: true,
        metadata: true,
      },
    });

    let management: Record<string, unknown> = { mode: requestedCloudMode };
    if (requestedCloudMode === 'wireguard_management') {
      const existingConnectors = await prisma.edgeConnector.findMany({
        where: {
          NOT: { id: connector.id },
        },
        select: {
          id: true,
          metadata: true,
        },
      });

      const wireguard = provisionWireGuardForConnector({
        connector,
        school: tokenRecord.schoolUnit.school,
        existingConnectors,
      });

      await prisma.edgeConnector.update({
        where: { id: connector.id },
        data: {
          metadata: mergeConnectorMetadata(connector.metadata, {
            mode: requestedCloudMode,
            wireguard: wireguard.metadata as any,
          }) as any,
        },
      });

      management = {
        mode: requestedCloudMode,
        wireguard: {
          infrastructure: wireguard.infrastructure,
          profile: wireguard.profile,
          metadata: wireguard.metadata,
        },
      };
    }

    await prisma.edgeEnrollmentToken.update({
      where: { id: tokenRecord.id },
      data: {
        usedAt: new Date(),
        edgeConnectorId: connector.id,
      },
    });

    if (adoptDevices !== false) {
      await prisma.device.updateMany({
        where: { schoolUnitId: tokenRecord.schoolUnitId },
        data: {
          connectionPolicy: 'edge_only',
          connectivityMode: 'edge',
          edgeConnectorId: connector.id,
        },
      });
    }

    return res.status(201).json({
      edge: {
        id: connector.id,
        name: connector.name,
        schoolUnit: {
          id: tokenRecord.schoolUnit.id,
          name: tokenRecord.schoolUnit.name,
        },
        school: tokenRecord.schoolUnit.school,
      },
      credentials: {
        edgeId: connector.id,
        edgeKey,
      },
      policy: {
        heartbeatIntervalSec: 30,
        syncPullIntervalSec: 15,
        queueLeaseSec: EDGE_QUEUE_LEASE_SECONDS,
        maxEventBatchSize: 100,
      },
      management,
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

router.post('/connectors/:id/wireguard-profile', requireAuth, requireRole('integrator_admin', 'integrator_support', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const connector = await loadAuthorizedConnector(req, req.params.id);
    if (!connector) {
      return res.status(404).json({ message: 'Edge não encontrado ou fora do escopo' });
    }

    if (connector.cloudMode !== 'wireguard_management') {
      return res.status(409).json({ message: 'Este edge não está em modo wireguard_management' });
    }

    const existingConnectors = await prisma.edgeConnector.findMany({
      where: {
        NOT: { id: connector.id },
      },
      select: {
        id: true,
        metadata: true,
      },
    });

    const wireguard = provisionWireGuardForConnector({
      connector,
      school: connector.schoolUnit.school,
      existingConnectors,
    });

    await prisma.edgeConnector.update({
      where: { id: connector.id },
      data: {
        metadata: mergeConnectorMetadata(connector.metadata, {
          mode: 'wireguard_management',
          wireguard: wireguard.metadata as any,
        }) as any,
      },
    });

    return res.json({
      connector: {
        id: connector.id,
        name: connector.name,
        cloudMode: connector.cloudMode,
      },
      management: {
        mode: 'wireguard_management',
        wireguard: {
          infrastructure: wireguard.infrastructure,
          profile: wireguard.profile,
          metadata: wireguard.metadata,
        },
      },
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// POST /api/edge/heartbeat — keep the edge alive and optionally refresh device states
router.post('/heartbeat', requireEdgeAuth, async (req: Request, res: Response) => {
  try {
    const devices = Array.isArray(req.body?.devices) ? req.body.devices.slice(0, 100) : [];
    const localSubnets = normalizeStringArray(req.body?.localSubnets);
    const edgeStatus = req.body?.status === 'degraded' ? 'degraded' : 'online';

    await prisma.edgeConnector.update({
      where: { id: req.edge!.id },
      data: {
        status: edgeStatus,
        hostname: typeof req.body?.hostname === 'string' ? req.body.hostname.trim() || null : undefined,
        version: typeof req.body?.version === 'string' ? req.body.version.trim() || null : undefined,
        lastSeenAt: new Date(),
        lastIp: requestIpAddress(req.headers, req.ip),
        localSubnets: localSubnets.length > 0 ? localSubnets : undefined,
      },
    });

    for (const rawDevice of devices) {
      if (!rawDevice || typeof rawDevice !== 'object') continue;
      const payload = rawDevice as Record<string, any>;

      const device = await resolveEdgeDevice(req.edge!.id, payload);
      if (!device) continue;

      const nextStatus = payload.status === 'offline'
        ? 'offline'
        : payload.status === 'unstable' || payload.status === 'degraded'
          ? 'unstable'
          : 'online';

      await prisma.device.update({
        where: { id: device.id },
        data: {
          status: nextStatus,
          ipAddress: typeof payload.ipAddress === 'string' && payload.ipAddress.trim() ? payload.ipAddress.trim() : device.ipAddress,
          lastHeartbeat: payload.lastHeartbeat ? parseOccurredAt(payload.lastHeartbeat) : new Date(),
        },
      });
    }

    return res.json({
      status: 'ok',
      serverTime: new Date().toISOString(),
      edgeId: req.edge!.id,
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/edge/sync-jobs — edge pulls jobs for the devices it owns
router.get('/sync-jobs', requireEdgeAuth, async (req: Request, res: Response) => {
  try {
    const limit = parseLimit(req.query.limit, 20, 100);
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + EDGE_QUEUE_LEASE_SECONDS * 1000);

    const jobs = await prisma.deviceSyncJob.findMany({
      where: {
        device: {
          edgeConnectorId: req.edge!.id,
          connectivityMode: 'edge',
        },
        OR: [
          { status: 'pending' },
          { status: 'retrying' },
          {
            status: 'in_progress',
            leaseExpiresAt: { lt: now },
          },
        ],
      },
      include: {
        device: {
          select: {
            id: true,
            name: true,
            ipAddress: true,
            port: true,
            username: true,
            serialNumber: true,
            localIdentifier: true,
            location: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    const claimedJobs = [];
    for (const job of jobs) {
      const claimed = await prisma.deviceSyncJob.update({
        where: { id: job.id },
        data: {
          status: 'in_progress',
          claimedByEdgeId: req.edge!.id,
          claimedAt: now,
          leaseExpiresAt,
          lastAttemptAt: now,
        },
        include: {
          device: {
            select: {
              id: true,
              name: true,
              ipAddress: true,
              port: true,
              username: true,
              serialNumber: true,
              localIdentifier: true,
              location: true,
            },
          },
        },
      });
      claimedJobs.push(claimed);
    }

    return res.json({
      edgeId: req.edge!.id,
      leaseSeconds: EDGE_QUEUE_LEASE_SECONDS,
      jobs: claimedJobs,
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// POST /api/edge/sync-jobs/:jobId/result — edge acknowledges the result of a claimed job
router.post('/sync-jobs/:jobId/result', requireEdgeAuth, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const success = Boolean(req.body?.success);
    const errorMessage = typeof req.body?.error === 'string' ? req.body.error.slice(0, 500) : null;

    const syncJob = await prisma.deviceSyncJob.findFirst({
      where: {
        id: jobId,
        device: {
          edgeConnectorId: req.edge!.id,
          connectivityMode: 'edge',
        },
      },
      include: {
        device: true,
      },
    });

    if (!syncJob) {
      return res.status(404).json({ message: 'Job não encontrado para este edge' });
    }

    if (syncJob.claimedByEdgeId && syncJob.claimedByEdgeId !== req.edge!.id) {
      return res.status(409).json({ message: 'Job está em posse de outro edge' });
    }

    const attempts = syncJob.attempts + 1;
    const isFinalFailure = !success && attempts >= 5;
    const nextStatus = success ? 'synced' : isFinalFailure ? 'failed' : 'retrying';

    const updatedJob = await prisma.deviceSyncJob.update({
      where: { id: syncJob.id },
      data: {
        status: nextStatus,
        attempts,
        lastError: success ? null : errorMessage || 'Falha reportada pelo edge',
        claimedByEdgeId: null,
        claimedAt: null,
        leaseExpiresAt: null,
      },
    });

    const payload = syncJob.payload as Record<string, any>;
    if (['user_insert', 'face_insert', 'user_update'].includes(syncJob.syncType)) {
      await prisma.deviceStudentLink.updateMany({
        where: {
          deviceId: syncJob.deviceId,
          userId: String(payload.UserID),
        },
        data: {
          syncStatus: success ? 'synced' : isFinalFailure ? 'failed' : 'pending',
        },
      });
    }

    await prisma.device.update({
      where: { id: syncJob.deviceId },
      data: {
        status: success ? 'online' : 'unstable',
        lastHeartbeat: new Date(),
      },
    });

    return res.json({ job: updatedJob });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// POST /api/edge/events — edge uploads normalized access events collected locally
router.post('/events', requireEdgeAuth, async (req: Request, res: Response) => {
  try {
    const rawEvents = Array.isArray(req.body?.events) ? req.body.events.slice(0, 100) : [];
    const io = req.app.get('io');

    await prisma.edgeConnector.update({
      where: { id: req.edge!.id },
      data: {
        status: 'online',
        lastSeenAt: new Date(),
        lastIp: requestIpAddress(req.headers, req.ip),
      },
    });

    const summary = {
      received: rawEvents.length,
      created: 0,
      duplicates: 0,
      failed: 0,
    };

    for (const rawEvent of rawEvents) {
      if (!rawEvent || typeof rawEvent !== 'object') {
        summary.failed += 1;
        continue;
      }

      const payload = rawEvent as Record<string, any>;
      const device = await resolveEdgeDevice(req.edge!.id, payload);
      if (!device) {
        summary.failed += 1;
        continue;
      }

      const occurredAt = parseOccurredAt(payload.occurredAt);
      const door = payload.door === undefined || payload.door === null ? null : Number(payload.door);
      const userIdRaw = payload.userIdRaw ?? payload.UserID ?? null;
      const idempotencyKey = typeof payload.idempotencyKey === 'string' && payload.idempotencyKey.trim()
        ? payload.idempotencyKey.trim()
        : `${req.edge!.id}_${device.id}_${Math.floor(occurredAt.getTime() / 1000)}_${String(userIdRaw || '')}_${String(door ?? 0)}`;

      // Persist only paths that are already cloud-safe. Device-local paths must not leak to the app UI.
      let photoPath: string | null = isCloudSafePhotoPath(payload.photoPath) ? payload.photoPath.trim() : null;
      const uploadedPath = await resolveEdgeEventPhoto(device, payload, occurredAt);
      if (uploadedPath) {
        photoPath = uploadedPath;
      }

      const result = await persistAccessEvent({
        schoolId: device.schoolUnit.school.id,
        deviceId: device.id,
        eventCode: typeof payload.eventCode === 'string' && payload.eventCode.trim() ? payload.eventCode.trim() : 'AccessControl',
        method: typeof payload.method === 'string' ? payload.method.trim() || null : null,
        door: Number.isNaN(door ?? Number.NaN) ? null : door,
        direction: normalizeDirection(payload.direction),
        status: typeof payload.status === 'string' && payload.status.trim() ? payload.status.trim() : 'granted',
        userIdRaw: userIdRaw ? String(userIdRaw) : null,
        cardNoRaw: payload.cardNoRaw ? String(payload.cardNoRaw) : null,
        photoPath,
        rawPayload: payload.rawPayload ?? payload,
        occurredAt,
        idempotencyKey,
      });

      if (result.duplicate) {
        summary.duplicates += 1;
        continue;
      }

      summary.created += 1;

      if (io) {
        io.to(`school:${device.schoolUnit.school.id}`).emit('access:new', {
          id: result.event.id,
          studentName: result.event.student?.name || 'Não identificado',
          method: result.event.method,
          direction: result.event.direction,
          status: result.event.status,
          deviceLocation: result.event.device.location || result.event.device.name,
          occurredAt: result.event.occurredAt,
        });
      }

      if (result.event.studentId) {
        try {
          const { triggerNotification } = await import('../services/n8nTrigger');
          await triggerNotification(result.event);
        } catch {
          // Notifications are best effort; event ingestion must keep flowing.
        }
      }
    }

    return res.json({ summary });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
