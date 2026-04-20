import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../lib/runtimeConfig';

const JWT_SECRET = getJwtSecret();

export interface AuthUser {
  profileId: string;
  role: string;
  integratorId: string | null;
  schoolId: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Middleware that verifies JWT and injects req.user
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Autenticação necessária' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: 'Token inválido ou expirado' });
  }
}

/**
 * Middleware that checks if user has one of the allowed roles
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: 'Autenticação necessária' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Acesso negado para este perfil' });
    }
    next();
  };
}
