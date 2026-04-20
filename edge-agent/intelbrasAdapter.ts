import { IntelbrasClient } from '../api/services/intelbrasClient';
import type {
  CloudSyncJob,
  EdgeManagedDeviceConfig,
  EdgeHeartbeatDeviceStatus,
  NormalizedEdgeEventPayload,
} from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function toOptionalNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function detectImageContentType(filePath: string): string {
  return filePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
}

function normalizeMethod(data: Record<string, unknown>): string | null {
  const openDoorType = cleanString(data.OpenDoorType);
  if (openDoorType) {
    return openDoorType.toLowerCase().replace(/\s+/g, '_');
  }

  if (cleanString(data.QRCodeStr)) return 'qrcode';
  if (data.Similarity !== undefined) return 'face';
  if (cleanString(data.CardNo)) return 'card';

  return cleanString(data.Method);
}

function normalizeDirection(typeValue: unknown, directionValue?: unknown): string | null {
  const text = cleanString(typeValue || directionValue)?.toLowerCase();
  if (text) {
    if (text.includes('entry') || text.includes('entrada') || text === 'in') {
      return 'entry';
    }
    if (text.includes('exit') || text.includes('saida') || text === 'out') {
      return 'exit';
    }
  }

  const numeric = toOptionalNumber(directionValue ?? typeValue);
  if (numeric === 1) return 'exit';
  if (numeric === 0) return 'entry';
  return null;
}

function normalizeStatus(
  eventCode: string,
  errorCode: unknown,
  statusValue: unknown,
): string {
  if (eventCode !== 'AccessControl') {
    return 'info';
  }

  const numericError = toOptionalNumber(errorCode);
  if (numericError !== null && numericError !== 0) {
    return 'denied';
  }

  const numericStatus = toOptionalNumber(statusValue);
  if (numericStatus === 1) return 'granted';
  if (numericStatus === 0) return 'denied';

  return 'granted';
}

function parseOccurredAt(rawValue: unknown): Date {
  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
    return new Date(rawValue > 1_000_000_000_000 ? rawValue : rawValue * 1000);
  }

  if (typeof rawValue === 'string' && rawValue.trim()) {
    const trimmed = rawValue.trim();
    if (/^\d{10,13}$/.test(trimmed)) {
      const numeric = Number.parseInt(trimmed, 10);
      return new Date(trimmed.length >= 13 ? numeric : numeric * 1000);
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date();
}

interface ParsedIntelbrasEventContext {
  eventCode: string;
  method: string | null;
  door: number | null;
  direction: string | null;
  status: string;
  userIdRaw: string | null;
  cardNoRaw: string | null;
  occurredAt: Date;
  filePath: string | null;
  snapPath: string | null;
  imageEncode: string | null;
  rawPayload: Record<string, unknown>;
}

function extractIntelbrasEvent(rawPayload: Record<string, unknown>): ParsedIntelbrasEventContext {
  if (Array.isArray(rawPayload.Events)) {
    const eventRecord = rawPayload.Events.find(isRecord);
    if (eventRecord) {
      const data = isRecord(eventRecord.Data) ? eventRecord.Data : {};
      const eventCode = cleanString(eventRecord.Code || data.Code) || 'AccessControl';

      return {
        eventCode,
        method: normalizeMethod(data),
        door: toOptionalNumber(data.Door ?? data.ReaderID),
        direction: normalizeDirection(data.Type, data.Direction),
        status: normalizeStatus(eventCode, data.ErrorCode, data.Status),
        userIdRaw: cleanString(data.UserID),
        cardNoRaw: cleanString(data.CardNo),
        occurredAt: parseOccurredAt(data.RealUTC ?? data.UTC ?? data.CreateTime ?? rawPayload.Time),
        filePath: cleanString(rawPayload.FilePath || data.FilePath),
        snapPath: cleanString(data.SnapPath),
        imageEncode: cleanString(data.ImageEncode),
        rawPayload,
      };
    }
  }

  const eventInfo = isRecord(rawPayload.AccessControlNotificationInfo)
    ? rawPayload.AccessControlNotificationInfo
    : rawPayload;
  const eventCode = cleanString(eventInfo.EventCode || eventInfo.Code) || 'AccessControl';

  return {
    eventCode,
    method: normalizeMethod(eventInfo),
    door: toOptionalNumber(eventInfo.Door ?? eventInfo.ReaderID),
    direction: normalizeDirection(eventInfo.Type, eventInfo.Direction),
    status: normalizeStatus(eventCode, eventInfo.ErrorCode, eventInfo.Status),
    userIdRaw: cleanString(eventInfo.UserID || eventInfo.userId),
    cardNoRaw: cleanString(eventInfo.CardNo || eventInfo.cardNo),
    occurredAt: parseOccurredAt(eventInfo.RealUTC ?? eventInfo.UTC ?? eventInfo.occurredAt ?? eventInfo.EventTime),
    filePath: cleanString(rawPayload.FilePath || eventInfo.FilePath),
    snapPath: cleanString(eventInfo.SnapPath),
    imageEncode: cleanString(eventInfo.ImageEncode || rawPayload.ImageEncode),
    rawPayload,
  };
}

async function resolveIntelbrasEventPhoto(
  device: EdgeManagedDeviceConfig,
  parsed: ParsedIntelbrasEventContext,
): Promise<string | null> {
  if (parsed.imageEncode) {
    if (/^data:/i.test(parsed.imageEncode)) {
      return parsed.imageEncode;
    }

    return `data:image/jpeg;base64,${parsed.imageEncode.replace(/\s+/g, '')}`;
  }

  const filePath = parsed.filePath || parsed.snapPath;
  if (!filePath) {
    return null;
  }

  try {
    const client = buildIntelbrasClient(device);
    const buffer = await client.downloadFile(filePath);
    if (!buffer.length) {
      return null;
    }
    const contentType = detectImageContentType(filePath);
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

export function buildIntelbrasClient(device: EdgeManagedDeviceConfig) {
  return new IntelbrasClient(
    device.ipAddress,
    device.port || 80,
    device.username,
    device.password,
  );
}

export async function probeIntelbrasDevice(device: EdgeManagedDeviceConfig): Promise<EdgeHeartbeatDeviceStatus> {
  const client = buildIntelbrasClient(device);
  const heartbeat = await client.heartbeat();

  return {
    deviceId: device.cloudDeviceId,
    serialNumber: device.serialNumber,
    localIdentifier: device.localIdentifier,
    ipAddress: device.ipAddress,
    status: heartbeat.online ? 'online' : 'offline',
    lastHeartbeat: new Date().toISOString(),
  };
}

export async function executeIntelbrasSync(device: EdgeManagedDeviceConfig, job: CloudSyncJob) {
  const client = buildIntelbrasClient(device);
  const payload = job.payload as Record<string, any>;

  switch (job.syncType) {
    case 'user_insert':
      await client.insertUsers([{
        UserID: payload.UserID,
        UserName: payload.UserName,
        UserType: payload.UserType ?? 0,
        Doors: payload.Doors ?? [0],
        TimeSections: payload.TimeSections ?? [255],
        ValidFrom: payload.ValidFrom ?? '2026-01-01 00:00:00',
        ValidTo: payload.ValidTo ?? '2037-12-31 23:59:59',
      }]);
      return;
    case 'face_insert':
      await client.insertFaces([{
        UserID: payload.UserID,
        PhotoData: [payload.PhotoData],
      }]);
      return;
    case 'user_update':
      await client.removeUser(String(payload.UserID)).catch(() => undefined);
      await client.insertUsers([payload]);
      return;
    case 'face_remove':
      await client.removeFace(String(payload.UserID));
      return;
    default:
      throw new Error(`Unsupported Intelbras syncType: ${job.syncType}`);
  }
}

export async function openIntelbrasAutoRegisterSession(device: EdgeManagedDeviceConfig): Promise<string> {
  const client = buildIntelbrasClient(device);
  return client.openAutoRegisterSession();
}

export async function keepIntelbrasAutoRegisterAlive(
  device: EdgeManagedDeviceConfig,
  token: string,
): Promise<boolean> {
  const client = buildIntelbrasClient(device);
  return client.keepAutoRegisterAlive(token);
}

export async function normalizeIntelbrasEvent(
  device: EdgeManagedDeviceConfig,
  rawPayload: Record<string, unknown>,
): Promise<NormalizedEdgeEventPayload> {
  const parsed = extractIntelbrasEvent(rawPayload);
  const photoBase64 = await resolveIntelbrasEventPhoto(device, parsed);
  const identity = device.cloudDeviceId || device.localIdentifier || device.serialNumber || device.ipAddress;

  return {
    deviceId: device.cloudDeviceId,
    serialNumber: device.serialNumber,
    localIdentifier: device.localIdentifier,
    eventCode: parsed.eventCode,
    method: parsed.method,
    door: parsed.door,
    direction: parsed.direction,
    status: parsed.status,
    userIdRaw: parsed.userIdRaw,
    cardNoRaw: parsed.cardNoRaw,
    occurredAt: parsed.occurredAt.toISOString(),
    idempotencyKey: `${identity}_${Math.floor(parsed.occurredAt.getTime() / 1000)}_${String(parsed.userIdRaw || '')}_${String(parsed.door ?? 0)}`,
    photoBase64,
    photoPath: parsed.filePath || parsed.snapPath,
    rawPayload,
  };
}
