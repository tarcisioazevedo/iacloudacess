import axios, { type AxiosInstance } from 'axios';
import { getEvolutionApiToken, getEvolutionApiUrl } from '../lib/runtimeConfig';
import { logger } from '../lib/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// Evolution API v2 — Service Layer (Lazy init, robust QR extraction)
// ═══════════════════════════════════════════════════════════════════════════════

export interface EvolutionInstanceSnapshot {
  instanceName: string;
  instanceId: string | null;
  instanceStatus: string | null;
  connectionState: string | null;
  ownerJid: string | null;
  phoneNumber: string | null;
  profileName: string | null;
  profileStatus: string | null;
  serverUrl: string | null;
  raw: any;
}

export interface EvolutionConnectPayload {
  pairingCode: string | null;
  qrCodePayload: string | null;
  count: number | null;
  raw: any;
}

// ─── Lazy axios instance ─────────────────────────────────────────────────────
// Created on first use (not at module load time) so env vars are guaranteed to
// be populated by Docker runtime / secrets / entrypoint.sh.
let _axiosInstance: AxiosInstance | null = null;

function getApi(): AxiosInstance {
  if (!_axiosInstance) {
    const baseURL = getEvolutionApiUrl();
    const apikey = getEvolutionApiToken();
    logger.info('[EvolutionService] Initializing axios', { baseURL, hasToken: !!apikey });

    _axiosInstance = axios.create({
      baseURL,
      timeout: 20_000,
      headers: {
        apikey,
        'Content-Type': 'application/json',
      },
    });

    // Debug interceptor: log outgoing requests (without bodies)
    _axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => {
        if (axios.isAxiosError(error)) {
          logger.warn('[EvolutionService] API error', {
            method: error.config?.method?.toUpperCase(),
            url: error.config?.url,
            status: error.response?.status,
            data: typeof error.response?.data === 'string'
              ? error.response.data.slice(0, 300)
              : JSON.stringify(error.response?.data ?? {}).slice(0, 300),
          });
        }
        return Promise.reject(error);
      },
    );
  }
  return _axiosInstance;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sanitizeSegment(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function stripPhoneFromJid(value?: string | null): string | null {
  if (!value) return null;
  const digits = value.split('@')[0]?.replace(/\D/g, '') || '';
  return digits || null;
}

function normalizeFetchResponse(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.response)) return data.response;
  if (data?.response) return [data.response];
  if (data) return [data];
  return [];
}

function normalizeInstancePayload(payload: any): EvolutionInstanceSnapshot | null {
  const instance = payload?.instance ?? payload?.response?.instance ?? payload;
  const instanceName = instance?.instanceName ?? instance?.name ?? null;
  if (!instanceName) {
    return null;
  }

  return {
    instanceName,
    instanceId: instance?.instanceId ?? instance?.id ?? null,
    instanceStatus: instance?.status ?? payload?.status ?? null,
    connectionState: instance?.state ?? payload?.instance?.state ?? payload?.response?.instance?.state ?? null,
    ownerJid: instance?.owner ?? instance?.ownerJid ?? null,
    phoneNumber: stripPhoneFromJid(instance?.owner ?? instance?.ownerJid),
    profileName: instance?.profileName ?? null,
    profileStatus: instance?.profileStatus ?? null,
    serverUrl: instance?.serverUrl ?? null,
    raw: payload,
  };
}

export function normalizePhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('55') ? digits : `55${digits}`;
}

export function buildSchoolInstanceName(input: {
  integratorSlug?: string | null;
  schoolSlug?: string | null;
  schoolId: string;
}): string {
  const integrator = sanitizeSegment(input.integratorSlug || 'integrator');
  const school = sanitizeSegment(input.schoolSlug || input.schoolId.slice(0, 8));
  return `school-${integrator}-${school}-wa`.slice(0, 80);
}

// ─── QR Code extraction ─────────────────────────────────────────────────────
// Evolution API v2.x returns QR data in inconsistent structures depending on
// the version and whether `qrcode: true` was set during instance creation.
// This function forensically extracts the QR payload from ALL known formats.
function extractQrPayload(data: any): string | null {
  if (!data) return null;

  // 1. Direct base64 image at root: { base64: "data:image/png;base64,..." }
  if (typeof data.base64 === 'string' && data.base64.length > 10) {
    return data.base64;
  }

  // 2. Nested in qrcode object: { qrcode: { base64: "data:image/..." } }
  if (data.qrcode && typeof data.qrcode === 'object') {
    if (typeof data.qrcode.base64 === 'string' && data.qrcode.base64.length > 10) {
      return data.qrcode.base64;
    }
    // 2b. QR code as raw string in qrcode.code
    if (typeof data.qrcode.code === 'string' && data.qrcode.code.length > 10) {
      return data.qrcode.code;
    }
  }

  // 3. qrcode as direct string: { qrcode: "data:image/png;base64,..." }
  if (typeof data.qrcode === 'string' && data.qrcode.length > 10) {
    return data.qrcode;
  }

  // 4. Raw QR code string: { code: "2@abc..." }
  if (typeof data.code === 'string' && data.code.length > 10) {
    return data.code;
  }

  // 5. Nested in response object (v2 wrap)
  if (data.response) {
    return extractQrPayload(data.response);
  }

  return null;
}

function extractPairingCode(data: any): string | null {
  return data?.pairingCode ?? data?.response?.pairingCode ?? null;
}

function extractCount(data: any): number | null {
  const c = data?.count ?? data?.qrcode?.count ?? data?.response?.count;
  return typeof c === 'number' ? c : null;
}

// ─── API Functions ───────────────────────────────────────────────────────────

export async function createEvolutionInstance(instanceName: string) {
  logger.info('[EvolutionService] Creating instance', { instanceName });

  const { data } = await getApi().post('/instance/create', {
    instanceName,
    integration: 'WHATSAPP-BAILEYS',
    token: '',
    qrcode: true,
    rejectCall: true,
    groupsIgnore: true,
    alwaysOnline: false,
    readMessages: false,
    readStatus: false,
    syncFullHistory: false,
  });

  logger.info('[EvolutionService] Instance created', {
    instanceName,
    responseKeys: Object.keys(data || {}),
  });

  return {
    raw: data,
    snapshot: normalizeInstancePayload(data?.instance ? data : data?.response ?? data),
  };
}

export async function connectEvolutionInstance(
  instanceName: string,
  phoneNumber?: string | null,
): Promise<EvolutionConnectPayload> {
  logger.info('[EvolutionService] Connecting instance', { instanceName, hasPhone: !!phoneNumber });

  const params = phoneNumber ? { number: normalizePhoneNumber(phoneNumber) } : undefined;
  const { data } = await getApi().get(
    `/instance/connect/${encodeURIComponent(instanceName)}`,
    { params },
  );

  const qrCodePayload = extractQrPayload(data);
  const pairingCode = extractPairingCode(data);

  logger.info('[EvolutionService] Connect result', {
    instanceName,
    hasQr: !!qrCodePayload,
    qrType: qrCodePayload?.startsWith('data:image/') ? 'base64-image' : qrCodePayload ? 'raw-string' : 'none',
    qrLength: qrCodePayload?.length ?? 0,
    hasPairingCode: !!pairingCode,
    responseKeys: Object.keys(data || {}),
  });

  return {
    pairingCode,
    qrCodePayload,
    count: extractCount(data),
    raw: data,
  };
}

export async function fetchEvolutionInstance(instanceName: string): Promise<EvolutionInstanceSnapshot | null> {
  const { data } = await getApi().get('/instance/fetchInstances', {
    params: { instanceName },
  });

  const items = normalizeFetchResponse(data);
  for (const item of items) {
    const normalized = normalizeInstancePayload(item);
    if (normalized?.instanceName === instanceName) {
      return normalized;
    }
  }

  return null;
}

export async function getEvolutionConnectionState(instanceName: string): Promise<string | null> {
  const { data } = await getApi().get(`/instance/connectionState/${encodeURIComponent(instanceName)}`);
  return data?.instance?.state ?? data?.response?.instance?.state ?? data?.state ?? null;
}

export async function logoutEvolutionInstance(instanceName: string) {
  const { data } = await getApi().delete(`/instance/logout/${encodeURIComponent(instanceName)}`);
  return data;
}

export async function deleteEvolutionInstance(instanceName: string) {
  const { data } = await getApi().delete(`/instance/delete/${encodeURIComponent(instanceName)}`);
  return data;
}

/**
 * Destroys a stuck instance and recreates it from scratch, returning a fresh
 * connect payload that should contain the QR code / pairing code.
 */
export async function restartEvolutionInstance(instanceName: string): Promise<{
  snapshot: EvolutionInstanceSnapshot | null;
  connect: EvolutionConnectPayload;
}> {
  logger.info('[EvolutionService] Restarting instance (delete + recreate)', { instanceName });

  // 1. Try to delete the old instance (ignore errors if it doesn't exist)
  await deleteEvolutionInstance(instanceName).catch(() => {});

  // 2. Small delay so Evolution API finishes cleanup
  await new Promise(r => setTimeout(r, 2000));

  // 3. Create fresh
  const created = await createEvolutionInstance(instanceName);

  // 4. Wait for the WebSocket to initialise before requesting connect
  await new Promise(r => setTimeout(r, 3000));

  // 5. Connect — this should now return a QR code
  const connect = await connectEvolutionInstance(instanceName);

  // 6. Get updated snapshot
  const snapshot = await syncEvolutionInstance(instanceName).catch(() => created.snapshot ?? null);

  logger.info('[EvolutionService] Restart complete', {
    instanceName,
    hasQr: !!connect.qrCodePayload,
    connectionState: snapshot?.connectionState,
  });

  return { snapshot, connect };
}

export async function sendEvolutionText(instanceName: string, phoneNumber: string, text: string) {
  const { data } = await getApi().post(`/message/sendText/${encodeURIComponent(instanceName)}`, {
    number: normalizePhoneNumber(phoneNumber),
    text,
  });
  return data;
}

export async function sendEvolutionMedia(instanceName: string, phoneNumber: string, mediaUrl: string, caption?: string) {
  const { data } = await getApi().post(`/message/sendMedia/${encodeURIComponent(instanceName)}`, {
    number: normalizePhoneNumber(phoneNumber),
    mediatype: 'image',
    mimetype: 'image/jpeg',
    caption: caption || '',
    media: mediaUrl,
    fileName: 'acesso.jpg',
  });
  return data;
}

export async function syncEvolutionInstance(instanceName: string): Promise<EvolutionInstanceSnapshot | null> {
  const snapshot = await fetchEvolutionInstance(instanceName);
  if (!snapshot) {
    return null;
  }

  try {
    const state = await getEvolutionConnectionState(instanceName);
    return {
      ...snapshot,
      connectionState: state ?? snapshot.connectionState,
    };
  } catch {
    return snapshot;
  }
}
