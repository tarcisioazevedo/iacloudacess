import { Router, Request, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import crypto from 'crypto';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { studentTenantWhere } from '../middleware/tenant';
import { uploadFile, BUCKETS } from '../services/storageService';
import { validateAndOptimizePhoto } from '../services/photoValidator';
import { logger } from '../lib/logger';
import { auditMiddleware } from '../middleware/auditLogger';

/** Generate a unique numeric accessId for device synchronization (Intelbras requires numeric) */
function generateAccessId(): string {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const router = Router();
router.use(requireAuth);

// GET /api/students
router.get('/', async (req: Request, res: Response) => {
  try {
    const filter = studentTenantWhere(req.user);

    // Pagination
    const page  = Math.max(1, parseInt(String(req.query.page  || '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10)));
    const skip  = (page - 1) * limit;

    // Search filter — supports name and enrollment (partial, case-insensitive)
    const search = req.query.search ? String(req.query.search).trim() : undefined;
    const searchWhere = search
      ? {
          OR: [
            { name:       { contains: search, mode: 'insensitive' as const } },
            { enrollment: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    // Status filter (default: active)
    const statusFilter = req.query.status ? String(req.query.status) : 'active';

    const [students, total] = await Promise.all([
      prisma.student.findMany({
        where: { ...filter, status: statusFilter, ...searchWhere },
        include: {
          photo: { select: { storagePath: true, validationStatus: true } },
          deviceLinks: { select: { syncStatus: true, deviceId: true, userId: true } },
          school: { select: { name: true } },
        },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      prisma.student.count({
        where: { ...filter, status: statusFilter, ...searchWhere },
      }),
    ]);

    return res.json({ students, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/students/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const student = await prisma.student.findFirst({
      where: { id: req.params.id, ...studentTenantWhere(req.user) },
      include: {
        photo: true,
        guardianLinks: { include: { guardian: true } },
        deviceLinks: true,
        school: { select: { name: true, slug: true } },
      },
    });
    if (!student) return res.status(404).json({ message: 'Aluno não encontrado' });
    return res.json({ student });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// POST /api/students
router.post('/', requireRole('school_admin', 'integrator_admin', 'superadmin'), auditMiddleware('CREATE', 'Student'), async (req: Request, res: Response) => {
  try {
    const { name, accessId: manualAccessId, enrollment, grade, classGroup, shift, schoolId } = req.body;

    // ── Input validation ──────────────────────────────────────────
    const errors: string[] = [];
    if (!name || typeof name !== 'string' || !name.trim()) errors.push('name (nome) é obrigatório');
    if (errors.length) return res.status(400).json({ message: 'Dados inválidos', errors });

    const targetSchoolId = schoolId || req.user?.schoolId;
    if (!targetSchoolId) return res.status(400).json({ message: 'schoolId é obrigatório' });

    // ── Tenant isolation ──────────────────────────────────────────
    if (req.user?.role !== 'superadmin') {
      const schoolScope = req.user?.integratorId
        ? { id: targetSchoolId, integratorId: req.user.integratorId }
        : req.user?.schoolId
          ? { id: req.user.schoolId }
          : null;

      if (!schoolScope) {
        return res.status(403).json({ message: 'Sem permissão para criar alunos nesta escola' });
      }

      const school = await prisma.school.findFirst({ where: schoolScope, select: { id: true } });
      if (!school) return res.status(403).json({ message: 'Sem permissão para criar alunos nesta escola' });
    }

    // ── Duplicate enrollment check (only if enrollment provided) ──
    const enrollmentValue = enrollment?.trim() || null;
    if (enrollmentValue) {
      const duplicate = await prisma.student.findFirst({
        where: { schoolId: targetSchoolId, enrollment: enrollmentValue },
        select: { id: true },
      });
      if (duplicate) {
        return res.status(409).json({ message: `Matrícula '${enrollmentValue}' já existe nesta escola` });
      }
    }

    // ── Generate unique accessId for device sync (Intelbras requires numeric) ──
    const sanitizedManualId = manualAccessId ? manualAccessId.replace(/\D/g, '') : null;
    const accessId = sanitizedManualId || generateAccessId();

    const student = await prisma.student.create({
      data: {
        name: name.trim(),
        accessId,
        enrollment: enrollmentValue,
        grade: grade?.trim() || null,
        classGroup: classGroup?.trim() || null,
        shift: shift?.trim() || null,
        schoolId: targetSchoolId,
      },
    });
    return res.status(201).json({ student });
  } catch (err: any) {
    // Prisma unique constraint violation (belt-and-suspenders fallback)
    if (err.code === 'P2002') {
      return res.status(409).json({ message: 'Matrícula já cadastrada nesta escola' });
    }
    return res.status(500).json({ message: err.message });
  }
});

// PUT /api/students/:id
router.put('/:id', requireRole('school_admin', 'integrator_admin', 'superadmin'), auditMiddleware('UPDATE', 'Student'), async (req: Request, res: Response) => {
  try {
    const { name, enrollment, grade, classGroup, shift, status } = req.body;

    // Verify ownership before updating (tenant isolation)
    const existing = await prisma.student.findFirst({
      where: { id: req.params.id, ...studentTenantWhere(req.user) },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ message: 'Aluno não encontrado ou sem permissão' });

    // accessId is NEVER editable — it's the device-level identifier
    const student = await prisma.student.update({
      where: { id: req.params.id },
      data: { name, enrollment: enrollment || undefined, grade, classGroup, shift, status },
    });
    return res.json({ student });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// DELETE /api/students/:id (soft delete)
router.delete('/:id', requireRole('school_admin', 'integrator_admin', 'superadmin'), async (req: Request, res: Response) => {
  try {
    // Verify ownership before soft-deleting (tenant isolation)
    const existing = await prisma.student.findFirst({
      where: { id: req.params.id, ...studentTenantWhere(req.user) },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ message: 'Aluno não encontrado ou sem permissão' });

    await prisma.student.update({
      where: { id: req.params.id },
      data: { status: 'inactive' },
    });
    return res.json({ message: 'Aluno desativado' });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── Photo Upload ────────────────────────────
// POST /api/students/:id/photo
router.post('/:id/photo', requireRole('school_admin', 'integrator_admin', 'superadmin', 'coordinator'),
  upload.single('photo'), async (req: Request, res: Response) => {
    try {
      const student = await prisma.student.findFirst({
        where: { id: req.params.id, ...studentTenantWhere(req.user) },
      });
      if (!student) return res.status(404).json({ message: 'Aluno não encontrado' });
      if (!req.file) return res.status(400).json({ message: 'Nenhuma foto enviada' });

      // Validate and optimize for Intelbras device constraints (min 150x300, max 100KB, JPEG)
      const validation = await validateAndOptimizePhoto(req.file.buffer);
      if (!validation.valid) {
        return res.status(422).json({ message: 'Foto inválida', errors: validation.errors });
      }

      // Resize to storage-quality version (480×640 portrait)
      const processed = await sharp(req.file.buffer)
        .resize(480, 640, { fit: 'cover', position: 'top' })
        .jpeg({ quality: 85 })
        .toBuffer();

      // Fetch integratorId for tenant-aware storage path
      const school = await prisma.school.findUnique({
        where: { id: student.schoolId },
        select: { integratorId: true },
      });

      // Store full-size in Hetzner S3 with tenant-hierarchical path
      const storagePrefix = school?.integratorId
        ? `integrator_${school.integratorId}/school_${student.schoolId}`
        : `school_${student.schoolId}`;
      const storagePath = await uploadFile(
        BUCKETS.STUDENT_PHOTOS,
        `${storagePrefix}/${student.id}.jpg`,
        processed,
        'image/jpeg'
      );

      // Upsert photo record — base64Optimized comes from validator (≤100KB, Intelbras-ready)
      await prisma.studentPhoto.upsert({
        where: { studentId: student.id },
        update: {
          storagePath,
          base64Optimized: validation.base64!,
          width: validation.width,
          height: validation.height,
          sizeBytes: validation.sizeBytes,
          validationStatus: 'approved',
          validationErrors: [],
        },
        create: {
          studentId: student.id,
          storagePath,
          base64Optimized: validation.base64!,
          width: validation.width,
          height: validation.height,
          sizeBytes: validation.sizeBytes,
          validationStatus: 'approved',
          validationErrors: [],
        },
      });

      // Mark device links as needing re-sync
      await prisma.deviceStudentLink.updateMany({
        where: { studentId: student.id },
        data: { syncStatus: 'pending' },
      });

      logger.info('Student photo uploaded', { studentId: student.id, size: processed.length });
      return res.json({ message: 'Foto salva com sucesso' });
    } catch (err: any) {
      logger.error('Photo upload failed', { error: err.message });
      return res.status(500).json({ message: err.message });
    }
  }
);

// ─── CSV Import ──────────────────────────────
// POST /api/students/import-csv
router.post('/import-csv',
  requireRole('school_admin', 'integrator_admin', 'superadmin'),
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'Nenhum arquivo enviado' });
      const schoolId = req.body.schoolId || req.user?.schoolId;
      if (!schoolId) return res.status(400).json({ message: 'schoolId é obrigatório' });

      // Parse CSV (handle BOM + common separators)
      let csv = req.file.buffer.toString('utf-8').replace(/^\uFEFF/, '');
      const separator = csv.includes(';') ? ';' : ',';
      const lines = csv.split(/\r?\n/).filter(l => l.trim());
      
      if (lines.length < 2) {
        return res.status(400).json({ message: 'Arquivo deve ter cabeçalho e pelo menos 1 linha' });
      }

      // Parse header (case-insensitive, flexible names)
      const header = lines[0].split(separator).map(h => h.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
      const colMap: Record<string, number> = {};
      const aliases: Record<string, string[]> = {
        name: ['nome', 'name', 'aluno', 'nome completo', 'nome_completo'],
        enrollment: ['matricula', 'enrollment', 'ra', 'registro', 'codigo'],
        grade: ['serie', 'grade', 'ano', 'ano/serie'],
        classGroup: ['turma', 'class', 'class_group', 'grupo'],
        shift: ['turno', 'shift', 'periodo'],
      };

      for (const [field, names] of Object.entries(aliases)) {
        const idx = header.findIndex(h => names.includes(h));
        if (idx >= 0) colMap[field] = idx;
      }

      if (colMap.name === undefined || colMap.enrollment === undefined) {
        return res.status(400).json({
          message: 'Colunas obrigatórias não encontradas. O CSV deve ter ao menos: Nome, Matrícula',
          detectedColumns: header,
        });
      }

      // Track classes to avoid redundant upserts
      const registeredClasses = new Set<string>();
      const results = { created: 0, updated: 0, errors: [] as { line: number; error: string }[] };

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(separator).map(c => c.trim().replace(/^"|"$/g, ''));
        const name = cols[colMap.name];
        const enrollment = cols[colMap.enrollment];

        if (!name || !enrollment) {
          results.errors.push({ line: i + 1, error: 'Nome ou matrícula vazio' });
          continue;
        }

        try {
          const gradeValue = colMap.grade !== undefined ? cols[colMap.grade] || 'Sem Série' : 'Sem Série';
          const classGroupValue = colMap.classGroup !== undefined ? cols[colMap.classGroup] || 'Sem Turma' : 'Sem Turma';
          const shiftValue = colMap.shift !== undefined ? cols[colMap.shift] || 'manhã' : 'manhã';

          // Auto-feed the SchoolClass catalog
          const classKey = `${gradeValue}|${classGroupValue}|${shiftValue}`.toLowerCase();
          if (!registeredClasses.has(classKey)) {
            registeredClasses.add(classKey);
            await prisma.schoolClass.upsert({
              where: {
                schoolId_grade_classGroup_shift: {
                  schoolId,
                  grade: gradeValue,
                  classGroup: classGroupValue,
                  shift: shiftValue.toLowerCase(),
                }
              },
              update: {},
              create: {
                schoolId,
                grade: gradeValue,
                classGroup: classGroupValue,
                shift: shiftValue.toLowerCase(),
              }
            }).catch(() => { /* ignore dups if perfectly concurrent */ });
          }

          const existing = await prisma.student.findFirst({
            where: { schoolId, enrollment },
          });

          if (existing) {
            await prisma.student.update({
              where: { id: existing.id },
              data: {
                name,
                enrollment,
                grade: gradeValue,
                classGroup: classGroupValue,
                shift: shiftValue.toLowerCase(),
                status: 'active',
              },
            });
            results.updated++;
          } else {
            await prisma.student.create({
              data: {
                name,
                accessId: generateAccessId(),
                enrollment,
                grade: gradeValue,
                classGroup: classGroupValue,
                shift: shiftValue.toLowerCase(),
                schoolId,
                status: 'active',
              },
            });
            results.created++;
          }
        } catch (err: any) {
          results.errors.push({ line: i + 1, error: err.message?.substring(0, 100) || 'Erro desconhecido' });
        }
      }

      logger.info('CSV import completed', { schoolId, ...results, errorCount: results.errors.length });
      return res.json({
        message: `Importação concluída: ${results.created} criados, ${results.updated} atualizados, ${results.errors.length} erros`,
        ...results,
      });
    } catch (err: any) {
      logger.error('CSV import failed', { error: err.message });
      return res.status(500).json({ message: err.message });
    }
  }
);

// ─── CSV Export ──────────────────────────────
// GET /api/students/export — Download all students as CSV (respects tenant filter)
router.get('/export', requireRole('school_admin', 'integrator_admin', 'superadmin', 'coordinator'), async (req: Request, res: Response) => {
  try {
    const filter = studentTenantWhere(req.user);
    const students = await prisma.student.findMany({
      where: { ...filter, status: { not: 'deleted' } },
      include: { school: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });

    const header = 'Nome,Matrícula,Série,Turma,Turno,Status,Escola\n';
    const rows = students.map(s =>
      [s.name, s.enrollment, s.grade || '', s.classGroup || '', s.shift || '', s.status, s.school?.name || '']
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="alunos_${new Date().toISOString().split('T')[0]}.csv"`);
    return res.send('\uFEFF' + header + rows); // BOM for Excel compatibility
  } catch (err: any) {
    logger.error('CSV export failed', { error: err.message });
    return res.status(500).json({ message: err.message });
  }
});

export default router;
