import { PrismaClient } from '@prisma/client';
import { prisma } from '../prisma';

export interface DeviceOperationStatus {
  ok: boolean;
  isSchoolBlocked: boolean;
  isIntegratorBlocked: boolean;
  reason?: string;
  integratorId?: string;
  schoolId?: string;
}

/**
 * Verifica se um dispositivo pode sincronizar dados e enviar eventos com base nas
 * regras de faturamento e licença do Integrador e da Escola.
 *
 * Regras:
 * - Se a licença do integrador não for "active" ou se validTo < now(), bloqueia.
 * - Se o status da escola for bloqueada ("blocked"), bloqueia.
 */
export async function checkDeviceOperationStatus(deviceId: string, prismaClient: PrismaClient = prisma): Promise<DeviceOperationStatus> {
  const device = await prismaClient.device.findUnique({
    where: { id: deviceId },
    include: {
      schoolUnit: {
        include: {
          school: {
            include: {
              integrator: {
                include: {
                  licenses: {
                    where: { status: 'active' },
                    orderBy: { validTo: 'desc' },
                    take: 1
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  if (!device || !device.schoolUnit || !device.schoolUnit.school || !device.schoolUnit.school.integrator) {
    return {
      ok: false,
      isSchoolBlocked: true,
      isIntegratorBlocked: true,
      reason: 'Dispositivo sem associação válida na hierarquia Escola/Integrador.',
    };
  }

  const school = device.schoolUnit.school;
  const integrator = school.integrator;
  const license = integrator.licenses[0];

  let isSchoolBlocked = false;
  let isIntegratorBlocked = false;
  let reason: string | undefined;

  // 1. Verificação de bloqueio da escola (Fatura/Atraso)
  if (school.billingStatus === 'blocked' || school.status !== 'active') {
    isSchoolBlocked = true;
    reason = 'A unidade escolar informada encontra-se inativa ou bloqueada (Inadimplência). A comunicação do equipamento foi suspensa.';
  }

  // 2. Verificação de bloqueio do integrador / licença
  if (integrator.status !== 'active') {
    isIntegratorBlocked = true;
    reason = reason || 'O Integrador deste equipamento encontra-se suspenso.';
  } else if (!license || new Date(license.validTo) < new Date()) {
    isIntegratorBlocked = true;
    reason = reason || 'A licença corporativa do Integrador expirou. Atualize a licença para retomar a conectividade.';
  }

  return {
    ok: !isSchoolBlocked && !isIntegratorBlocked,
    isSchoolBlocked,
    isIntegratorBlocked,
    reason,
    integratorId: integrator.id,
    schoolId: school.id,
  };
}
