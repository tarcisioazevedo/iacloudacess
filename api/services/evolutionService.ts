import axios from 'axios';
import { getEvolutionApiToken, getEvolutionApiUrl } from '../lib/runtimeConfig';

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

const evolutionApi = axios.create({
  baseURL: getEvolutionApiUrl(),
  timeout: 15000,
  headers: {
    apikey: getEvolutionApiToken(),
    'Content-Type': 'application/json',
  },
});

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

export async function createEvolutionInstance(instanceName: string) {
  const { data } = await evolutionApi.post('/instance/create', {
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

  return {
    raw: data,
    snapshot: normalizeInstancePayload(data?.instance ? data : data?.response ?? data),
  };
}

export async function connectEvolutionInstance(instanceName: string, phoneNumber?: string | null): Promise<EvolutionConnectPayload> {
  const params = phoneNumber ? { number: normalizePhoneNumber(phoneNumber) } : undefined;
  const { data } = await evolutionApi.get(`/instance/connect/${encodeURIComponent(instanceName)}`, { params });

  return {
    pairingCode: data?.pairingCode ?? null,
    qrCodePayload: data?.base64 ?? data?.qrcode ?? data?.code ?? null,
    count: typeof data?.count === 'number' ? data.count : null,
    raw: data,
  };
}

export async function fetchEvolutionInstance(instanceName: string): Promise<EvolutionInstanceSnapshot | null> {
  const { data } = await evolutionApi.get('/instance/fetchInstances', {
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
  const { data } = await evolutionApi.get(`/instance/connectionState/${encodeURIComponent(instanceName)}`);
  return data?.instance?.state ?? data?.response?.instance?.state ?? null;
}

export async function logoutEvolutionInstance(instanceName: string) {
  const { data } = await evolutionApi.delete(`/instance/logout/${encodeURIComponent(instanceName)}`);
  return data;
}

export async function sendEvolutionText(instanceName: string, phoneNumber: string, text: string) {
  const { data } = await evolutionApi.post(`/message/sendText/${encodeURIComponent(instanceName)}`, {
    number: normalizePhoneNumber(phoneNumber),
    text,
  });
  return data;
}

export async function sendEvolutionMedia(instanceName: string, phoneNumber: string, mediaUrl: string, caption?: string) {
  const { data } = await evolutionApi.post(`/message/sendMedia/${encodeURIComponent(instanceName)}`, {
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
