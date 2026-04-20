import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'crypto';
import { prisma } from '../prisma';
import { getJwtRefreshSecret, getJwtSecret } from '../lib/runtimeConfig';
import { sendPasswordResetEmail } from '../services/emailService';
import { validatePassword } from '../lib/passwordPolicy';

const router = Router();

const JWT_SECRET = getJwtSecret();
const JWT_REFRESH_SECRET = getJwtRefreshSecret();
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

interface TokenPayload {
  profileId: string;
  role: string;
  integratorId: string | null;
  schoolId: string | null;
}

function generateTokens(payload: TokenPayload) {
  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
  const refreshToken = jwt.sign({ profileId: payload.profileId }, JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
  return { accessToken, refreshToken };
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'E-mail e senha são obrigatórios' });
    }

    const profile = await prisma.profile.findUnique({ where: { email } });
    if (!profile || !profile.isActive) {
      return res.status(401).json({ message: 'Credenciais inválidas' });
    }

    const valid = await bcrypt.compare(password, profile.passwordHash);
    if (!valid) {
      return res.status(401).json({ message: 'Credenciais inválidas' });
    }

    const payload: TokenPayload = {
      profileId: profile.id,
      role: profile.role,
      integratorId: profile.integratorId,
      schoolId: profile.schoolId,
    };

    const { accessToken, refreshToken } = generateTokens(payload);

    // Update last login
    await prisma.profile.update({
      where: { id: profile.id },
      data: { lastLoginAt: new Date() },
    });

    // Set refresh token as httpOnly cookie
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.json({
      accessToken,
      profile: {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        role: profile.role,
        integratorId: profile.integratorId,
        schoolId: profile.schoolId,
      },
    });
  } catch (err: any) {
    console.error('[Auth] Login error:', err.message);
    return res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const token = req.cookies.refresh_token;
    if (!token) return res.status(401).json({ message: 'Refresh token ausente' });

    const decoded = jwt.verify(token, JWT_REFRESH_SECRET) as { profileId: string };
    const profile = await prisma.profile.findUnique({ where: { id: decoded.profileId } });
    if (!profile || !profile.isActive) {
      return res.status(401).json({ message: 'Sessão inválida' });
    }

    const payload: TokenPayload = {
      profileId: profile.id,
      role: profile.role,
      integratorId: profile.integratorId,
      schoolId: profile.schoolId,
    };

    const { accessToken, refreshToken } = generateTokens(payload);

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({ accessToken });
  } catch {
    return res.status(401).json({ message: 'Refresh token inválido' });
  }
});

// POST /api/auth/logout
router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('refresh_token');
  return res.json({ message: 'Logout realizado' });
});

// GET /api/auth/me
router.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Token ausente' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;

    const profile = await prisma.profile.findUnique({
      where: { id: decoded.profileId },
      select: { id: true, email: true, name: true, role: true, integratorId: true, schoolId: true },
    });

    if (!profile) return res.status(404).json({ message: 'Perfil não encontrado' });
    return res.json({ profile });
  } catch {
    return res.status(401).json({ message: 'Token inválido' });
  }
});

// ─── POST /api/auth/forgot-password ──────────────────────────────────────────
// Sends a password reset link to the user's email.
// Always returns 200 to prevent email enumeration attacks.
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'E-mail é obrigatório' });

    const normalizedEmail = email.trim().toLowerCase();
    const genericResponse = { message: 'Se o e-mail estiver cadastrado, você receberá um link de recuperação.' };

    const profile = await prisma.profile.findUnique({ where: { email: normalizedEmail } });
    if (!profile || !profile.isActive) {
      return res.json(genericResponse);
    }

    // Generate a secure random token
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    // Delete any existing reset token for this profile
    await prisma.$executeRaw`DELETE FROM password_reset_tokens WHERE profile_id = ${profile.id}`;

    // Store hashed token
    await prisma.$executeRaw`
      INSERT INTO password_reset_tokens (id, profile_id, token_hash, expires_at, created_at)
      VALUES (gen_random_uuid()::text, ${profile.id}, ${tokenHash}, ${expiresAt}, NOW())
    `;

    // Build reset URL
    const appUrl = process.env.APP_URL || 'https://app.iacloud.com.br';
    const resetUrl = `${appUrl}/login?reset=${rawToken}&email=${encodeURIComponent(normalizedEmail)}`;

    // Send email (non-blocking)
    sendPasswordResetEmail(normalizedEmail, profile.name, resetUrl).catch((err) => {
      console.error('[Auth] Failed to send reset email:', err.message);
    });

    return res.json(genericResponse);
  } catch (err: any) {
    console.error('[Auth] Forgot password error:', err.message);
    return res.status(500).json({ message: 'Erro ao processar solicitação' });
  }
});

// ─── POST /api/auth/reset-password ───────────────────────────────────────────
// Validates the reset token and updates the user's password.
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { email, token, newPassword } = req.body;
    if (!email || !token || !newPassword) {
      return res.status(400).json({ message: 'E-mail, token e nova senha são obrigatórios' });
    }

    // Validate password policy
    const passwordErrors = validatePassword(newPassword);
    if (passwordErrors.length > 0) {
      return res.status(422).json({ message: 'Senha não atende os requisitos', errors: passwordErrors });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const tokenHash = hashToken(token);

    const profile = await prisma.profile.findUnique({ where: { email: normalizedEmail } });
    if (!profile) {
      return res.status(400).json({ message: 'Token inválido ou expirado' });
    }

    // Verify token
    const records: any[] = await prisma.$queryRaw`
      SELECT id, expires_at FROM password_reset_tokens
      WHERE profile_id = ${profile.id} AND token_hash = ${tokenHash}
      LIMIT 1
    `;

    if (records.length === 0) {
      return res.status(400).json({ message: 'Token inválido ou expirado' });
    }

    const resetRecord = records[0];
    if (new Date() > new Date(resetRecord.expires_at)) {
      await prisma.$executeRaw`DELETE FROM password_reset_tokens WHERE id = ${resetRecord.id}`;
      return res.status(410).json({ message: 'Token expirado. Solicite uma nova recuperação.' });
    }

    // Update password
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.profile.update({
      where: { id: profile.id },
      data: { passwordHash },
    });

    // Delete all reset tokens for this profile
    await prisma.$executeRaw`DELETE FROM password_reset_tokens WHERE profile_id = ${profile.id}`;

    return res.json({ message: 'Senha redefinida com sucesso! Faça login com sua nova senha.' });
  } catch (err: any) {
    console.error('[Auth] Reset password error:', err.message);
    return res.status(500).json({ message: 'Erro ao redefinir senha' });
  }
});

// ─── GET /api/auth/password-policy ───────────────────────────────────────────
// Returns the password policy rules (for frontend display).
router.get('/password-policy', (_req: Request, res: Response) => {
  return res.json({
    rules: [
      { id: 'length', label: 'Mínimo 8 caracteres', regex: '.{8,}' },
      { id: 'upper', label: 'Pelo menos 1 letra maiúscula', regex: '[A-Z]' },
      { id: 'lower', label: 'Pelo menos 1 letra minúscula', regex: '[a-z]' },
      { id: 'number', label: 'Pelo menos 1 número', regex: '[0-9]' },
    ],
  });
});

export default router;
