/**
 * Factory que decide transparentemente qual transporte usar:
 *   1. cloud_autoreg  → usa o túnel TCP reverso mantido pelo AutoRegister CGI
 *   2. direct_http    → HTTP Digest Auth direto ao IP do dispositivo
 *
 * A camada de negócio chama esta factory e não precisa saber se o túnel está
 * no mesmo processo ou em um gateway AutoRegister dedicado.
 */

import axios from 'axios';
import { IntelbrasClient } from './intelbrasClient';
import { IntelbrasAutoRegisterService } from './intelbrasAutoRegisterService';
import { getDeviceReverseId, resolveDeviceTransport } from './deviceTransport';

type GenericPayload = Record<string, any>;

class LocalAutoRegisterProxyClient {
  private service = IntelbrasAutoRegisterService.getInstance();

  constructor(private readonly deviceId: string) {}

  private async cgiRequest(method: string, path: string, body?: unknown): Promise<any> {
    return this.service.sendCgiRequest(this.deviceId, method, path, body);
  }

  private async cgiBinaryRequest(method: string, path: string, body?: unknown): Promise<Buffer> {
    const response = await this.service.sendBinaryCgiRequest(this.deviceId, method, path, body);
    return response.body;
  }

  async insertUsers(users: any[]) {
    return this.cgiRequest('POST', '/cgi-bin/AccessUser.cgi?action=insertMulti', { UserList: users });
  }

  async insertFaces(faces: { UserID: string; PhotoData: string[] }[]) {
    return this.cgiRequest('POST', '/cgi-bin/AccessFace.cgi?action=insertMulti', { FaceList: faces });
  }

  async removeUser(userId: string) {
    return this.cgiRequest('POST', '/cgi-bin/AccessUser.cgi?action=removeMulti', { UserIDList: [userId] });
  }

  async removeFace(userId: string) {
    return this.cgiRequest('POST', '/cgi-bin/AccessFace.cgi?action=removeMulti', { UserIDList: [userId] });
  }

  async getDeviceInfo() {
    return this.cgiRequest('GET', '/cgi-bin/magicBox.cgi?action=getDeviceType');
  }

  async reboot() {
    return this.cgiRequest('GET', '/cgi-bin/magicBox.cgi?action=reboot');
  }

  async heartbeat() {
    try {
      const data = await this.getDeviceInfo();
      return { online: true, data };
    } catch {
      return { online: false, data: null };
    }
  }

  async downloadFile(fileName: string) {
    const safeFileName = encodeURIComponent(fileName).replace(/%2F/g, '/');
    return this.cgiBinaryRequest(
      'GET',
      `/cgi-bin/FileManager.cgi?action=downloadFile&fileName=${safeFileName}`,
    );
  }
}

class InternalAutoRegisterProxyClient {
  private readonly gatewayBaseUrl = process.env.AUTOREG_INTERNAL_BASE_URL?.trim();
  private readonly gatewayToken = process.env.AUTOREG_INTERNAL_TOKEN?.trim();

  constructor(private readonly deviceId: string) {}

  private async cgiRequest(method: string, path: string, body?: GenericPayload | undefined) {
    if (!this.gatewayBaseUrl) {
      throw new Error('AUTOREG_INTERNAL_BASE_URL is not configured');
    }
    if (!this.gatewayToken) {
      throw new Error('AUTOREG_INTERNAL_TOKEN is not configured');
    }

    const response = await axios.post(
      `${this.gatewayBaseUrl}/api/internal/autoreg/devices/${encodeURIComponent(this.deviceId)}/request`,
      { method, path, body },
      {
        timeout: 15_000,
        headers: {
          'x-autoreg-internal-token': this.gatewayToken,
        },
        validateStatus: () => true,
      },
    );

    if (response.status < 200 || response.status >= 300) {
      throw new Error(response.data?.message || `Gateway AutoRegister unavailable (${response.status})`);
    }

    return response.data?.data;
  }

  private async cgiBinaryRequest(method: string, path: string, body?: GenericPayload | undefined) {
    if (!this.gatewayBaseUrl) {
      throw new Error('AUTOREG_INTERNAL_BASE_URL is not configured');
    }
    if (!this.gatewayToken) {
      throw new Error('AUTOREG_INTERNAL_TOKEN is not configured');
    }

    const response = await axios.post(
      `${this.gatewayBaseUrl}/api/internal/autoreg/devices/${encodeURIComponent(this.deviceId)}/request`,
      { method, path, body, responseType: 'binary' },
      {
        timeout: 15_000,
        headers: {
          'x-autoreg-internal-token': this.gatewayToken,
        },
        validateStatus: () => true,
      },
    );

    if (response.status < 200 || response.status >= 300) {
      throw new Error(response.data?.message || `Gateway AutoRegister unavailable (${response.status})`);
    }

    const dataBase64 = response.data?.dataBase64;
    if (typeof dataBase64 !== 'string' || !dataBase64.length) {
      throw new Error('Gateway AutoRegister returned no binary payload');
    }

    return Buffer.from(dataBase64, 'base64');
  }

  async insertUsers(users: any[]) {
    return this.cgiRequest('POST', '/cgi-bin/AccessUser.cgi?action=insertMulti', { UserList: users });
  }

  async insertFaces(faces: { UserID: string; PhotoData: string[] }[]) {
    return this.cgiRequest('POST', '/cgi-bin/AccessFace.cgi?action=insertMulti', { FaceList: faces });
  }

  async removeUser(userId: string) {
    return this.cgiRequest('POST', '/cgi-bin/AccessUser.cgi?action=removeMulti', { UserIDList: [userId] });
  }

  async removeFace(userId: string) {
    return this.cgiRequest('POST', '/cgi-bin/AccessFace.cgi?action=removeMulti', { UserIDList: [userId] });
  }

  async getDeviceInfo() {
    return this.cgiRequest('GET', '/cgi-bin/magicBox.cgi?action=getDeviceType');
  }

  async reboot() {
    return this.cgiRequest('GET', '/cgi-bin/magicBox.cgi?action=reboot');
  }

  async heartbeat() {
    try {
      const data = await this.getDeviceInfo();
      return { online: true, data };
    } catch {
      return { online: false, data: null };
    }
  }

  async downloadFile(fileName: string) {
    const safeFileName = encodeURIComponent(fileName).replace(/%2F/g, '/');
    return this.cgiBinaryRequest(
      'GET',
      `/cgi-bin/FileManager.cgi?action=downloadFile&fileName=${safeFileName}`,
    );
  }
}

function buildCloudAutoRegisterClient(deviceId: string) {
  if (process.env.AUTOREG_INTERNAL_BASE_URL?.trim()) {
    return new InternalAutoRegisterProxyClient(deviceId);
  }

  return new LocalAutoRegisterProxyClient(deviceId);
}

export type DeviceClientShape = Pick<
  IntelbrasClient,
  'insertUsers' | 'insertFaces' | 'removeUser' | 'removeFace' | 'getDeviceInfo' | 'heartbeat' | 'downloadFile' | 'reboot'
>;

export function getDeviceClient(device: {
  id: string;
  ipAddress: string;
  port: number;
  username: string;
  passwordEnc?: string | null;
  connectionPolicy?: string | null;
  connectivityMode?: string | null;
  localIdentifier?: string | null;
  edgeConnectorId?: string | null;
  edgeConnector?: { id?: string | null; name?: string | null; status?: string | null } | null;
}): DeviceClientShape {
  const resolution = resolveDeviceTransport(device);
  const reverseId = getDeviceReverseId(device);

  if (resolution.effectiveTransport === 'cloud_autoreg') {
    return buildCloudAutoRegisterClient(reverseId);
  }

  if (resolution.effectiveTransport !== 'direct_http') {
    throw new Error(`Nenhum cliente de nuvem disponível para este dispositivo: ${resolution.reason}`);
  }

  return new IntelbrasClient(
    device.ipAddress,
    device.port,
    device.username,
    device.passwordEnc || 'admin',
  );
}
