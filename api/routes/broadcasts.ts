import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { schoolTenantWhere } from '../middleware/tenant';
import { logger } from '../lib/logger';
import { broadcastQueue } from '../workers/broadcastWorker';

const router = Router({ mergeParams: true });
router.use(requireAuth);

/**
 * Resolve unique guardians matching the broadcast target scope.
 * Deduplicates: same guardian linked to 2 students only receives once.
 */
async function resolveRecipients(schoolId: string, scope: string, filter: any, channel: string) {
  let studentWhere: any = { schoolId, status: 'active' };

  if (scope === 'grade' && filter?.grades?.length) {
    studentWhere.grade = { in: filter.grades };
  }
  if (scope === 'classGroup' && filter?.classGroups?.length) {
    studentWhere.classGroup = { in: filter.classGroups };
  }
  if (scope === 'shift' && filter?.shifts?.length) {
    studentWhere.shift = { in: filter.shifts };
  }
  if (scope === 'custom' && filter) {
    if (filter.grades?.length) studentWhere.grade = { in: filter.grades };
    if (filter.classGroups?.length) studentWhere.classGroup = { in: filter.classGroups };
    if (filter.shifts?.length) studentWhere.shift = { in: filter.shifts };
  }

  const links = await prisma.studentGuardian.findMany({
    where: {
      student: studentWhere,
      ...(channel === 'whatsapp' ? { whatsappOn: true } : {}),
      ...(channel === 'email' ? { emailOn: true } : {}),
    },
    include: { guardian: true },
  });

  // Deduplicate by guardian ID
  const seen = new Map<string, { guardianId: string; name: string; phone: string | null; email: string | null }>();
  for (const link of links) {
    if (seen.has(link.guardianId)) continue;
    seen.set(link.guardianId, {
      guardianId: link.guardianId,
      name: link.guardian.name,
      phone: link.guardian.phone,
      email: link.guardian.email,
    });
  }

  return Array.from(seen.values());
}

// GET /api/schools/:id/broadcasts — list broadcasts
router.get('/broadcasts', requireRole('school_admin', 'integrator_admin', 'superadmin', 'coordinator'), async (req: Request, res: Response) => {
  try {
    const school = await prisma.school.findFirst({
      where: { id: req.params.id, ...schoolTenantWhere(req.user) },
      select: { id: true },
    });
    if (!school) return res.status(404).json({ message: 'Escola não encontrada' });

    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '20'), 10)));

    const [broadcasts, total] = await Promise.all([
      prisma.schoolBroadcast.findMany({
        where: { schoolId: school.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.schoolBroadcast.count({ where: { schoolId: school.id } }),
    ]);

    return res.json({ broadcasts, total, page, limit });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// POST /api/schools/:id/broadcasts — create draft
router.post('/broadcasts', requireRole('school_admin', 'integrator_admin', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const school = await prisma.school.findFirst({
      where: { id: req.params.id, ...schoolTenantWhere(req.user) },
      select: { id: true },
    });
    if (!school) return res.status(404).json({ message: 'Escola não encontrada' });

    const { title, message, channel, targetScope, targetFilter, scheduledAt } = req.body;

    if (!title?.trim() || !message?.trim()) {
      return res.status(400).json({ message: 'Título e mensagem são obrigatórios' });
    }

    // Preview: count recipients
    const recipients = await resolveRecipients(
      school.id,
      targetScope || 'all',
      targetFilter,
      channel || 'whatsapp',
    );

    const broadcast = await prisma.schoolBroadcast.create({
      data: {
        schoolId: school.id,
        title: title.trim(),
        message: message.trim(),
        channel: channel || 'whatsapp',
        targetScope: targetScope || 'all',
        targetFilter: targetFilter || null,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        totalRecipients: recipients.length,
        createdById: req.user?.profileId || null,
      },
    });

    return res.status(201).json({ broadcast, recipientPreview: recipients.length });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/schools/:id/broadcasts/:bid — details with delivery status
router.get('/broadcasts/:bid', requireRole('school_admin', 'integrator_admin', 'superadmin', 'coordinator'), async (req: Request, res: Response) => {
  try {
    const school = await prisma.school.findFirst({
      where: { id: req.params.id, ...schoolTenantWhere(req.user) },
      select: { id: true },
    });
    if (!school) return res.status(404).json({ message: 'Escola não encontrada' });

    const broadcast = await prisma.schoolBroadcast.findFirst({
      where: { id: req.params.bid, schoolId: school.id },
      include: {
        deliveries: {
          select: { id: true, channel: true, recipient: true, status: true, sentAt: true, lastError: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!broadcast) return res.status(404).json({ message: 'Comunicado não encontrado' });
    return res.json({ broadcast });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// POST /api/schools/:id/broadcasts/:bid/send — trigger delivery
router.post('/broadcasts/:bid/send', requireRole('school_admin', 'integrator_admin', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const school = await prisma.school.findFirst({
      where: { id: req.params.id, ...schoolTenantWhere(req.user) },
      select: { id: true, integratorId: true },
    });
    if (!school) return res.status(404).json({ message: 'Escola não encontrada' });

    const broadcast = await prisma.schoolBroadcast.findFirst({
      where: { id: req.params.bid, schoolId: school.id },
    });

    if (!broadcast) return res.status(404).json({ message: 'Comunicado não encontrado' });
    if (broadcast.status === 'sending' || broadcast.status === 'sent') {
      return res.status(409).json({ message: 'Comunicado já está sendo enviado ou já foi enviado' });
    }

    // Resolve recipients and create delivery records
    const recipients = await resolveRecipients(
      school.id,
      broadcast.targetScope,
      broadcast.targetFilter as any,
      broadcast.channel,
    );

    if (recipients.length === 0) {
      return res.status(400).json({ message: 'Nenhum destinatário encontrado para os filtros selecionados' });
    }

    // Create delivery records
    const deliveryData = recipients.map(r => ({
      broadcastId: broadcast.id,
      guardianId: r.guardianId,
      channel: broadcast.channel === 'all' ? 'whatsapp' : broadcast.channel,
      recipient: broadcast.channel === 'email' ? (r.email || '') : (r.phone || ''),
      status: 'pending',
    })).filter(d => d.recipient); // Skip empty recipients

    await prisma.broadcastDelivery.createMany({ data: deliveryData });

    // Update broadcast status
    await prisma.schoolBroadcast.update({
      where: { id: broadcast.id },
      data: {
        status: 'sending',
        sentAt: new Date(),
        totalRecipients: deliveryData.length,
      },
    });

    // Enqueue to BullMQ in batches
    const BATCH_SIZE = 50;
    for (let i = 0; i < deliveryData.length; i += BATCH_SIZE) {
      await broadcastQueue.add('process_broadcast_batch', {
        broadcastId: broadcast.id,
        schoolId: school.id,
        message: broadcast.message,
        title: broadcast.title,
        batchOffset: i,
        batchSize: BATCH_SIZE,
      }, {
        attempts: 2,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: true,
      });
    }

    logger.info(`[Broadcasts] Dispatched ${deliveryData.length} deliveries for broadcast ${broadcast.id}`);
    return res.json({ message: `Enviando para ${deliveryData.length} destinatários`, totalRecipients: deliveryData.length });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// DELETE /api/schools/:id/broadcasts/:bid — delete draft
router.delete('/broadcasts/:bid', requireRole('school_admin', 'integrator_admin', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const school = await prisma.school.findFirst({
      where: { id: req.params.id, ...schoolTenantWhere(req.user) },
      select: { id: true },
    });
    if (!school) return res.status(404).json({ message: 'Escola não encontrada' });

    const broadcast = await prisma.schoolBroadcast.findFirst({
      where: { id: req.params.bid, schoolId: school.id },
    });

    if (!broadcast) return res.status(404).json({ message: 'Comunicado não encontrado' });
    if (broadcast.status === 'sending') {
      return res.status(409).json({ message: 'Não é possível excluir um comunicado em envio' });
    }

    await prisma.schoolBroadcast.delete({ where: { id: broadcast.id } });
    return res.json({ message: 'Comunicado excluído' });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
