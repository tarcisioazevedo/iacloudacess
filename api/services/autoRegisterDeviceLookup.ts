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
  // 1. Exact match by primary key
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

  // 2. Truncated UUID match (Intelbras firmware truncates UUID to 32 chars)
  //    e.g. device sends "2d105376-13b1-457e-bccc-9b7f4948" but DB has "2d105376-13b1-457e-bccc-9b7f4948f739"
  if (deviceId.length >= 28 && deviceId.includes('-')) {
    const byPrefix = await prisma.device.findMany({
      where: { id: { startsWith: deviceId } },
      select: DEVICE_SELECT,
      take: 2,
    });

    if (byPrefix.length === 1) {
      console.log(`[AutoRegister] Matched truncated DeviceID: ${deviceId} → ${byPrefix[0].id}`);
      return {
        device: byPrefix[0],
        reason: 'matched_id',
        matches: 1,
      };
    }
  }

  // 3. Match by localIdentifier (serial number, MAC, etc.)
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
