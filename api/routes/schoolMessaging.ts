import axios from 'axios';
import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { schoolTenantWhere } from '../middleware/tenant';
import {
  buildSchoolInstanceName,
  connectEvolutionInstance,
  createEvolutionInstance,
  deleteEvolutionInstance,
  logoutEvolutionInstance,
  restartEvolutionInstance,
  sendEvolutionText,
  syncEvolutionInstance,
} from '../services/evolutionService';

const router = Router({ mergeParams: true });
router.use(requireAuth);

function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.response?.message
      || err.response?.data?.message
      || err.message;
  }
  return err instanceof Error ? err.message : 'Erro inesperado';
}

function serializeChannel(channel: any) {
  if (!channel) return null;

  return {
    id: channel.id,
    provider: channel.provider,
    instanceName: channel.instanceName,
    instanceId: channel.instanceId,
    instanceStatus: channel.instanceStatus,
    connectionState: channel.connectionState,
    phoneNumber: channel.phoneNumber,
    ownerJid: channel.ownerJid,
    profileName: channel.profileName,
    profileStatus: channel.profileStatus,
    pairingCode: channel.pairingCode,
    qrCodePayload: channel.qrCodePayload,
    lastQrAt: channel.lastQrAt,
    lastConnectedAt: channel.lastConnectedAt,
    lastDisconnectedAt: channel.lastDisconnectedAt,
    lastSyncAt: channel.lastSyncAt,
    lastError: channel.lastError,
    isActive: channel.isActive,
    metadata: channel.metadata,
    createdAt: channel.createdAt,
    updatedAt: channel.updatedAt,
  };
}

async function auditLog(req: Request, school: { id: string; integratorId: string }, action: string, details?: Record<string, unknown>) {
  await prisma.auditLog.create({
    data: {
      integratorId: school.integratorId,
      profileId: req.user?.profileId ?? null,
      action,
      entity: 'school_messaging_channel',
      entityId: school.id,
      details: (details ?? {}) as Prisma.InputJsonValue,
      ipAddress: req.ip ?? null,
    },
  });
}

async function loadSchool(req: Request) {
  return prisma.school.findFirst({
    where: { id: req.params.id, ...schoolTenantWhere(req.user) },
    include: {
      integrator: {
        select: { id: true, name: true, slug: true },
      },
    },
  });
}

async function persistChannelState(input: {
  school: { id: string; integratorId: string };
  actorId?: string | null;
  instanceName: string;
  channel?: any | null;
  connect?: { pairingCode: string | null; qrCodePayload: string | null; raw: any } | null;
  snapshot?: {
    instanceId: string | null;
    instanceStatus: string | null;
    connectionState: string | null;
    ownerJid: string | null;
    phoneNumber: string | null;
    profileName: string | null;
    profileStatus: string | null;
    raw: any;
  } | null;
  lastError?: string | null;
  preserveActive?: boolean;
}) {
  const now = new Date();
  const previousState = input.channel?.connectionState ?? null;
  const nextState = input.snapshot?.connectionState ?? input.channel?.connectionState ?? 'close';

  return prisma.schoolMessagingChannel.upsert({
    where: {
      schoolId_provider: {
        schoolId: input.school.id,
        provider: 'evolution',
      },
    },
    create: {
      integratorId: input.school.integratorId,
      schoolId: input.school.id,
      provider: 'evolution',
      instanceName: input.instanceName,
      instanceId: input.snapshot?.instanceId ?? null,
      instanceStatus: input.snapshot?.instanceStatus ?? 'created',
      connectionState: nextState,
      phoneNumber: input.snapshot?.phoneNumber ?? null,
      ownerJid: input.snapshot?.ownerJid ?? null,
      profileName: input.snapshot?.profileName ?? null,
      profileStatus: input.snapshot?.profileStatus ?? null,
      pairingCode: input.connect?.pairingCode ?? null,
      qrCodePayload: input.connect?.qrCodePayload ?? null,
      lastQrAt: input.connect?.qrCodePayload || input.connect?.pairingCode ? now : null,
      lastConnectedAt: nextState === 'open' ? now : null,
      lastDisconnectedAt: nextState === 'close' ? now : null,
      lastSyncAt: now,
      lastError: input.lastError ?? null,
      isActive: input.preserveActive ?? true,
      metadata: {
        connect: input.connect?.raw ?? null,
        snapshot: input.snapshot?.raw ?? null,
      },
      createdBy: input.actorId ?? null,
      updatedBy: input.actorId ?? null,
    },
    update: {
      integratorId: input.school.integratorId,
      instanceName: input.instanceName,
      instanceId: input.snapshot?.instanceId ?? input.channel?.instanceId ?? null,
      instanceStatus: input.snapshot?.instanceStatus ?? input.channel?.instanceStatus ?? null,
      connectionState: nextState,
      phoneNumber: input.snapshot?.phoneNumber ?? input.channel?.phoneNumber ?? null,
      ownerJid: input.snapshot?.ownerJid ?? input.channel?.ownerJid ?? null,
      profileName: input.snapshot?.profileName ?? input.channel?.profileName ?? null,
      profileStatus: input.snapshot?.profileStatus ?? input.channel?.profileStatus ?? null,
      pairingCode: input.connect?.pairingCode ?? input.channel?.pairingCode ?? null,
      qrCodePayload: input.connect?.qrCodePayload ?? input.channel?.qrCodePayload ?? null,
      lastQrAt: input.connect?.qrCodePayload || input.connect?.pairingCode
        ? now
        : input.channel?.lastQrAt ?? null,
      lastConnectedAt: previousState !== 'open' && nextState === 'open'
        ? now
        : input.channel?.lastConnectedAt ?? null,
      lastDisconnectedAt: previousState === 'open' && nextState !== 'open'
        ? now
        : input.channel?.lastDisconnectedAt ?? null,
      lastSyncAt: now,
      lastError: input.lastError ?? null,
      isActive: input.preserveActive ?? input.channel?.isActive ?? true,
      metadata: {
        connect: input.connect?.raw ?? input.channel?.metadata?.connect ?? null,
        snapshot: input.snapshot?.raw ?? input.channel?.metadata?.snapshot ?? null,
      },
      updatedBy: input.actorId ?? null,
    },
  });
}

router.get('/messaging/whatsapp', requireRole('superadmin', 'integrator_admin', 'integrator_support', 'school_admin'), async (req: Request, res: Response) => {
  try {
    const school = await loadSchool(req);
    if (!school) {
      return res.status(404).json({ message: 'Escola nao encontrada' });
    }

    const channel = await prisma.schoolMessagingChannel.findUnique({
      where: {
        schoolId_provider: {
          schoolId: school.id,
          provider: 'evolution',
        },
      },
    });

    if (!channel) {
      return res.json({
        school: {
          id: school.id,
          name: school.name,
          integratorName: school.integrator.name,
        },
        channel: null,
      });
    }

    let updatedChannel = channel;
    let syncError: string | null = null;

    try {
      const snapshot = await syncEvolutionInstance(channel.instanceName);
      if (snapshot) {
        let connectData = null;
        if (snapshot.connectionState === 'connecting' || (snapshot.connectionState === 'close' && channel.qrCodePayload)) {
          connectData = await connectEvolutionInstance(channel.instanceName).catch(() => null);
        }

        updatedChannel = await persistChannelState({
          school,
          actorId: req.user?.profileId,
          instanceName: channel.instanceName,
          channel,
          snapshot,
          connect: connectData,
        });
      }
    } catch (err) {
      syncError = getErrorMessage(err);
      updatedChannel = await persistChannelState({
        school,
        actorId: req.user?.profileId,
        instanceName: channel.instanceName,
        channel,
        lastError: syncError,
      });
    }

    return res.json({
      school: {
        id: school.id,
        name: school.name,
        integratorName: school.integrator.name,
      },
      channel: serializeChannel(updatedChannel),
      syncError,
    });
  } catch (err) {
    return res.status(500).json({ message: getErrorMessage(err) });
  }
});

router.post('/messaging/whatsapp/instance', requireRole('superadmin', 'integrator_admin', 'school_admin'), async (req: Request, res: Response) => {
  try {
    const school = await loadSchool(req);
    if (!school) {
      return res.status(404).json({ message: 'Escola nao encontrada' });
    }

    const existingChannel = await prisma.schoolMessagingChannel.findUnique({
      where: {
        schoolId_provider: {
          schoolId: school.id,
          provider: 'evolution',
        },
      },
    });

    const requestedInstanceName = typeof req.body?.instanceName === 'string' && req.body.instanceName.trim()
      ? req.body.instanceName.trim()
      : null;

    const instanceName = existingChannel?.instanceName
      || requestedInstanceName
      || buildSchoolInstanceName({
        integratorSlug: school.integrator.slug,
        schoolSlug: school.slug,
        schoolId: school.id,
      });

    let snapshot = await syncEvolutionInstance(instanceName).catch(() => null);
    if (!snapshot) {
      const created = await createEvolutionInstance(instanceName);
      snapshot = created.snapshot ?? null;
    }

    // First attempt to connect
    let connect = await connectEvolutionInstance(instanceName);

    // If connect returned no QR and no pairing code, the instance is stuck.
    // Delete it entirely and recreate from scratch.
    const hasQrOrCode = !!(connect.qrCodePayload || connect.pairingCode);
    if (!hasQrOrCode && snapshot?.connectionState !== 'open') {
      const restarted = await restartEvolutionInstance(instanceName);
      snapshot = restarted.snapshot;
      connect = restarted.connect;
    }

    const syncedSnapshot = await syncEvolutionInstance(instanceName).catch(() => snapshot);

    const channel = await persistChannelState({
      school,
      actorId: req.user?.profileId,
      instanceName,
      channel: existingChannel,
      connect,
      snapshot: syncedSnapshot,
    });

    await auditLog(req, school, 'school.messaging.instance_created', {
      schoolId: school.id,
      instanceName,
      connectionState: channel.connectionState,
    });

    return res.status(existingChannel ? 200 : 201).json({
      school: {
        id: school.id,
        name: school.name,
        integratorName: school.integrator.name,
      },
      channel: serializeChannel(channel),
    });
  } catch (err) {
    return res.status(500).json({ message: getErrorMessage(err) });
  }
});

router.post('/messaging/whatsapp/refresh', requireRole('superadmin', 'integrator_admin', 'integrator_support', 'school_admin'), async (req: Request, res: Response) => {
  try {
    const school = await loadSchool(req);
    if (!school) {
      return res.status(404).json({ message: 'Escola nao encontrada' });
    }

    const channel = await prisma.schoolMessagingChannel.findUnique({
      where: {
        schoolId_provider: {
          schoolId: school.id,
          provider: 'evolution',
        },
      },
    });

    if (!channel) {
      return res.status(404).json({ message: 'Canal WhatsApp ainda nao configurado para esta escola' });
    }

    const connect = await connectEvolutionInstance(channel.instanceName);
    const snapshot = await syncEvolutionInstance(channel.instanceName).catch(() => null);
    const updatedChannel = await persistChannelState({
      school,
      actorId: req.user?.profileId,
      instanceName: channel.instanceName,
      channel,
      connect,
      snapshot,
    });

    await auditLog(req, school, 'school.messaging.qr_refreshed', {
      schoolId: school.id,
      instanceName: channel.instanceName,
    });

    return res.json({
      channel: serializeChannel(updatedChannel),
    });
  } catch (err) {
    return res.status(500).json({ message: getErrorMessage(err) });
  }
});

router.post('/messaging/whatsapp/test-message', requireRole('superadmin', 'integrator_admin', 'school_admin'), async (req: Request, res: Response) => {
  try {
    const school = await loadSchool(req);
    if (!school) {
      return res.status(404).json({ message: 'Escola nao encontrada' });
    }

    const channel = await prisma.schoolMessagingChannel.findUnique({
      where: {
        schoolId_provider: {
          schoolId: school.id,
          provider: 'evolution',
        },
      },
    });

    if (!channel) {
      return res.status(404).json({ message: 'Canal WhatsApp ainda nao configurado para esta escola' });
    }

    if (channel.connectionState !== 'open') {
      return res.status(409).json({ message: 'A instancia desta escola ainda nao esta conectada ao WhatsApp' });
    }

    const phoneNumber = String(req.body?.phoneNumber || '').trim();
    if (!phoneNumber) {
      return res.status(400).json({ message: 'phoneNumber e obrigatorio' });
    }

    const message = String(req.body?.message || '').trim()
      || `Teste do canal oficial da escola ${school.name}. Se esta mensagem chegou, a instancia ${channel.instanceName} esta operacional.`;

    await sendEvolutionText(channel.instanceName, phoneNumber, message);

    await auditLog(req, school, 'school.messaging.test_sent', {
      schoolId: school.id,
      instanceName: channel.instanceName,
      phoneNumber,
    });

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: getErrorMessage(err) });
  }
});

router.post('/messaging/whatsapp/logout', requireRole('superadmin', 'integrator_admin', 'school_admin'), async (req: Request, res: Response) => {
  try {
    const school = await loadSchool(req);
    if (!school) {
      return res.status(404).json({ message: 'Escola nao encontrada' });
    }

    const channel = await prisma.schoolMessagingChannel.findUnique({
      where: {
        schoolId_provider: {
          schoolId: school.id,
          provider: 'evolution',
        },
      },
    });

    if (!channel) {
      return res.status(404).json({ message: 'Canal WhatsApp ainda nao configurado para esta escola' });
    }

    await logoutEvolutionInstance(channel.instanceName);

    const updatedChannel = await prisma.schoolMessagingChannel.update({
      where: { id: channel.id },
      data: {
        instanceStatus: 'logged_out',
        connectionState: 'close',
        pairingCode: null,
        qrCodePayload: null,
        lastDisconnectedAt: new Date(),
        lastSyncAt: new Date(),
        lastError: null,
        updatedBy: req.user?.profileId ?? null,
        metadata: {
          ...(channel.metadata as Record<string, unknown> | null),
          logout: { at: new Date().toISOString(), actorId: req.user?.profileId ?? null },
        },
      },
    });

    await auditLog(req, school, 'school.messaging.logout', {
      schoolId: school.id,
      instanceName: channel.instanceName,
    });

    return res.json({
      channel: serializeChannel(updatedChannel),
    });
  } catch (err) {
    return res.status(500).json({ message: getErrorMessage(err) });
  }
});

// ── Delete instance (nuke from Evolution + local DB) ──────────────────
router.post('/messaging/whatsapp/delete-instance', requireRole('superadmin', 'integrator_admin'), async (req: Request, res: Response) => {
  try {
    const school = await loadSchool(req);
    if (!school) {
      return res.status(404).json({ message: 'Escola nao encontrada' });
    }

    const channel = await prisma.schoolMessagingChannel.findUnique({
      where: {
        schoolId_provider: {
          schoolId: school.id,
          provider: 'evolution',
        },
      },
    });

    if (!channel) {
      return res.status(404).json({ message: 'Canal WhatsApp ainda nao configurado para esta escola' });
    }

    // 1. Delete from Evolution API (ignore if already gone)
    await deleteEvolutionInstance(channel.instanceName).catch(() => {});

    // 2. Remove from local DB
    await prisma.schoolMessagingChannel.delete({
      where: { id: channel.id },
    });

    await auditLog(req, school, 'school.messaging.instance_deleted', {
      schoolId: school.id,
      instanceName: channel.instanceName,
    });

    return res.json({
      ok: true,
      message: 'Instancia excluida com sucesso. Voce pode criar uma nova a qualquer momento.',
    });
  } catch (err) {
    return res.status(500).json({ message: getErrorMessage(err) });
  }
});

export default router;
