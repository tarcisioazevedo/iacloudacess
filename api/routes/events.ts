import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../middleware/auth';
import { eventTenantWhere } from '../middleware/tenant';
import { getSignedUrl } from '../services/storageService';

const router = Router();
router.use(requireAuth);

// GET /api/events — paginated access events
router.get('/', async (req: Request, res: Response) => {
  try {
    const filter = eventTenantWhere(req.user);
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const skip = (page - 1) * limit;

    const [events, total] = await Promise.all([
      prisma.accessEvent.findMany({
        where: filter,
        include: {
          student: {
            select: {
              id: true, name: true, enrollment: true, classGroup: true,
              photo: { select: { base64Optimized: true } },
            },
          },
          device: { select: { id: true, name: true, location: true } },
        },
        orderBy: { occurredAt: 'desc' },
        take: limit,
        skip,
      }),
      prisma.accessEvent.count({ where: filter }),
    ]);

    return res.json({ events, total, page, pages: Math.ceil(total / limit) });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/events/:id/photo — Secure single-sign retrieval from S3 (Tenant isolated)
router.get('/:id/photo', async (req: Request, res: Response) => {
  try {
    // 1. Fetch strictly adhering to tenant isolation rules
    const event = await prisma.accessEvent.findFirst({
      where: { id: req.params.id, ...eventTenantWhere(req.user) },
      select: { photoPath: true }
    });

    if (!event) return res.status(404).json({ message: 'Evento inacessível ou não encontrado sob sua jurisdição' });
    if (!event.photoPath) return res.status(404).json({ message: 'Nenhum registro visual anexado a este evento' });

    // 2. Obtain a 5-minute ephemeral signed URL from Hetzner Object Storage
    const signedUrl = await getSignedUrl(event.photoPath, 300);
    
    // 3. Instead of streaming it through backend memory, redirect securely directly to Hetzner
    return res.redirect(302, signedUrl);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/events/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const event = await prisma.accessEvent.findFirst({
      where: { id: req.params.id, ...eventTenantWhere(req.user) },
      include: {
        student: true,
        device: true,
        notifications: true,
      },
    });
    if (!event) return res.status(404).json({ message: 'Evento não encontrado' });
    return res.json({ event });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/events/export — Download access events as CSV (tenant-scoped, last 30 days by default)
router.get('/export', async (req: Request, res: Response) => {
  try {
    const filter = eventTenantWhere(req.user);

    // Optional date range from query params
    const from = req.query.from ? new Date(req.query.from as string) : new Date(Date.now() - 30 * 86_400_000);
    const to   = req.query.to   ? new Date(req.query.to   as string) : new Date();

    const events = await prisma.accessEvent.findMany({
      where: { ...filter, occurredAt: { gte: from, lte: to } },
      include: {
        student: { select: { name: true, enrollment: true, classGroup: true } },
        device:  { select: { name: true, location: true } },
      },
      orderBy: { occurredAt: 'desc' },
      take: 10_000, // cap export to prevent abuse
    });

    const header = 'Data/Hora,Direção,Status,Aluno,Matrícula,Turma,Dispositivo,Local,Método\n';
    const rows = events.map(e => [
      new Date(e.occurredAt).toLocaleString('pt-BR'),
      e.direction,
      e.status,
      e.student?.name    || 'Não identificado',
      e.student?.enrollment || '',
      e.student?.classGroup || '',
      e.device?.name     || '',
      e.device?.location || '',
      e.method           || '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="eventos_${new Date().toISOString().split('T')[0]}.csv"`);
    return res.send('\uFEFF' + header + rows);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
