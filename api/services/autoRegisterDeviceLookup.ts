import { prisma } from '../prisma';

export interface AutoRegisterResolvedDevice {
  id: string;
  schoolUnitId: string;
  name: string;
  username: string;
  passwordEnc: string | null;
  localIdentifier: string | null;
  isVirtual: boolean;
  status: string;
}

export interface AutoRegisterDeviceLookupResult {
  device: AutoRegisterResolvedDevice | null;
  reason: 'matched_id' | 'matched_local_identifier' | 'ambiguous_local_identifier' | 'not_found';
  matches: number;
}

const DEVICE_SELECT = {
  id: true,
  schoolUnitId: true,
  name: true,
  username: true,
  passwordEnc: true,
  localIdentifier: true,
  isVirtual: true,
  status: true,
} as const;

export async function resolveDeviceForAutoRegister(deviceId: string): Promise<AutoRegisterDeviceLookupResult> {
  const byId = await prisma.device.findUnique({
    where: { id: deviceId },
    select: DEVICE_SELECT,
  });

  if (byId) {
    return {
      device: byId,
      reason: 'matched_id',
      matches: 1,
    };
  }

  const byLocalIdentifier = await prisma.device.findMany({
    where: { localIdentifier: deviceId },
    select: DEVICE_SELECT,
    take: 2,
  });

  if (byLocalIdentifier.length === 1) {
    return {
      device: byLocalIdentifier[0],
      reason: 'matched_local_identifier',
      matches: 1,
    };
  }

  if (byLocalIdentifier.length > 1) {
    return {
      device: null,
      reason: 'ambiguous_local_identifier',
      matches: byLocalIdentifier.length,
    };
  }

  return {
    device: null,
    reason: 'not_found',
    matches: 0,
  };
}
