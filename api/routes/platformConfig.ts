/**
 * Platform Config — superadmin only
 * GET  /api/admin/platform-config         — read singleton
 * PUT  /api/admin/platform-config         — update singleton
 * POST /api/admin/platform-config/test-email — send test email
 * GET  /api/admin/blocked-documents       — list blocked CNPJ/CPF
 * DELETE /api/admin/blocked-documents/:id — unblock a document
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();
router.use(requireAuth);
router.use(requireRole('superadmin'));

// ─── GET ─────────────────────────────────────────────────────────────────────

router.get('/', async (_req: Request, res: Response) => {
  try {
    let cfg = await prisma.platformConfig.findUnique({ where: { id: 'singleton' } });
    if (!cfg) {
      // Auto-create with defaults on first access
      cfg = await prisma.platformConfig.create({
        data: { id: 'singleton' },
      });
    }
    // Strip SMTP password from response
    const { smtpPassEnc: _p, ...safe } = cfg as any;
    return res.json({ config: { ...safe, smtpPassConfigured: !!_p } });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── PUT ─────────────────────────────────────────────────────────────────────

router.put('/', async (req: Request, res: Response) => {
  try {
    const {
      trialDays, trialMaxSchools, trialMaxDevices, trialGraceDays, trialBlockOnExpiry,
      licenseGraceDays,
      smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom, smtpFromName, smtpSecure,
      emailTrialWelcome, emailLicenseExpiring30, emailLicenseExpiring7, emailLicenseExpiring1,
      emailLicenseExpired, emailLicenseGrace, emailTrialExpiring2d, emailTrialExpiring1d,
      emailTrialExpired, emailSchoolWarning, emailSchoolBlocked,
    } = req.body;

    const data: Record<string, any> = { updatedBy: req.user!.profileId };

    if (trialDays           !== undefined) data.trialDays           = Number(trialDays);
    if (trialMaxSchools      !== undefined) data.trialMaxSchools      = Number(trialMaxSchools);
    if (trialMaxDevices      !== undefined) data.trialMaxDevices      = Number(trialMaxDevices);
    if (trialGraceDays       !== undefined) data.trialGraceDays       = Number(trialGraceDays);
    if (trialBlockOnExpiry   !== undefined) data.trialBlockOnExpiry   = Boolean(trialBlockOnExpiry);
    if (licenseGraceDays     !== undefined) data.licenseGraceDays     = Number(licenseGraceDays);
    if (smtpHost             !== undefined) data.smtpHost             = smtpHost;
    if (smtpPort             !== undefined) data.smtpPort             = Number(smtpPort);
    if (smtpUser             !== undefined) data.smtpUser             = smtpUser;
    if (smtpFrom             !== undefined) data.smtpFrom             = smtpFrom;
    if (smtpFromName         !== undefined) data.smtpFromName         = smtpFromName;
    if (smtpSecure           !== undefined) data.smtpSecure           = Boolean(smtpSecure);
    // Only update password if explicitly provided (non-empty)
    if (smtpPass?.trim())                  data.smtpPassEnc          = smtpPass; // TODO: encrypt at rest
    if (emailTrialWelcome      !== undefined) data.emailTrialWelcome      = emailTrialWelcome;
    if (emailLicenseExpiring30 !== undefined) data.emailLicenseExpiring30 = emailLicenseExpiring30;
    if (emailLicenseExpiring7  !== undefined) data.emailLicenseExpiring7  = emailLicenseExpiring7;
    if (emailLicenseExpiring1  !== undefined) data.emailLicenseExpiring1  = emailLicenseExpiring1;
    if (emailLicenseExpired    !== undefined) data.emailLicenseExpired    = emailLicenseExpired;
    if (emailLicenseGrace      !== undefined) data.emailLicenseGrace      = emailLicenseGrace;
    if (emailTrialExpiring2d   !== undefined) data.emailTrialExpiring2d   = emailTrialExpiring2d;
    if (emailTrialExpiring1d   !== undefined) data.emailTrialExpiring1d   = emailTrialExpiring1d;
    if (emailTrialExpired      !== undefined) data.emailTrialExpired      = emailTrialExpired;
    if (emailSchoolWarning     !== undefined) data.emailSchoolWarning     = emailSchoolWarning;
    if (emailSchoolBlocked     !== undefined) data.emailSchoolBlocked     = emailSchoolBlocked;

    const cfg = await prisma.platformConfig.upsert({
      where:  { id: 'singleton' },
      create: { id: 'singleton', ...data },
      update: data,
    });

    const { smtpPassEnc: _p, ...safe } = cfg as any;
    return res.json({ config: { ...safe, smtpPassConfigured: !!_p } });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── POST /test-email ─────────────────────────────────────────────────────────

router.post('/test-email', async (req: Request, res: Response) => {
  try {
    const { to } = req.body;
    if (!to) return res.status(400).json({ message: '"to" é obrigatório' });

    const cfg = await prisma.platformConfig.findUnique({ where: { id: 'singleton' } });

    // Dynamic import nodemailer
    let nodemailer: any;
    try {
      const { createRequire } = await import('module');
      const require = createRequire(import.meta.url);
      nodemailer = require('nodemailer');
    } catch {
      return res.status(500).json({ message: 'nodemailer não instalado' });
    }

    const host  = cfg?.smtpHost  || process.env.SMTP_HOST || '';
    const port  = cfg?.smtpPort  || parseInt(process.env.SMTP_PORT || '587');
    const user  = cfg?.smtpUser  || process.env.SMTP_USER || '';
    const pass  = cfg?.smtpPassEnc || process.env.SMTP_PASS || '';
    const from  = cfg?.smtpFrom  || process.env.SMTP_FROM  || 'noreply@iacloud.com.br';

    if (!host || !user) {
      return res.status(422).json({ message: 'SMTP não configurado. Defina host e usuário primeiro.' });
    }

    const transporter = nodemailer.createTransport({
      host, port,
      secure: cfg?.smtpSecure ?? port === 465,
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
    });

    await transporter.sendMail({
      from,
      to,
      subject: '✅ Teste de e-mail — IA Cloud Access',
      html: `<p>Este é um e-mail de teste enviado pelo painel administrativo da plataforma.</p><p>Se você recebeu esta mensagem, o SMTP está configurado corretamente.</p>`,
    });

    return res.json({ message: `E-mail de teste enviado para ${to}` });
  } catch (err: any) {
    return res.status(500).json({ message: `Falha ao enviar: ${err.message}` });
  }
});

// ─── GET /api/admin/blocked-documents ────────────────────────────────────────

router.get('/blocked-documents', async (req: Request, res: Response) => {
  try {
    const { page = '1', perPage = '50', q } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(perPage);

    const where = q
      ? { document: { contains: q.replace(/\D/g, '') } }
      : {};

    const [items, total] = await Promise.all([
      prisma.blockedDocument.findMany({
        where,
        orderBy: { blockedAt: 'desc' },
        skip,
        take: parseInt(perPage),
      }),
      prisma.blockedDocument.count({ where }),
    ]);

    return res.json({ items, total, page: parseInt(page), perPage: parseInt(perPage) });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── DELETE /api/admin/blocked-documents/:id ─────────────────────────────────

router.delete('/blocked-documents/:id', async (req: Request, res: Response) => {
  try {
    const doc = await prisma.blockedDocument.findUnique({ where: { id: req.params.id } });
    if (!doc) return res.status(404).json({ message: 'Documento não encontrado' });
    await prisma.blockedDocument.delete({ where: { id: req.params.id } });
    return res.status(204).send();
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
