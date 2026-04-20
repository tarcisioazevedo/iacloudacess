import { readDbPassword, readJwtRefreshSecret, readJwtSecret } from './secrets';

const DEV_DATABASE_URL = 'postgresql://schooladmin:schoolpass2026@localhost:5432/school_access';

function encodeCredential(value: string): string {
  return encodeURIComponent(value);
}

export function getJwtSecret(): string {
  return readJwtSecret();
}

export function getJwtRefreshSecret(): string {
  return readJwtRefreshSecret();
}

export function getDatabaseUrl(): string {
  const directUrl = process.env.DATABASE_URL?.trim();
  if (directUrl) {
    return directUrl;
  }

  if (process.env.NODE_ENV !== 'production') {
    return DEV_DATABASE_URL;
  }

  const dbUser = process.env.DB_USER?.trim() || 'schooladmin';
  const dbHost = process.env.DB_HOST?.trim() || 'postgres';
  const dbPort = process.env.DB_PORT?.trim() || '5432';
  const dbName = process.env.DB_NAME?.trim() || 'school_access';
  const dbPassword = readDbPassword();

  return `postgresql://${encodeCredential(dbUser)}:${encodeCredential(dbPassword)}@${dbHost}:${dbPort}/${dbName}?schema=public`;
}

function normalizeUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

export function getEvolutionApiUrl(): string {
  return normalizeUrl(process.env.EVOLUTION_API_URL?.trim() || 'http://evolution-api:8080');
}

export function getEvolutionApiToken(): string {
  return process.env.EVOLUTION_API_TOKEN?.trim() || 'global-secret-token';
}

export function getAutoRegisterPublicBaseUrl(): string | null {
  const explicit = process.env.AUTOREG_PUBLIC_BASE_URL?.trim();
  if (explicit) {
    return normalizeUrl(explicit);
  }

  const fallback = process.env.PUBLIC_API_BASE_URL?.trim()
    || process.env.PUBLIC_APP_BASE_URL?.trim();

  if (fallback) {
    return normalizeUrl(fallback);
  }

  return null;
}

export function getAutoRegisterConnectUrl(): string | null {
  const baseUrl = getAutoRegisterPublicBaseUrl();
  if (!baseUrl) {
    return null;
  }

  return `${baseUrl}/cgi-bin/api/autoRegist/connect`;
}

export interface IntelbrasEventPushConfig {
  publicBaseUrl: string;
  eventEndpointUrl: string;
  address: string;
  port: number;
  uploadPath: string;
  httpsEnabled: boolean;
  step1Command: string;
  stepContentTypeCommand: string;
  step2Command: string;
}

function buildDeviceConfigCommand(path: string, params: Array<[string, string]>) {
  const query = params
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  return `http://<ip-do-dispositivo>${path}?${query}`;
}

export function getIntelbrasEventPushConfig(tenantKey: string): IntelbrasEventPushConfig | null {
  const baseUrl = getAutoRegisterPublicBaseUrl();
  if (!baseUrl) {
    return null;
  }

  const webhookUrl = new URL(`${baseUrl}/api/intelbras/events/${encodeURIComponent(tenantKey)}`);
  const httpsEnabled = webhookUrl.protocol === 'https:';
  const port = webhookUrl.port
    ? Number.parseInt(webhookUrl.port, 10)
    : httpsEnabled
      ? 443
      : 80;
  const uploadPath = `${webhookUrl.pathname}${webhookUrl.search}`;
  const address = webhookUrl.hostname;

  const step1Command = buildDeviceConfigCommand('/cgi-bin/configManager.cgi', [
    ['action', 'setConfig'],
    ['Intelbras_ModeCfgII.UploadServerList[0].Enable', 'true'],
    ['Intelbras_ModeCfgII.UploadServerList[0].Address', address],
    ['Intelbras_ModeCfgII.UploadServerList[0].Port', String(port)],
    ['Intelbras_ModeCfgII.UploadServerList[0].Uploadpath', uploadPath],
    ['Intelbras_ModeCfgII.UploadServerList[0].OfflineRetransmission', 'true'],
    ['Intelbras_ModeCfgII.UploadServerList[0].ReportPicture', 'true'],
    ['Intelbras_ModeCfgII.UploadServerList[0].EventType[0]', 'UserManagerInfo'],
    ['Intelbras_ModeCfgII.UploadServerList[0].EventType[1]', 'AccessControl'],
    ['Intelbras_ModeCfgII.UploadServerList[0].EventType[2]', 'DoorStatus'],
    ['Intelbras_ModeCfgII.UploadServerList[0].EventType[3]', 'AlarmEvent'],
    ['Intelbras_ModeCfgII.UploadServerList[0].EventType[4]', 'SystemEvent'],
    ['Intelbras_ModeCfgII.UploadServerList[0].HttpsEnable', httpsEnabled ? 'true' : 'false'],
  ]);

  const step2Command = buildDeviceConfigCommand('/cgi-bin/configManager.cgi', [
    ['action', 'setConfig'],
    ['Intelbras_UploadContentType.ContentType', 'jsonv2'],
  ]);

  const step3Command = buildDeviceConfigCommand('/cgi-bin/configManager.cgi', [
    ['action', 'setConfig'],
    ['Intelbras_ModeCfg.DeviceMode', '3'],
  ]);

  return {
    publicBaseUrl: baseUrl,
    eventEndpointUrl: webhookUrl.toString(),
    address,
    port,
    uploadPath,
    httpsEnabled,
    step1Command,
    stepContentTypeCommand: step2Command,
    step2Command: step3Command,
  };
}
