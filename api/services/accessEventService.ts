import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';

export interface PersistAccessEventInput {
  schoolId: string;
  deviceId: string;
  eventCode: string;
  method?: string | null;
  door?: number | null;
  direction?: string | null;
  status: string;
  userIdRaw?: string | null;
  cardNoRaw?: string | null;
  photoPath?: string | null;
  rawPayload?: unknown;
  occurredAt: Date;
  idempotencyKey: string;
}

function toJsonInput(value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

export async function persistAccessEvent(input: PersistAccessEventInput) {
  const existing = await prisma.accessEvent.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    include: {
      student: true,
      device: true,
    },
  });

  if (existing) {
    return { event: existing, duplicate: true as const };
  }

  let studentId: string | null = null;
  let finalStatus = input.status;

  if (input.userIdRaw) {
    const link = await prisma.deviceStudentLink.findFirst({
      where: {
        deviceId: input.deviceId,
        userId: String(input.userIdRaw),
      },
    });

    if (link) {
      studentId = link.studentId;
    } else if (input.status === 'granted') {
      finalStatus = 'pending_link';
    }
  }

  const event = await prisma.accessEvent.create({
    data: {
      schoolId: input.schoolId,
      deviceId: input.deviceId,
      studentId,
      eventCode: input.eventCode,
      method: input.method || null,
      door: input.door ?? null,
      direction: input.direction || null,
      status: finalStatus,
      userIdRaw: input.userIdRaw ? String(input.userIdRaw) : null,
      cardNoRaw: input.cardNoRaw ? String(input.cardNoRaw) : null,
      photoPath: input.photoPath || null,
      rawPayload: toJsonInput(input.rawPayload),
      idempotencyKey: input.idempotencyKey,
      occurredAt: input.occurredAt,
    },
    include: {
      student: true,
      device: true,
    },
  });

  await prisma.device.update({
    where: { id: input.deviceId },
    data: {
      lastEventAt: input.occurredAt,
      status: 'online',
      lastHeartbeat: new Date(),
    },
  });

  return { event, duplicate: false as const };
}
