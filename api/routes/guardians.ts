import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { guardianTenantWhere, studentTenantWhere } from '../middleware/tenant';

const router = Router();
router.use(requireAuth);

// ─── GET /api/guardians — tenant-scoped via student→school chain ─────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    const guardianWhere = guardianTenantWhere(req.user);

    const guardians = await prisma.guardian.findMany({
      where: guardianWhere,
      include: {
        studentLinks: {
          include: {
            student: { select: { id: true, name: true, enrollment: true, schoolId: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return res.json({ guardians });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/guardians — create guardian ───────────────────────────────────
// Guardians are tenant-agnostic (shared entity), but they MUST be linked to a
// student on creation to establish the tenant chain. Otherwise they'd be orphaned.
router.post('/', requireRole('school_admin', 'integrator_admin', 'integrator_support', 'superadmin', 'coordinator'), async (req: Request, res: Response) => {
  try {
    const { name, phone, email, studentId, relation } = req.body;

    if (!name) return res.status(400).json({ message: 'Nome é obrigatório' });
    if (!studentId) return res.status(400).json({ message: 'studentId é obrigatório para vincular o responsável recém-criado.' });

    // Verify student belongs to caller's tenant
    const student = await prisma.student.findFirst({
      where: { id: studentId, ...studentTenantWhere(req.user) },
      select: { id: true },
    });

    if (!student) {
      return res.status(403).json({ message: 'Aluno não encontrado ou fora do seu escopo de acesso' });
    }

    // Enforce max 3 links per student
    const guardianCountForStudent = await prisma.studentGuardian.count({
      where: { studentId },
    });

    if (guardianCountForStudent >= 3) {
      return res.status(400).json({ message: 'Limite atingido: cada aluno pode ter no máximo 3 responsáveis vinculados.' });
    }

    // Atomic creation
    const link = await prisma.studentGuardian.create({
      data: {
        guardian: {
          create: { name, phone: phone || null, email: email || null },
        },
        student: { connect: { id: studentId } },
        relation: relation || 'Outro',
        notifyEntry: true,
        notifyExit: true,
        whatsappOn: true,
        emailOn: true,
        allowPhoto: false,
      },
      include: {
        guardian: true,
      }
    });

    return res.status(201).json({ guardian: link.guardian });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/guardians/:id/link — link guardian to student ─────────────────
// CRITICAL: validate that the studentId belongs to caller's tenant.
router.post('/:id/link', requireRole('school_admin', 'integrator_admin', 'integrator_support', 'superadmin', 'coordinator'), async (req: Request, res: Response) => {
  try {
    const { studentId, relation, priority, notifyEntry, notifyExit, whatsappOn, emailOn } = req.body;

    if (!studentId) return res.status(400).json({ message: 'studentId é obrigatório' });

    // ─── TENANT ENFORCEMENT ──────────────────────────────────────────────
    // Verify the student belongs to the caller's tenant
    const student = await prisma.student.findFirst({
      where: { id: studentId, ...studentTenantWhere(req.user) },
      select: { id: true },
    });

    if (!student) {
      return res.status(403).json({ message: 'Aluno não encontrado ou fora do seu escopo de acesso' });
    }

    // Verify guardian exists and is accessible to this tenant
    const guardian = await prisma.guardian.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!guardian) return res.status(404).json({ message: 'Responsável não encontrado' });

    // Check for duplicate link
    const existingLink = await prisma.studentGuardian.findUnique({
      where: { studentId_guardianId: { studentId, guardianId: req.params.id } },
    });
    if (existingLink) return res.status(409).json({ message: 'Vínculo já existe' });

    // Enforce max 3 links per student
    const guardianCountForStudent = await prisma.studentGuardian.count({
      where: { studentId },
    });

    if (guardianCountForStudent >= 3) {
      return res.status(400).json({ message: 'Limite atingido: cada aluno pode ter no máximo 3 responsáveis vinculados.' });
    }

    const { allowPhoto } = req.body;

    const link = await prisma.studentGuardian.create({
      data: {
        guardianId: req.params.id,
        studentId,
        relation: relation || 'Outro',
        priority: priority || 1,
        notifyEntry: notifyEntry ?? true,
        notifyExit: notifyExit ?? true,
        whatsappOn: whatsappOn ?? true,
        emailOn: emailOn ?? true,
        allowPhoto: allowPhoto ?? false,
      },
      include: {
        student: { select: { name: true } },
        guardian: { select: { name: true } },
      },
    });

    return res.status(201).json({ link });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── PUT /api/guardians/:id — update guardian info ───────────────────────────
// Validate guardian is in caller's tenant scope before allowing edits.
router.put('/:id', requireRole('school_admin', 'integrator_admin', 'integrator_support', 'superadmin', 'coordinator'), async (req: Request, res: Response) => {
  try {
    const { name, phone, email } = req.body;

    // ─── TENANT ENFORCEMENT ──────────────────────────────────────────────
    const guardian = await prisma.guardian.findFirst({
      where: { id: req.params.id, ...guardianTenantWhere(req.user) },
      select: { id: true },
    });

    if (!guardian) {
      return res.status(404).json({ message: 'Responsável não encontrado ou fora do seu escopo de acesso' });
    }

    const updated = await prisma.guardian.update({
      where: { id: req.params.id },
      data: {
        ...(name  !== undefined && { name }),
        ...(phone !== undefined && { phone }),
        ...(email !== undefined && { email }),
      },
    });

    return res.json({ guardian: updated });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── PUT /api/guardians/link/:linkId — update notification preferences ───────
// Validate link's student is in caller's tenant scope.
router.put('/link/:linkId', requireRole('school_admin', 'integrator_admin', 'integrator_support', 'superadmin', 'coordinator'), async (req: Request, res: Response) => {
  try {
    const { relation, priority, notifyEntry, notifyExit, whatsappOn, emailOn, allowPhoto } = req.body;

    // ─── TENANT ENFORCEMENT ──────────────────────────────────────────────
    // Load the link and verify the student belongs to this tenant
    const link = await prisma.studentGuardian.findFirst({
      where: {
        id: req.params.linkId,
        student: studentTenantWhere(req.user) as any,
      },
      select: { id: true },
    });

    if (!link) {
      return res.status(404).json({ message: 'Vínculo não encontrado ou fora do seu escopo de acesso' });
    }

    const updated = await prisma.studentGuardian.update({
      where: { id: req.params.linkId },
      data: {
        ...(relation    !== undefined && { relation }),
        ...(priority    !== undefined && { priority }),
        ...(notifyEntry !== undefined && { notifyEntry }),
        ...(notifyExit  !== undefined && { notifyExit }),
        ...(whatsappOn  !== undefined && { whatsappOn }),
        ...(emailOn     !== undefined && { emailOn }),
        ...(allowPhoto  !== undefined && { allowPhoto }),
      },
    });

    return res.json({ link: updated });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── DELETE /api/guardians/link/:linkId — remove student-guardian link ────────
router.delete('/link/:linkId', requireRole('school_admin', 'integrator_admin', 'integrator_support', 'superadmin', 'coordinator'), async (req: Request, res: Response) => {
  try {
    // ─── TENANT ENFORCEMENT ──────────────────────────────────────────────
    const link = await prisma.studentGuardian.findFirst({
      where: {
        id: req.params.linkId,
        student: studentTenantWhere(req.user) as any,
      },
      select: { id: true },
    });

    if (!link) {
      return res.status(404).json({ message: 'Vínculo não encontrado ou fora do seu escopo de acesso' });
    }

    await prisma.studentGuardian.delete({ where: { id: req.params.linkId } });
    return res.json({ message: 'Vínculo removido' });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
