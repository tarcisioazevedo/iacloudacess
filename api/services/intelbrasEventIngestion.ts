import type { IncomingHttpHeaders } from 'http';
import crypto from 'crypto';
import { prisma } from '../prisma';
import { logger } from '../lib/logger';
import { persistAccessEvent } from './accessEventService';
import { triggerNotification } from './n8nTrigger';
import { uploadEventResource } from './storageService';
import { getDeviceClient } from './deviceClientFactory';
import { resolveDeviceTransport } from './deviceTransport';
import { writeOpsLog } from './opsLogService';

interface MultipartFilePart {
  fieldName: string | null;
  filename: string | null;
  contentType: string;
  buffer: Buffer;
}

interface ParsedIntelbrasWebhook {
  contentType: string;
  envelope: Record<string, unknown> | null;
  fields: Record<string, string[]>;
  files: MultipartFilePart[];
  rawText: string | null;
}

interface NormalizedIntelbrasEvent {
  eventCode: string;
  action: string | null;
  method: string | null;
  door: number | null;
  direction: string | null;
  status: string;
  userIdRaw: string | null;
  cardNoRaw: string | null;
  occurredAt: Date;
  idempotencyKey: string;
  eventIndex: number | null;
  physicalAddress: string | null;
  filePath: string | null;
  snapPath: string | null;
  imageEncode: string | null;
  imageInfo: Record<string, unknown>[];
  rawPayload: Record<string, unknown>;
  shouldBroadcast: boolean;
  shouldNotify: boolean;
}

interface DeviceContext {
  id: string;
  name: string;
  schoolUnitId: string;
  username: string;
  passwordEnc: string | null;
  ipAddress: string;
  port: number;
  location: string | null;
  localIdentifier: string | null;
  serialNumber: string | null;
  connectionPolicy: string;
  connectivityMode: string;
  edgeConnectorId: string | null;
  schoolUnit: {
    school: {
      id: string;
      integratorId: string;
      name: string;
    };
  };
  edgeConnector?: {
    id?: string | null;
    name?: string | null;
    status?: string | null;
  } | null;
}

function buildIntelbrasDeviceOpsContext(device: DeviceContext) {
  const transport = resolveDeviceTransport(device);

  return {
    source: 'intelbras_webhook',
    integratorId: device.schoolUnit.school.integratorId,
    schoolId: device.schoolUnit.school.id,
    schoolUnitId: device.schoolUnitId,
    schoolName: device.schoolUnit.school.name,
    deviceId: device.id,
    deviceName: device.name,
    deviceRef: device.localIdentifier || device.serialNumber || device.id,
    transport: transport.effectiveTransport,
  } as const;
}

async function writeIntelbrasOpsLog(
  device: DeviceContext,
  input: {
    level: 'debug' | 'info' | 'warn' | 'error';
    category: string;
    outcome: string;
    message: string;
    requestId?: string | null;
    normalized?: NormalizedIntelbrasEvent | null;
    eventId?: string | null;
    metadata?: Record<string, unknown> | null;
  },
) {
  const context = buildIntelbrasDeviceOpsContext(device);

  await writeOpsLog({
    ...context,
    level: input.level,
    category: input.category,
    outcome: input.outcome,
    message: input.message,
    requestId: input.requestId || null,
    eventId: input.eventId || null,
    eventCode: input.normalized?.eventCode || null,
    correlationId: input.normalized?.idempotencyKey || null,
    metadata: {
      ...(input.normalized
        ? {
            eventIndex: input.normalized.eventIndex,
            method: input.normalized.method,
            status: input.normalized.status,
            direction: input.normalized.direction,
            door: input.normalized.door,
            userIdRaw: input.normalized.userIdRaw,
            cardNoRaw: input.normalized.cardNoRaw,
          }
        : {}),
      ...(input.metadata || {}),
    },
  });
}

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

function pickFirst<T>(...values: T[]): T | undefined {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
}

function parseOccurredAt(...candidates: unknown[]): Date {
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null || candidate === '') {
      continue;
    }

    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      const millis = candidate > 1_000_000_000_000 ? candidate : candidate * 1000;
      const parsed = new Date(millis);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (!trimmed) continue;

      if (/^\d{10,13}$/.test(trimmed)) {
        const numeric = Number.parseInt(trimmed, 10);
        const millis = trimmed.length >= 13 ? numeric : numeric * 1000;
        const parsed = new Date(millis);
        if (!Number.isNaN(parsed.getTime())) {
          return parsed;
        }
      }

      const ptBrMatch = trimmed.match(
        /^(\d{2})-(\d{2})-(\d{4})[ T](\d{2}):(\d{2}):(\d{2})$/,
      );
      if (ptBrMatch) {
        const [, day, month, year, hour, minute, second] = ptBrMatch;
        const parsed = new Date(
          Number.parseInt(year, 10),
          Number.parseInt(month, 10) - 1,
          Number.parseInt(day, 10),
          Number.parseInt(hour, 10),
          Number.parseInt(minute, 10),
          Number.parseInt(second, 10),
        );
        if (!Number.isNaN(parsed.getTime())) {
          return parsed;
        }
      }

      const parsed = new Date(trimmed);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }

  return new Date();
}

function normalizeDirection(typeValue: unknown, directionValue?: unknown): string | null {
  const text = cleanString(typeValue || directionValue)?.toLowerCase();
  if (text) {
    if (text.includes('entry') || text.includes('entrada') || text === 'in') {
      return 'entry';
    }
    if (text.includes('exit') || text.includes('saida') || text.includes('saída') || text === 'out') {
      return 'exit';
    }
  }

  const numeric = toOptionalNumber(directionValue ?? typeValue);
  if (numeric === 1) return 'exit';
  if (numeric === 0) return 'entry';
  return null;
}

function normalizeMethod(data: Record<string, unknown>): string | null {
  const explicit = cleanString(data.OpenDoorType);
  if (explicit) {
    return explicit.toLowerCase().replace(/\s+/g, '_');
  }

  if (cleanString(data.QRCodeStr)) return 'qrcode';
  if (data.Similarity !== undefined) return 'face';
  if (cleanString(data.CardNo)) return 'card';

  const rawMethod = cleanString(data.Method);
  if (!rawMethod) return null;

  const numeric = toOptionalNumber(rawMethod);
  if (numeric === 14 && cleanString(data.QRCodeStr)) return 'qrcode';
  if (numeric === 15) return 'face';
  if (numeric === 1 && cleanString(data.CardNo)) return 'card';

  return `method_${rawMethod}`;
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

  const statusText = cleanString(statusValue)?.toLowerCase();
  if (statusText) {
    if (
      statusText.includes('grant')
      || statusText.includes('allow')
      || statusText.includes('success')
      || statusText.includes('open')
    ) {
      return 'granted';
    }
    if (
      statusText.includes('deny')
      || statusText.includes('reject')
      || statusText.includes('fail')
      || statusText.includes('error')
    ) {
      return 'denied';
    }
  }

  return 'granted';
}

function sanitizeForStorage(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth_limited]';
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    if (value.length > 4096) {
      return `[truncated:${value.length}] ${value.slice(0, 1024)}`;
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeForStorage(item, depth + 1));
  }

  if (!isRecord(value)) {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'string' && /imageencode/i.test(key)) {
      output[key] = `[redacted_base64:${raw.length}]`;
      continue;
    }
    output[key] = sanitizeForStorage(raw, depth + 1);
  }
  return output;
}

function buildIdempotencyKey(
  deviceId: string,
  normalized: Omit<NormalizedIntelbrasEvent, 'idempotencyKey'>,
): string {
  const digest = crypto.createHash('sha1').update([
    deviceId,
    normalized.eventCode,
    normalized.action || '',
    normalized.occurredAt.toISOString(),
    normalized.eventIndex ?? '',
    normalized.userIdRaw || '',
    normalized.cardNoRaw || '',
    normalized.door ?? '',
    normalized.direction || '',
    normalized.status,
    normalized.physicalAddress || '',
    normalized.filePath || '',
    normalized.snapPath || '',
  ].join('|')).digest('hex');

  return `${deviceId}_${digest}`;
}

function readBoundary(contentType: string): string | null {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  return (match?.[1] || match?.[2] || '').trim() || null;
}

function parseMultipartBuffer(buffer: Buffer, contentType: string) {
  const boundary = readBoundary(contentType);
  if (!boundary) {
    throw new Error('Multipart payload without boundary');
  }

  const source = buffer.toString('latin1');
  const parts = source.split(`--${boundary}`);
  const fields: Record<string, string[]> = {};
  const files: MultipartFilePart[] = [];

  for (const rawChunk of parts) {
    if (!rawChunk || rawChunk === '--' || rawChunk === '--\r\n') {
      continue;
    }

    let chunk = rawChunk;
    if (chunk.startsWith('\r\n')) chunk = chunk.slice(2);
    if (chunk.endsWith('--\r\n')) chunk = chunk.slice(0, -4);
    if (chunk.endsWith('--')) chunk = chunk.slice(0, -2);
    if (chunk.endsWith('\r\n')) chunk = chunk.slice(0, -2);

    const headerEnd = chunk.indexOf('\r\n\r\n');
    if (headerEnd === -1) {
      continue;
    }

    const headerRaw = chunk.slice(0, headerEnd);
    const bodyRaw = chunk.slice(headerEnd + 4);
    const headers: Record<string, string> = {};
    for (const line of headerRaw.split('\r\n')) {
      const separator = line.indexOf(':');
      if (separator <= 0) continue;
      const name = line.slice(0, separator).trim().toLowerCase();
      const value = line.slice(separator + 1).trim();
      headers[name] = value;
    }

    const disposition = headers['content-disposition'] || '';
    const fieldName = disposition.match(/name\s*=\s*"([^"]+)"/i)?.[1]?.trim() || null;
    const filename = disposition.match(/filename\s*=\s*"([^"]*)"/i)?.[1]?.trim() || null;
    const partContentType = headers['content-type'] || 'text/plain';
    const partBuffer = Buffer.from(bodyRaw, 'latin1');

    if (filename || partContentType.startsWith('image/')) {
      files.push({
        fieldName,
        filename,
        contentType: partContentType,
        buffer: partBuffer,
      });
      continue;
    }

    const text = partBuffer.toString('utf8').trim();
    const key = fieldName || `part_${Object.keys(fields).length}`;
    fields[key] = [...(fields[key] || []), text];
  }

  return { fields, files };
}

function tryParseJsonCandidate(input: string | null | undefined): Record<string, unknown> | null {
  const candidate = input?.trim();
  if (!candidate) return null;

  try {
    const parsed = JSON.parse(candidate);
    return isRecord(parsed) ? parsed : null;
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      const parsed = JSON.parse(candidate.slice(start, end + 1));
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}

function parseLegacyPlainEvent(rawText: string): Record<string, unknown> | null {
  const code = rawText.match(/Code\s*=\s*([^;]+)\s*;/i)?.[1]?.trim();
  const action = rawText.match(/action\s*=\s*([^;]+)\s*;/i)?.[1]?.trim();
  const index = rawText.match(/index\s*=\s*([^;]+)\s*;/i)?.[1]?.trim();
  const dataRaw = rawText.match(/data\s*=\s*(\{[\s\S]+\})/i)?.[1];
  const data = tryParseJsonCandidate(dataRaw || null);

  if (!code || !data) {
    return null;
  }

  return {
    Events: [{
      Code: code,
      Action: action || 'Pulse',
      Index: index ? Number.parseInt(index, 10) : 0,
      Data: data,
    }],
  };
}

function extractEnvelope(fields: Record<string, string[]>, rawText: string | null): Record<string, unknown> | null {
  for (const preferredKey of ['info', 'event', 'payload', 'data']) {
    const values = fields[preferredKey];
    if (!values?.length) continue;
    const parsed = tryParseJsonCandidate(values[0]);
    if (parsed) return parsed;
  }

  for (const values of Object.values(fields)) {
    for (const value of values) {
      const parsed = tryParseJsonCandidate(value);
      if (parsed) return parsed;
    }
  }

  const parsedText = tryParseJsonCandidate(rawText);
  if (parsedText) return parsedText;

  return rawText ? parseLegacyPlainEvent(rawText) : null;
}

export function parseIntelbrasWebhook(
  body: unknown,
  contentTypeHeader: string | string[] | undefined,
): ParsedIntelbrasWebhook {
  const contentType = Array.isArray(contentTypeHeader)
    ? contentTypeHeader[0] || ''
    : contentTypeHeader || '';

  if (Buffer.isBuffer(body)) {
    if (/^multipart\//i.test(contentType)) {
      const { fields, files } = parseMultipartBuffer(body, contentType);
      const rawText = Object.values(fields).flat().join('\n').trim() || null;
      return {
        contentType,
        envelope: extractEnvelope(fields, rawText),
        fields,
        files,
        rawText,
      };
    }

    const rawText = body.toString('utf8').trim() || null;
    return {
      contentType,
      envelope: extractEnvelope({}, rawText),
      fields: {},
      files: [],
      rawText,
    };
  }

  if (typeof body === 'string') {
    const rawText = body.trim() || null;
    return {
      contentType,
      envelope: extractEnvelope({}, rawText),
      fields: {},
      files: [],
      rawText,
    };
  }

  if (isRecord(body)) {
    return {
      contentType,
      envelope: body,
      fields: {},
      files: [],
      rawText: null,
    };
  }

  return {
    contentType,
    envelope: null,
    fields: {},
    files: [],
    rawText: null,
  };
}

function normalizeLegacyEvent(
  deviceId: string,
  payload: Record<string, unknown>,
): NormalizedIntelbrasEvent[] {
  const eventInfo = isRecord(payload.AccessControlNotificationInfo)
    ? payload.AccessControlNotificationInfo
    : payload;

  const eventCode = cleanString(eventInfo.EventCode || eventInfo.Code) || 'AccessControl';
  const occurredAt = parseOccurredAt(
    pickFirst(eventInfo.RealUTC, eventInfo.UTC, eventInfo.CreateTime, payload.Time),
  );

  const normalizedWithoutKey = {
    eventCode,
    action: cleanString(eventInfo.Action || eventInfo.action),
    method: normalizeMethod(eventInfo),
    door: toOptionalNumber(pickFirst(eventInfo.Door, eventInfo.ReaderID)),
    direction: normalizeDirection(eventInfo.Type, eventInfo.Direction),
    status: normalizeStatus(eventCode, eventInfo.ErrorCode, eventInfo.Status),
    userIdRaw: cleanString(eventInfo.UserID || eventInfo.userId),
    cardNoRaw: cleanString(eventInfo.CardNo || eventInfo.cardNo),
    occurredAt,
    eventIndex: toOptionalNumber(eventInfo.Index),
    physicalAddress: cleanString(payload.PhysicalAddress || eventInfo.PhysicalAddress),
    filePath: cleanString(payload.FilePath || eventInfo.FilePath),
    snapPath: cleanString(eventInfo.SnapPath),
    imageEncode: cleanString(eventInfo.ImageEncode || payload.ImageEncode),
    imageInfo: Array.isArray(eventInfo.ImageInfo)
      ? eventInfo.ImageInfo.filter(isRecord)
      : [],
    rawPayload: sanitizeForStorage(payload) as Record<string, unknown>,
    shouldBroadcast: eventCode === 'AccessControl',
    shouldNotify: eventCode === 'AccessControl',
  };

  return [{
    ...normalizedWithoutKey,
    idempotencyKey: buildIdempotencyKey(deviceId, normalizedWithoutKey),
  }];
}

function normalizeOfficialEnvelope(
  deviceId: string,
  envelope: Record<string, unknown>,
): NormalizedIntelbrasEvent[] {
  const rootEvents = Array.isArray(envelope.Events) ? envelope.Events : [];

  return rootEvents
    .filter(isRecord)
    .map((eventRecord) => {
      const data = isRecord(eventRecord.Data) ? eventRecord.Data : {};
      const eventCode = cleanString(eventRecord.Code || data.Code) || 'AccessControl';
      const occurredAt = parseOccurredAt(
        pickFirst(data.RealUTC, data.UTC, data.CreateTime, envelope.Time),
      );

      const normalizedWithoutKey = {
        eventCode,
        action: cleanString(eventRecord.Action),
        method: normalizeMethod(data),
        door: toOptionalNumber(pickFirst(data.Door, data.ReaderID)),
        direction: normalizeDirection(data.Type, data.Direction),
        status: normalizeStatus(eventCode, data.ErrorCode, data.Status),
        userIdRaw: cleanString(data.UserID),
        cardNoRaw: cleanString(data.CardNo),
        occurredAt,
        eventIndex: toOptionalNumber(eventRecord.Index),
        physicalAddress: cleanString(eventRecord.PhysicalAddress || envelope.PhysicalAddress),
        filePath: cleanString(envelope.FilePath || data.FilePath),
        snapPath: cleanString(data.SnapPath),
        imageEncode: cleanString(data.ImageEncode),
        imageInfo: Array.isArray(data.ImageInfo)
          ? data.ImageInfo.filter(isRecord)
          : [],
        rawPayload: sanitizeForStorage({
          channel: envelope.Channel,
          time: envelope.Time,
          filePath: envelope.FilePath,
          event: eventRecord,
        }) as Record<string, unknown>,
        shouldBroadcast: eventCode === 'AccessControl',
        shouldNotify: eventCode === 'AccessControl',
      };

      return {
        ...normalizedWithoutKey,
        idempotencyKey: buildIdempotencyKey(deviceId, normalizedWithoutKey),
      };
    });
}

function normalizeIntelbrasEvents(
  deviceId: string,
  parsed: ParsedIntelbrasWebhook,
): NormalizedIntelbrasEvent[] {
  if (!parsed.envelope) {
    return [];
  }

  if (Array.isArray(parsed.envelope.Events)) {
    return normalizeOfficialEnvelope(deviceId, parsed.envelope);
  }

  return normalizeLegacyEvent(deviceId, parsed.envelope);
}

function decodeBase64Image(rawValue: string | null): { buffer: Buffer; contentType: string } | null {
  if (!rawValue) return null;
  const match = rawValue.match(/^data:([^;]+);base64,(.+)$/i);
  const contentType = match?.[1] || 'image/jpeg';
  const base64 = (match?.[2] || rawValue).replace(/\s+/g, '');

  try {
    const buffer = Buffer.from(base64, 'base64');
    if (!buffer.length) return null;
    return { buffer, contentType };
  } catch {
    return null;
  }
}

function pickMultipartImage(
  files: MultipartFilePart[],
  imageInfo: Record<string, unknown>[],
): MultipartFilePart | null {
  const imageFiles = files.filter((file) => file.contentType.startsWith('image/'));
  if (!imageFiles.length) return null;
  if (!imageInfo.length) return imageFiles[0];

  const preferredTypes = [1, 2, 0];
  for (const preferredType of preferredTypes) {
    const index = imageInfo.findIndex((info) => toOptionalNumber(info.Type) === preferredType);
    if (index !== -1 && imageFiles[index]) {
      return imageFiles[index];
    }
  }

  return imageFiles[0];
}

function buildPhotoFilename(
  device: DeviceContext,
  event: NormalizedIntelbrasEvent,
  contentType: string,
): string {
  const extension = contentType.includes('png') ? 'png' : 'jpg';
  const stamp = event.occurredAt.toISOString().replace(/[:.]/g, '-');
  const hash = crypto.createHash('md5').update(event.idempotencyKey).digest('hex').slice(0, 10);
  return `${device.id}_${stamp}_${event.eventIndex ?? 0}_${hash}.${extension}`;
}

function detectImageContentType(filePath: string): string {
  const normalized = filePath.toLowerCase();
  if (normalized.endsWith('.png')) {
    return 'image/png';
  }
  return 'image/jpeg';
}

async function downloadEventImageFromDevice(
  device: DeviceContext,
  filePath: string,
  requestId?: string | null,
  event?: NormalizedIntelbrasEvent | null,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const transport = resolveDeviceTransport(device);
  if (!['direct_http', 'cloud_autoreg'].includes(transport.effectiveTransport)) {
    return null;
  }

  try {
    const client = getDeviceClient(device);
    const buffer = await client.downloadFile(filePath);
    return { buffer, contentType: detectImageContentType(filePath) };
  } catch (err: any) {
    await writeIntelbrasOpsLog(device, {
      level: 'warn',
      category: 'media',
      outcome: 'download_failed',
      message: 'Falha ao baixar snapshot oficial do dispositivo Intelbras',
      requestId,
      normalized: event || null,
      metadata: {
        filePath,
        transport: transport.effectiveTransport,
        error: err.message,
      },
    });
    logger.warn('Intelbras image download failed', {
      deviceId: device.id,
      filePath,
      transport: transport.effectiveTransport,
      error: err.message,
    });
    return null;
  }
}

async function resolveEventPhotoPath(
  device: DeviceContext,
  event: NormalizedIntelbrasEvent,
  files: MultipartFilePart[],
  photoCache: Map<string, string | null>,
  requestId?: string | null,
): Promise<string | null> {
  const cacheKey = [
    event.eventIndex ?? '',
    event.filePath || '',
    event.snapPath || '',
    event.imageEncode ? crypto.createHash('md5').update(event.imageEncode).digest('hex') : '',
    files.length,
  ].join('|');

  if (photoCache.has(cacheKey)) {
    return photoCache.get(cacheKey) || null;
  }

  let candidate: { buffer: Buffer; contentType: string } | null = decodeBase64Image(event.imageEncode);

  if (!candidate) {
    const multipartImage = pickMultipartImage(files, event.imageInfo);
    if (multipartImage) {
      candidate = {
        buffer: multipartImage.buffer,
        contentType: multipartImage.contentType || 'image/jpeg',
      };
    }
  }

  if (!candidate) {
    const filePath = event.filePath || event.snapPath;
    if (filePath) {
      candidate = await downloadEventImageFromDevice(device, filePath, requestId, event);
    }
  }

  if (!candidate) {
    photoCache.set(cacheKey, null);
    return null;
  }

  try {
    const filename = buildPhotoFilename(device, event, candidate.contentType);
    const storagePath = await uploadEventResource(
      device.schoolUnit.school.integratorId,
      device.schoolUnit.school.id,
      event.occurredAt,
      filename,
      candidate.buffer,
      candidate.contentType,
    );
    photoCache.set(cacheKey, storagePath);
    return storagePath;
  } catch (err: any) {
    await writeIntelbrasOpsLog(device, {
      level: 'warn',
      category: 'media',
      outcome: 'upload_failed',
      message: 'Falha ao persistir snapshot do evento em storage',
      requestId,
      normalized: event,
      metadata: {
        error: err.message,
      },
    });
    logger.warn('Event photo upload failed', {
      deviceId: device.id,
      eventCode: event.eventCode,
      error: err.message,
    });
    photoCache.set(cacheKey, null);
    return null;
  }
}

async function resolveDeviceContext(tenantKey: string): Promise<DeviceContext | null> {
  const normalizedKey = tenantKey.trim();
  if (!normalizedKey) return null;

  return prisma.device.findFirst({
    where: {
      OR: [
        { id: normalizedKey },
        { localIdentifier: normalizedKey },
        { serialNumber: normalizedKey },
      ],
    },
    include: {
      schoolUnit: {
        include: {
          school: {
            select: {
              id: true,
              integratorId: true,
              name: true,
            },
          },
        },
      },
      edgeConnector: {
        select: { id: true, name: true, status: true },
      },
    },
  });
}

function buildSocketPayload(event: any, device: DeviceContext) {
  return {
    id: event.id,
    studentName: event.student?.name || 'Não identificado',
    method: event.method,
    direction: event.direction,
    status: event.status,
    deviceLocation: device.location || device.name,
    occurredAt: event.occurredAt,
  };
}

export async function ingestIntelbrasWebhook(params: {
  tenantKey: string;
  parsed: ParsedIntelbrasWebhook;
  requestId?: string | null;
  io?: any;
}): Promise<void> {
  const device = await resolveDeviceContext(params.tenantKey);
  if (!device) {
    await writeOpsLog({
      level: 'warn',
      source: 'intelbras_webhook',
      category: 'routing',
      outcome: 'device_not_found',
      message: 'Webhook Intelbras recebido para tenant sem dispositivo vinculado',
      requestId: params.requestId || null,
      deviceRef: params.tenantKey,
      metadata: {
        tenantKey: params.tenantKey,
      },
    });
    logger.warn('Intelbras webhook received for unknown device', {
      tenantKey: params.tenantKey,
      requestId: params.requestId || undefined,
    });
    return;
  }

  const { checkDeviceOperationStatus } = await import('./deviceBusinessRules');
  const operationStatus = await checkDeviceOperationStatus(device.id);

  const normalizedEvents = normalizeIntelbrasEvents(device.id, params.parsed);
  if (!normalizedEvents.length) {
    await writeIntelbrasOpsLog(device, {
      level: 'warn',
      category: 'parser',
      outcome: 'normalize_failed',
      message: 'Payload Intelbras recebido, mas sem eventos normalizaveis',
      requestId: params.requestId,
      metadata: {
        contentType: params.parsed.contentType,
        hasEnvelope: Boolean(params.parsed.envelope),
        multipartFiles: params.parsed.files.length,
      },
    });
    logger.warn('Intelbras webhook could not be normalized', {
      deviceId: device.id,
      requestId: params.requestId || undefined,
      contentType: params.parsed.contentType,
      hasEnvelope: Boolean(params.parsed.envelope),
    });
    return;
  }

  const photoCache = new Map<string, string | null>();

  for (const normalized of normalizedEvents) {
    if (!operationStatus.ok) {
      normalized.shouldBroadcast = false;
      normalized.shouldNotify = false;
    }

    if (normalized.eventCode !== 'AccessControl') {
      await writeIntelbrasOpsLog(device, {
        level: 'info',
        category: 'ingestion',
        outcome: 'ack_non_access',
        message: 'Evento Intelbras reconhecido e ignorado por nao pertencer ao fluxo AccessControl',
        requestId: params.requestId,
        normalized,
      });
      logger.info('Intelbras non-access event acknowledged', {
        deviceId: device.id,
        requestId: params.requestId || undefined,
        eventCode: normalized.eventCode,
        eventIndex: normalized.eventIndex ?? undefined,
      });
      continue;
    }

    try {
      const photoPath = await resolveEventPhotoPath(
        device,
        normalized,
        params.parsed.files,
        photoCache,
        params.requestId,
      );

      const result = await persistAccessEvent({
        schoolId: device.schoolUnit.school.id,
        deviceId: device.id,
        eventCode: normalized.eventCode,
        method: normalized.method,
        door: normalized.door,
        direction: normalized.direction,
        status: normalized.status,
        userIdRaw: normalized.userIdRaw,
        cardNoRaw: normalized.cardNoRaw,
        photoPath,
        rawPayload: normalized.rawPayload,
        occurredAt: normalized.occurredAt,
        idempotencyKey: normalized.idempotencyKey,
      });

      if (result.duplicate) {
        if (photoPath && !result.event.photoPath) {
          await prisma.accessEvent.update({
            where: { id: result.event.id },
            data: { photoPath },
          }).catch(() => undefined);
        }
        await writeIntelbrasOpsLog(device, {
          level: 'info',
          category: 'dedupe',
          outcome: 'duplicate_ignored',
          message: 'Evento Intelbras duplicado identificado e consolidado',
          requestId: params.requestId,
          normalized,
          eventId: result.event.id,
          metadata: {
            hadNewPhoto: Boolean(photoPath && !result.event.photoPath),
          },
        });
        continue;
      }

      if (params.io && normalized.shouldBroadcast) {
        params.io.to(`school:${device.schoolUnit.school.id}`).emit(
          'access:new',
          buildSocketPayload(result.event, device),
        );
      }

      if (normalized.shouldNotify && result.event.studentId) {
        void triggerNotification(result.event).catch((err) => {
          void writeIntelbrasOpsLog(device, {
            level: 'warn',
            category: 'notification',
            outcome: 'notification_failed',
            message: 'Evento persistido, mas o disparo de notificacao falhou',
            requestId: params.requestId,
            normalized,
            eventId: result.event.id,
            metadata: {
              error: err.message,
            },
          });
          logger.warn('Intelbras notification dispatch failed', {
            deviceId: device.id,
            eventId: result.event.id,
            error: err.message,
          });
        });
      }

      await writeIntelbrasOpsLog(device, {
        level: 'info',
        category: 'ingestion',
        outcome: 'event_persisted',
        message: 'Evento AccessControl persistido com sucesso',
        requestId: params.requestId,
        normalized,
        eventId: result.event.id,
        metadata: {
          hasPhoto: Boolean(photoPath),
          studentId: result.event.studentId || null,
        },
      });
      logger.info('Intelbras access event ingested', {
        deviceId: device.id,
        requestId: params.requestId || undefined,
        eventId: result.event.id,
        eventCode: normalized.eventCode,
        userIdRaw: normalized.userIdRaw || undefined,
        status: result.event.status,
        hasPhoto: Boolean(photoPath),
      });
    } catch (err: any) {
      await writeIntelbrasOpsLog(device, {
        level: 'error',
        category: 'ingestion',
        outcome: 'event_failed',
        message: 'Falha ao processar evento AccessControl Intelbras',
        requestId: params.requestId,
        normalized,
        metadata: {
          error: err.message,
        },
      });
      logger.error('Intelbras access event ingestion failed', {
        deviceId: device.id,
        requestId: params.requestId || undefined,
        eventCode: normalized.eventCode,
        userIdRaw: normalized.userIdRaw || undefined,
        error: err.message,
      });
    }
  }
}

export function shouldUseIntelbrasRawBody(headers: IncomingHttpHeaders) {
  const contentType = headers['content-type'] || '';
  return /^multipart\//i.test(contentType) || /^text\/plain/i.test(contentType);
}
