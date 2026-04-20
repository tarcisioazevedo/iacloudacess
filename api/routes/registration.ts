import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomInt } from 'crypto';
import { prisma } from '../prisma';
import { sendOtpEmail, sendWelcomeEmail } from '../services/emailService';
import { getJwtRefreshSecret, getJwtSecret } from '../lib/runtimeConfig';
import { validatePassword } from '../lib/passwordPolicy';

const router = Router();

const JWT_SECRET         = getJwtSecret();
const JWT_REFRESH_SECRET = getJwtRefreshSecret();
const OTP_TTL_MS         = 15 * 60 * 1000;   // 15 minutes
const MAX_ATTEMPTS       = 5;
const RESEND_COOLDOWN_MS = 5  * 60 * 1000;   // 5 minutes between resends

// Trial limits — read from PlatformConfig at runtime (fallback to env/defaults)
const TRIAL_MAX_SCHOOLS  = 1;
const TRIAL_MAX_DEVICES  = 1;
const TRIAL_DAYS         = 7;

/** Validate CNPJ checksum (Módulo 11) */
function isValidCnpj(raw: string): boolean {
  const d = raw.replace(/\D/g, '');
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (n: number) => {
    let s = 0, p = n - 7;
    for (let i = 0; i < n; i++) { s += parseInt(d[i]) * p--; if (p < 2) p = 9; }
    const r = s % 11; return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === parseInt(d[12]) && calc(13) === parseInt(d[13]);
}

/** Validate CPF checksum (Módulo 11) */
function isValidCpf(raw: string): boolean {
  const d = raw.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += parseInt(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11; return r === 10 ? 0 : r;
  };
  return calc(9) === parseInt(d[9]) && calc(10) === parseInt(d[10]);
}

function hashOtp(otp: string): string {
  return createHash('sha256').update(otp).digest('hex');
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let i = 2;
  while (await prisma.integrator.findUnique({ where: { slug } })) {
    slug = `${base}-${i++}`;
  }
  return slug;
}

// ─── POST /api/auth/trial/initiate ───────────────────────────────────────────
// Step 1 — Validate inputs, store pending registration, send OTP.

router.post('/trial/initiate', async (req: Request, res: Response) => {
  try {
    const { companyName, adminName, email, password, document } = req.body;

    if (!companyName?.trim()) return res.status(400).json({ message: '"companyName" é obrigatório' });
    if (!adminName?.trim())   return res.status(400).json({ message: '"adminName" é obrigatório' });
    if (!email?.trim())       return res.status(400).json({ message: '"email" é obrigatório' });
    if (!password) return res.status(400).json({ message: 'Senha é obrigatória' });
    const passwordErrors = validatePassword(password);
    if (passwordErrors.length > 0) {
      return res.status(422).json({ message: 'Senha não atende os requisitos', errors: passwordErrors });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // ── CNPJ/CPF validation & duplicate check ─────────────────────────────
    let normalizedDoc: string | null = null;
    let docType: 'cnpj' | 'cpf' | null = null;
    if (document) {
      const raw = String(document).replace(/\D/g, '');
      if (raw.length === 14) {
        if (!isValidCnpj(raw)) return res.status(400).json({ message: 'CNPJ inválido' });
        docType = 'cnpj';
      } else if (raw.length === 11) {
        if (!isValidCpf(raw)) return res.status(400).json({ message: 'CPF inválido' });
        docType = 'cpf';
      } else {
        return res.status(400).json({ message: 'Documento inválido — informe um CNPJ (14 dígitos) ou CPF (11 dígitos)' });
      }
      normalizedDoc = raw;

      // Check blocked documents (trial already used)
      const blocked = await prisma.blockedDocument.findUnique({ where: { document: raw } });
      if (blocked) {
        return res.status(409).json({
          message: `Este ${docType.toUpperCase()} já foi utilizado em um período de teste. Entre em contato para assinar um plano.`,
          code: 'DOCUMENT_BLOCKED',
        });
      }

      // Check active integrator with same CNPJ
      const existingIntegrator = await prisma.integrator.findFirst({ where: { cnpj: raw } });
      if (existingIntegrator) {
        return res.status(409).json({
          message: `Este ${docType.toUpperCase()} já possui uma conta registrada. Faça login ou recupere sua senha.`,
          code: 'DOCUMENT_EXISTS',
        });
      }
    }

    // Email already registered as a profile
    const existingProfile = await prisma.profile.findUnique({ where: { email: normalizedEmail } });
    if (existingProfile) {
      return res.status(409).json({ message: 'Este e-mail já possui uma conta. Faça login.' });
    }

    // Resend cooldown — if pending OTP was sent recently, throttle
    const existing = await prisma.pendingRegistration.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      const age = Date.now() - existing.createdAt.getTime();
      if (age < RESEND_COOLDOWN_MS) {
        const waitSec = Math.ceil((RESEND_COOLDOWN_MS - age) / 1000);
        return res.status(429).json({ message: `Aguarde ${waitSec}s antes de solicitar novo código.` });
      }
    }

    // Clean up expired records
    await prisma.pendingRegistration.deleteMany({ where: { expiresAt: { lt: new Date() } } });

    const otp           = randomInt(100_000, 999_999).toString();
    const otpHash       = hashOtp(otp);
    const passwordHash  = await bcrypt.hash(password, 12);
    const slug          = await uniqueSlug(generateSlug(companyName.trim()));
    const expiresAt     = new Date(Date.now() + OTP_TTL_MS);

    await prisma.pendingRegistration.upsert({
      where:  { email: normalizedEmail },
      create: {
        email: normalizedEmail,
        otpHash,
        payload:  { companyName: companyName.trim(), adminName: adminName.trim(), passwordHash, slug },
        expiresAt,
        document: normalizedDoc,
        docType,
      },
      update: {
        otpHash,
        payload:  { companyName: companyName.trim(), adminName: adminName.trim(), passwordHash, slug },
        expiresAt,
        attempts: 0,
        document: normalizedDoc,
        docType,
      },
    });

    await sendOtpEmail(normalizedEmail, adminName.trim(), otp);

    return res.json({ message: `Código enviado para ${normalizedEmail}. Válido por 15 minutos.` });
  } catch (err: any) {
    console.error('[Registration] initiate error:', err.message);
    return res.status(500).json({ message: 'Erro ao enviar código. Tente novamente.' });
  }
});

// ─── POST /api/auth/trial/confirm ────────────────────────────────────────────
// Step 2 — Verify OTP, create tenant, auto-login.

router.post('/trial/confirm', async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ message: 'E-mail e código são obrigatórios' });

    const normalizedEmail = email.trim().toLowerCase();

    const pending = await prisma.pendingRegistration.findUnique({ where: { email: normalizedEmail } });
    if (!pending) return res.status(404).json({ message: 'Nenhuma solicitação pendente para este e-mail. Inicie novamente.' });

    if (new Date() > pending.expiresAt) {
      await prisma.pendingRegistration.delete({ where: { email: normalizedEmail } });
      return res.status(410).json({ message: 'Código expirado. Solicite um novo.' });
    }

    if (pending.attempts >= MAX_ATTEMPTS) {
      await prisma.pendingRegistration.delete({ where: { email: normalizedEmail } });
      return res.status(429).json({ message: 'Tentativas excedidas. Solicite um novo código.' });
    }

    if (hashOtp(otp.trim()) !== pending.otpHash) {
      await prisma.pendingRegistration.update({
        where: { email: normalizedEmail },
        data:  { attempts: { increment: 1 } },
      });
      const remaining = MAX_ATTEMPTS - pending.attempts - 1;
      return res.status(401).json({ message: `Código incorreto. ${remaining} tentativa(s) restante(s).` });
    }

    // OTP valid — create tenant in a transaction
    const { companyName, adminName, passwordHash, slug } = pending.payload as {
      companyName: string; adminName: string; passwordHash: string; slug: string;
    };

    // Final check: slug or email may have been taken since initiate
    const [slugConflict, emailConflict] = await Promise.all([
      prisma.integrator.findUnique({ where: { slug } }),
      prisma.profile.findUnique({ where: { email: normalizedEmail } }),
    ]);
    const finalSlug = slugConflict ? await uniqueSlug(slug) : slug;
    if (emailConflict) {
      await prisma.pendingRegistration.delete({ where: { email: normalizedEmail } });
      return res.status(409).json({ message: 'Este e-mail já foi registrado. Faça login.' });
    }

    const now      = new Date();
    const validTo  = new Date(now.getTime() + TRIAL_DAYS * 86_400_000);

    // Final duplicate check on the document stored in pending record
    if (pending.document) {
      const blocked = await prisma.blockedDocument.findUnique({ where: { document: pending.document } });
      if (blocked) {
        await prisma.pendingRegistration.delete({ where: { email: normalizedEmail } });
        return res.status(409).json({
          message: `Este documento já foi utilizado em período de teste. Entre em contato para assinar.`,
          code: 'DOCUMENT_BLOCKED',
        });
      }
    }

    const { integrator, profile } = await prisma.$transaction(async (tx) => {
      const integrator = await tx.integrator.create({
        data: {
          name:           companyName,
          slug:           finalSlug,
          status:         'trial',
          cnpj:           pending.document ?? null,
          trialStartedAt: now,
        },
      });

      await tx.license.create({
        data: {
          integratorId: integrator.id,
          plan:        'trial',
          status:      'active',
          maxSchools:  TRIAL_MAX_SCHOOLS,
          maxDevices:  TRIAL_MAX_DEVICES,
          validFrom:   now,
          validTo,
        },
      });

      const profile = await tx.profile.create({
        data: {
          email:        normalizedEmail,
          name:         adminName,
          passwordHash,
          role:         'integrator_admin',
          integratorId: integrator.id,
        },
      });

      return { integrator, profile };
    });

    await prisma.pendingRegistration.delete({ where: { email: normalizedEmail } });

    // Send welcome email (non-blocking)
    const loginUrl = `${process.env.APP_URL || 'https://app.iacloud.com.br'}/login`;
    sendWelcomeEmail(normalizedEmail, adminName, companyName, loginUrl).catch(() => {});

    // Audit log
    await prisma.auditLog.create({
      data: {
        integratorId: integrator.id,
        profileId:    profile.id,
        action:       'trial.registered',
        entity:       'integrator',
        entityId:     integrator.id,
        details:      { plan: 'trial', companyName, adminName },
        ipAddress:    req.ip ?? null,
      },
    }).catch(() => {});

    // Auto-login: generate tokens
    const payload = {
      profileId:    profile.id,
      role:         profile.role,
      integratorId: profile.integratorId,
      schoolId:     null,
    };
    const accessToken  = jwt.sign(payload, JWT_SECRET,         { expiresIn: '15m' });
    const refreshToken = jwt.sign({ profileId: profile.id }, JWT_REFRESH_SECRET, { expiresIn: '7d' });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   7 * 24 * 60 * 60 * 1000,
    });

    return res.status(201).json({
      message: 'Conta criada com sucesso!',
      accessToken,
      profile: {
        id:           profile.id,
        email:        profile.email,
        name:         profile.name,
        role:         profile.role,
        integratorId: profile.integratorId,
      },
      trial: {
        companyName,
        validTo,
        maxSchools:  TRIAL_MAX_SCHOOLS,
        maxDevices:  TRIAL_MAX_DEVICES,
      },
    });
  } catch (err: any) {
    console.error('[Registration] confirm error:', err.message);
    return res.status(500).json({ message: 'Erro ao criar conta. Tente novamente.' });
  }
});

// ─── POST /api/auth/trial/resend ─────────────────────────────────────────────
// Resend OTP to the same email (respects RESEND_COOLDOWN_MS).

router.post('/trial/resend', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'E-mail é obrigatório' });

    const normalizedEmail = email.trim().toLowerCase();
    const pending = await prisma.pendingRegistration.findUnique({ where: { email: normalizedEmail } });
    if (!pending) return res.status(404).json({ message: 'Nenhuma solicitação pendente. Inicie o cadastro novamente.' });

    const age = Date.now() - pending.createdAt.getTime();
    if (age < RESEND_COOLDOWN_MS) {
      const waitSec = Math.ceil((RESEND_COOLDOWN_MS - age) / 1000);
      return res.status(429).json({ message: `Aguarde ${waitSec}s antes de reenviar.` });
    }

    const otp       = randomInt(100_000, 999_999).toString();
    const { adminName } = pending.payload as { adminName: string };

    await prisma.pendingRegistration.update({
      where: { email: normalizedEmail },
      data:  { otpHash: hashOtp(otp), expiresAt: new Date(Date.now() + OTP_TTL_MS), attempts: 0 },
    });

    await sendOtpEmail(normalizedEmail, adminName, otp);
    return res.json({ message: `Novo código enviado para ${normalizedEmail}.` });
  } catch (err: any) {
    return res.status(500).json({ message: 'Erro ao reenviar código.' });
  }
});

export default router;
