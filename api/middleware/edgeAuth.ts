import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';
import { hashSecret, secretsEqual } from '../services/edgeSecurity';

export interface EdgeAuthContext {
  id: string;
  name: string;
  schoolUnitId: string;
  schoolId: string;
  integratorId: string;
}

declare global {
  namespace Express {
    interface Request {
      edge?: EdgeAuthContext;
    }
  }
}

export async function requireEdgeAuth(req: Request, res: Response, next: NextFunction) {
  const edgeId = req.header('x-edge-id');
  const edgeKey = req.header('x-edge-key');

  if (!edgeId || !edgeKey) {
    return res.status(401).json({ message: 'Credenciais do edge ausentes' });
  }

  const edge = await prisma.edgeConnector.findUnique({
    where: { id: edgeId },
    include: {
      schoolUnit: {
        include: {
          school: {
            select: { id: true, integratorId: true },
          },
        },
      },
    },
  });

  if (!edge) {
    return res.status(401).json({ message: 'Edge não reconhecido' });
  }

  const providedHash = hashSecret(edgeKey);
  if (!secretsEqual(providedHash, edge.apiKeyHash)) {
    return res.status(401).json({ message: 'Credenciais do edge inválidas' });
  }

  if (edge.status === 'suspended') {
    return res.status(403).json({ message: 'Edge suspenso' });
  }

  req.edge = {
    id: edge.id,
    name: edge.name,
    schoolUnitId: edge.schoolUnitId,
    schoolId: edge.schoolUnit.school.id,
    integratorId: edge.schoolUnit.school.integratorId,
  };

  return next();
}
