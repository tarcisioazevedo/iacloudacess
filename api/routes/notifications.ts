import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../middleware/auth';
import { schoolTenantWhere } from '../middleware/tenant';

const router = Router();
router.use(requireAuth);

// GET /api/notifications — List notification jobs with filtering
router.get('/', async (req: Request, res: Response) => {
  try {
    const filter = schoolTenantWhere(req.user);
    const { status, limit = '50', offset = '0' } = req.query;

    const where: any = {
      event: { school: filter },
    };
    if (status && status !== 'all') where.status = status as string;

    const [notifications, total] = await Promise.all([
      prisma.notificationJob.findMany({
        where,
        include: {
          event: {
            select: {
              schoolId: true,
              student: { select: { name: true } },
              school: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit as string),
        skip: parseInt(offset as string),
      }),
      prisma.notificationJob.count({ where }),
    ]);

    const result = notifications.map(n => ({
      id: n.id,
      guardianName: n.recipientName || 'Desconhecido',
      guardianPhone: n.recipient,
      studentName: n.event.student?.name || 'Não identificado',
      schoolName: n.event.school?.name || '',
      channel: n.channel,
      status: n.status,
      message: n.template || '',
      sentAt: n.sentAt,
      errorMessage: n.lastError,
      attempts: n.attempts,
      createdAt: n.createdAt,
    }));

    return res.json({ notifications: result, total });
  } catch (err: any) {
    console.error('[Notifications] List error:', err.message);
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/notifications/stats — Notification pipeline stats
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const filter = schoolTenantWhere(req.user);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const stats = await prisma.notificationJob.groupBy({
      by: ['status'],
      where: { event: { school: filter }, createdAt: { gte: todayStart } },
      _count: true,
    });

    return res.json({
      total: stats.reduce((a, s) => a + s._count, 0),
      sent: stats.find(s => s.status === 'sent')?._count || 0,
      pending: stats.find(s => s.status === 'pending')?._count || 0,
      failed: stats.filter(s => ['failed', 'dead'].includes(s.status)).reduce((a, s) => a + s._count, 0),
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
