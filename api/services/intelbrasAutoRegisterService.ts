import * as crypto from 'crypto';
import type { Socket } from 'net';
import { logger } from '../lib/logger';
import { prisma } from '../prisma';
import { resolveDeviceForAutoRegister } from './autoRegisterDeviceLookup';
import {
  autoRegisterPresenceService,
  type AutoRegisterSessionPresence,
} from './autoRegisterPresenceService';
import { writeOpsLog } from './opsLogService';

interface PendingRequest {
  resolve: (val: {
    statusLine: string;
    headers: Record<string, string>;
    body: Buffer;
    bodyText: string;
  }) => void;
  reject: (err: Error) => void;
}

interface ActiveConnection {
  socket: Socket;
  deviceDBId: string;
  token?: string;
  keepAliveInterval?: NodeJS.Timeout;
  pendingRequests: Map<number, PendingRequest>;
  requestIdCounter: number;
  buffer: Buffer;
  devClass: string;
  serverIp: string;
  connectedAt: string;
}

export class IntelbrasAutoRegisterService {
  private static instance: IntelbrasAutoRegisterService;

  private activeConnections = new Map<string, ActiveConnection>();

  private constructor() {
    void autoRegisterPresenceService.start();
  }

  public static getInstance(): IntelbrasAutoRegisterService {
    if (!IntelbrasAutoRegisterService.instance) {
      IntelbrasAutoRegisterService.instance = new IntelbrasAutoRegisterService();
    }
    return IntelbrasAutoRegisterService.instance;
  }

  public getActiveDevices() {
    const deviceIds = new Set<string>([
      ...autoRegisterPresenceService.getActiveDeviceIds(),
      ...this.activeConnections.keys(),
    ]);
    return Array.from(deviceIds.values());
  }

  public getLocalDeviceCount() {
    return this.activeConnections.size;
  }

  public hasDevice(deviceId: string) {
    return this.activeConnections.has(deviceId) || autoRegisterPresenceService.hasSession(deviceId);
  }

  public hasLocalDevice(deviceId: string) {
    return this.activeConnections.has(deviceId);
  }

  public getConnectionToken(deviceId: string) {
    return this.activeConnections.get(deviceId)?.token || '';
  }

  /**
   * Called by the Express route when /cgi-bin/api/autoRegist/connect arrives.
   */
  public async handleNewConnection(
    deviceId: string,
    devClass: string,
    serverIp: string,
    socket: Socket,
    resolvedDeviceId?: string,
  ) {
    logger.info('Incoming AutoRegister reverse TCP connection', {
      deviceId,
      devClass,
      serverIp,
    });

    const device = resolvedDeviceId
      ? await prisma.device.findUnique({
          where: { id: resolvedDeviceId },
          select: {
            id: true,
            username: true,
            passwordEnc: true,
          },
        })
      : (await resolveDeviceForAutoRegister(deviceId)).device;

    if (!device) {
      logger.warn('AutoRegister device not found during connection handling', {
        deviceId,
      });

      void writeOpsLog({
        level: 'warn',
        source: 'intelbras_autoreg',
        category: 'tcp_tunnel',
        outcome: 'tunnel_rejected',
        message: 'Conexão TCP rejeitada: dispositivo não localizado ou serial inválido',
        deviceId: undefined,
        deviceRef: deviceId, // Intelbras Serial
        metadata: { serverIp, devClass },
      });

      socket.destroy();
      return;
    }

    // Base ops log for this device
    const baseLog = {
      source: 'intelbras_autoreg',
      category: 'tcp_tunnel',
      deviceId: device.id,
      deviceName: (device as any).name,
      deviceRef: deviceId, // Internal serial
    };

    void writeOpsLog({
      ...baseLog,
      level: 'info',
      outcome: 'tunnel_handshake_start',
      message: 'Conexão TCP raw recebida na porta 7010. Iniciando handshake HTTP/Digest.',
      metadata: { serverIp, devClass },
    });

    // Per Intelbras docs: acknowledge the connection with HTTP 200 OK.
    // The socket has already been detached from Node.js HTTP server by the route handler,
    // so this write goes directly to the device without HTTP parser interference.
    socket.write('HTTP/1.1 200 OK\r\nConnection: keep-alive\r\nContent-Length: 0\r\n\r\n');

    if (this.activeConnections.has(deviceId)) {
      const old = this.activeConnections.get(deviceId)!;
      clearInterval(old.keepAliveInterval);
      old.socket.destroy();
    }

    const connectedAt = new Date().toISOString();
    const connData: ActiveConnection = {
      socket,
      deviceDBId: device.id,
      token: undefined,
      keepAliveInterval: undefined,
      pendingRequests: new Map(),
      requestIdCounter: 0,
      buffer: Buffer.alloc(0),
      devClass,
      serverIp,
      connectedAt,
    };
    this.activeConnections.set(deviceId, connData);

    await autoRegisterPresenceService.upsertSession(
      this.buildPresence(deviceId, connData, {
        status: 'connected',
        tokenReady: false,
      }),
    );

    socket.on('data', (data) => {
      void autoRegisterPresenceService.touchSession(deviceId, {
        lastSeenAt: new Date().toISOString(),
      });
      this.onSocketData(
        deviceId,
        Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8'),
      );
    });
    socket.on('close', () => {
      void this.cleanupConnection(deviceId);
    });
    socket.on('error', (err) => {
      logger.warn('AutoRegister socket error', {
        deviceId,
        error: err.message,
      });
      void this.cleanupConnection(deviceId);
    });

    await prisma.device.update({
      where: { id: device.id },
      data: { status: 'online', lastHeartbeat: new Date() },
    }).catch(() => undefined);

    try {
      await this.performLogin(
        deviceId,
        device.username,
        device.passwordEnc || 'admin',
        serverIp,
      );

      logger.info('AutoRegister authentication successful', {
        deviceId,
        deviceDbId: device.id,
      });

      void writeOpsLog({
        ...baseLog,
        level: 'info',
        outcome: 'tunnel_auth_ok',
        message: 'Autenticação Digest concluída com sucesso. Túnel TCP reverso estabelecido.',
      });

      await autoRegisterPresenceService.touchSession(deviceId, {
        status: 'authenticated',
        tokenReady: true,
      });

      connData.keepAliveInterval = setInterval(() => {
        void this.sendKeepAlive(deviceId, serverIp);
      }, 20_000);
    } catch (err: any) {
      logger.error('AutoRegister login failed', {
        deviceId,
        deviceDbId: device.id,
        error: err.message,
      });

      void writeOpsLog({
        ...baseLog,
        level: 'error',
        outcome: 'tunnel_auth_failed',
        message: 'Falha na autenticação Digest do túnel ou timeout',
        metadata: { error: err.message },
      });

      socket.destroy();
    }
  }

  public async sendCgiRequest(deviceId: string, method: string, path: string, body?: unknown) {
    const raw = this.buildRawRequest(deviceId, method, path, body);
    const response = await this.sendRequest(deviceId, raw);
    if (!response.statusLine.includes('200')) {
      throw new Error(`CGI AutoRegister error: ${response.statusLine} on ${path}`);
    }

    try {
      return JSON.parse(response.bodyText);
    } catch {
      return response.bodyText;
    }
  }

  public async sendBinaryCgiRequest(deviceId: string, method: string, path: string, body?: unknown) {
    const raw = this.buildRawRequest(deviceId, method, path, body);
    const response = await this.sendRequest(deviceId, raw);
    if (!response.statusLine.includes('200')) {
      throw new Error(`CGI AutoRegister error: ${response.statusLine} on ${path}`);
    }
    return response;
  }

  public async downloadFile(deviceId: string, fileName: string) {
    const safeFileName = encodeURIComponent(fileName).replace(/%2F/g, '/');
    const response = await this.sendBinaryCgiRequest(
      deviceId,
      'GET',
      `/cgi-bin/FileManager.cgi?action=downloadFile&fileName=${safeFileName}`,
    );
    return response.body;
  }

  /**
   * Writes raw HTTP out via the reverse socket and awaits the sequential response.
   */
  public sendRequest(deviceId: string, rawHttpRequest: string) {
    return new Promise<{
      statusLine: string;
      headers: Record<string, string>;
      body: Buffer;
      bodyText: string;
    }>((resolve, reject) => {
      const conn = this.activeConnections.get(deviceId);
      if (!conn) {
        reject(new Error('Device not connected via local AutoRegister gateway'));
        return;
      }

      const reqId = conn.requestIdCounter++;
      conn.pendingRequests.set(reqId, { resolve, reject });

      setTimeout(() => {
        const pending = conn.pendingRequests.get(reqId);
        if (!pending) {
          return;
        }

        pending.reject(new Error('Timeout waiting for response from reverse socket'));
        conn.pendingRequests.delete(reqId);
      }, 15_000);

      conn.socket.write(rawHttpRequest);
    });
  }

  private async cleanupConnection(deviceId: string) {
    const conn = this.activeConnections.get(deviceId);
    if (!conn) {
      return;
    }

    clearInterval(conn.keepAliveInterval);

    for (const [, pendingRequest] of conn.pendingRequests) {
      pendingRequest.reject(new Error('AutoRegister connection closed'));
    }

    this.activeConnections.delete(deviceId);
    await autoRegisterPresenceService.removeSession(deviceId);

    logger.info('AutoRegister connection closed', {
      deviceId,
      deviceDbId: conn.deviceDBId,
    });

    void writeOpsLog({
      level: 'warn', // Consider this a warning so it flags attention if it loops
      source: 'intelbras_autoreg',
      category: 'tcp_tunnel',
      outcome: 'tunnel_closed',
      message: 'Túnel TCP desconectado / socket encerrado',
      deviceId: conn.deviceDBId,
      deviceRef: deviceId,
    });
  }

  private onSocketData(deviceId: string, chunk: Buffer) {
    const conn = this.activeConnections.get(deviceId);
    if (!conn) {
      return;
    }

    conn.buffer = Buffer.concat([conn.buffer, chunk]);

    while (true) {
      const headerEndIdx = conn.buffer.indexOf(Buffer.from('\r\n\r\n', 'latin1'));
      if (headerEndIdx === -1) {
        break;
      }

      const headersRaw = conn.buffer.subarray(0, headerEndIdx).toString('latin1');
      const headerLines = headersRaw.split('\r\n');
      const statusLine = headerLines[0];

      const headers: Record<string, string> = {};
      for (let i = 1; i < headerLines.length; i += 1) {
        const line = headerLines[i];
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          headers[line.substring(0, colonIdx).trim().toLowerCase()] = line.substring(colonIdx + 1).trim();
        }
      }

      const contentLength = headers['content-length'] ? parseInt(headers['content-length'], 10) : 0;
      const totalSize = headerEndIdx + 4 + contentLength;
      if (conn.buffer.length < totalSize) {
        break;
      }

      const bodyRaw = Buffer.from(conn.buffer.subarray(headerEndIdx + 4, totalSize));
      conn.buffer = Buffer.from(conn.buffer.subarray(totalSize));

      this.dispatchResponse(deviceId, statusLine, headers, bodyRaw);
    }
  }

  private dispatchResponse(
    deviceId: string,
    statusLine: string,
    headers: Record<string, string>,
    body: Buffer,
  ) {
    const conn = this.activeConnections.get(deviceId);
    if (!conn) {
      return;
    }

    if (conn.pendingRequests.size === 0) {
      logger.warn('Unexpected AutoRegister response dropped', {
        deviceId,
        statusLine,
      });
      return;
    }

    const firstReqId = Array.from(conn.pendingRequests.keys())[0];
    const pendingRequest = conn.pendingRequests.get(firstReqId);
    if (!pendingRequest) {
      return;
    }

    conn.pendingRequests.delete(firstReqId);
    pendingRequest.resolve({
      statusLine,
      headers,
      body,
      bodyText: this.decodeResponseBody(body, headers),
    });
  }

  private async performLogin(deviceId: string, username: string, passwordEnc: string, serverIp: string) {
    const conn = this.activeConnections.get(deviceId);
    if (!conn) {
      throw new Error('Device not connected');
    }

    const loginPath = '/cgi-bin/api/global/login';
    const req1 = `POST ${loginPath} HTTP/1.1\r\nHost: ${serverIp}\r\nConnection: keep-alive\r\nContent-Length: 0\r\n\r\n`;

    let res1;
    try {
      res1 = await this.sendRequest(deviceId, req1);
    } catch (err: any) {
      throw new Error(`Login request 1 failed: ${err.message}`);
    }

    if (!res1.statusLine.includes('401')) {
      throw new Error(`Expected 401 Unauthorized, got ${res1.statusLine}`);
    }

    const wwwAuth = res1.headers['www-authenticate'];
    if (!wwwAuth) {
      throw new Error('No WWW-Authenticate header found');
    }

    const digest = this.parseDigestInfo(wwwAuth);
    const nc = '00000001';
    const cnonce = crypto.randomBytes(8).toString('hex');
    const qop = 'auth';
    const md5 = (value: string) => crypto.createHash('md5').update(value).digest('hex');

    const ha1 = md5(`${username}:${digest.realm}:${passwordEnc}`);
    const ha2 = md5(`POST:${loginPath}`);
    const responseHash = md5(`${ha1}:${digest.nonce}:${nc}:${cnonce}:${qop}:${ha2}`);

    const authHeader = `Digest username="${username}", realm="${digest.realm}", nonce="${digest.nonce}", uri="${loginPath}", response="${responseHash}", opaque="${digest.opaque}", qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;

    const req2 = `POST ${loginPath} HTTP/1.1\r\nHost: ${serverIp}\r\nAuthorization: ${authHeader}\r\nConnection: keep-alive\r\nContent-Length: 0\r\n\r\n`;

    let res2;
    try {
      res2 = await this.sendRequest(deviceId, req2);
    } catch (err: any) {
      throw new Error(`Login request 2 failed: ${err.message}`);
    }

    if (!res2.statusLine.includes('200')) {
      throw new Error(`Auth failed on request 2: ${res2.statusLine}`);
    }

    try {
      const json = JSON.parse(res2.bodyText);
      if (json.Token || json.Token === '') {
        conn.token = json.Token;
        return;
      }
    } catch {
      // fall through to final error
    }

    throw new Error(`Auth failed on request 2: ${res2.statusLine}`);
  }

  private async sendKeepAlive(deviceId: string, serverIp: string) {
    const conn = this.activeConnections.get(deviceId);
    if (!conn || !conn.token) {
      return;
    }

    const req = `POST /cgi-bin/api/global/keep-alive HTTP/1.1\r\nHost: ${serverIp}\r\nX-cgi-token: ${conn.token}\r\nConnection: keep-alive\r\nContent-Length: 0\r\n\r\n`;
    try {
      await this.sendRequest(deviceId, req);
      await autoRegisterPresenceService.touchSession(deviceId, {
        status: 'authenticated',
        tokenReady: true,
      });
    } catch (err: any) {
      logger.warn('AutoRegister keep-alive failed', {
        deviceId,
        error: err.message,
      });
    }
  }

  private parseDigestInfo(authenticateHeader: string): Record<string, string> {
    const digestData: Record<string, string> = {};
    const parts = authenticateHeader.replace('Digest ', '').split(',');
    for (const part of parts) {
      const match = part.trim().match(/([a-z]+)="?([^"]*)"?/i);
      if (match) {
        digestData[match[1]] = match[2];
      }
    }
    return digestData;
  }

  private decodeResponseBody(body: Buffer, headers: Record<string, string>): string {
    if (!body.length) {
      return '';
    }

    const contentType = headers['content-type']?.toLowerCase() || '';
    const charset = contentType.match(/charset=([^;]+)/i)?.[1]?.trim().toLowerCase();
    if (charset === 'latin1' || charset === 'iso-8859-1') {
      return body.toString('latin1');
    }

    return body.toString('utf8');
  }

  private buildRawRequest(deviceId: string, method: string, path: string, body?: unknown) {
    const bodyStr = body !== undefined ? JSON.stringify(body) : '';
    const token = this.getConnectionToken(deviceId);
    const headers = [
      `${method.toUpperCase()} ${path} HTTP/1.1`,
      'Host: device',
      'Connection: keep-alive',
      body !== undefined ? 'Content-Type: application/json' : '',
      `Content-Length: ${Buffer.byteLength(bodyStr, 'utf8')}`,
      token ? `X-cgi-token: ${token}` : '',
    ].filter(Boolean).join('\r\n');

    return `${headers}\r\n\r\n${bodyStr}`;
  }

  private buildPresence(
    deviceId: string,
    connection: ActiveConnection,
    overrides?: Partial<AutoRegisterSessionPresence>,
  ): AutoRegisterSessionPresence {
    const now = new Date().toISOString();
    return {
      deviceId,
      deviceDbId: connection.deviceDBId,
      gatewayInstanceId: autoRegisterPresenceService.getGatewayInstanceId(),
      gatewayHostname: process.env.HOSTNAME || 'local',
      devClass: connection.devClass,
      serverIp: connection.serverIp,
      status: overrides?.status || (connection.token ? 'authenticated' : 'connected'),
      tokenReady: overrides?.tokenReady ?? Boolean(connection.token),
      connectedAt: connection.connectedAt,
      lastSeenAt: overrides?.lastSeenAt || now,
    };
  }
}
