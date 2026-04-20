import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import crypto from 'crypto';

interface DigestChallenge {
  realm: string;
  nonce: string;
  qop?: string;
  opaque?: string;
  algorithm?: string;
}

interface AuthenticatedRequestOptions {
  data?: unknown;
  headers?: Record<string, string | undefined>;
  timeout?: number;
  responseType?: AxiosRequestConfig['responseType'];
}

/**
 * HTTP Digest Auth client for Intelbras access control devices.
 * It supports the common CGI endpoints plus the AutoRegister login/keep-alive flow.
 */
export class IntelbrasClient {
  private readonly ip: string;
  private readonly port: number;
  private readonly username: string;
  private readonly password: string;
  private nc = 0;

  constructor(ip: string, port: number, username: string, password: string) {
    this.ip = ip;
    this.port = port;
    this.username = username;
    this.password = password;
  }

  private get baseUrl() {
    return `http://${this.ip}:${this.port}`;
  }

  private md5(data: string): string {
    return crypto.createHash('md5').update(data).digest('hex');
  }

  private parseWWWAuth(header: string): DigestChallenge {
    const realm = header.match(/realm="([^"]+)"/)?.[1] || '';
    const nonce = header.match(/nonce="([^"]+)"/)?.[1] || '';
    const qop = header.match(/qop="([^"]+)"/)?.[1]?.split(',')[0]?.trim();
    const opaque = header.match(/opaque="([^"]+)"/)?.[1];
    const algorithm = header.match(/algorithm=([A-Za-z0-9-]+)/)?.[1];

    return { realm, nonce, qop, opaque, algorithm };
  }

  private buildDigestHeader(challenge: DigestChallenge, uri: string, method: string): string {
    this.nc += 1;
    const nc = this.nc.toString(16).padStart(8, '0');
    const cnonce = crypto.randomBytes(8).toString('hex');
    const ha1 = this.md5(`${this.username}:${challenge.realm}:${this.password}`);
    const ha2 = this.md5(`${method}:${uri}`);

    const segments = [
      `username="${this.username}"`,
      `realm="${challenge.realm}"`,
      `nonce="${challenge.nonce}"`,
      `uri="${uri}"`,
    ];

    if (challenge.qop === 'auth') {
      const response = this.md5(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:${challenge.qop}:${ha2}`);
      segments.push(`qop=${challenge.qop}`);
      segments.push(`nc=${nc}`);
      segments.push(`cnonce="${cnonce}"`);
      segments.push(`response="${response}"`);
    } else {
      const response = this.md5(`${ha1}:${challenge.nonce}:${ha2}`);
      segments.push(`response="${response}"`);
    }

    if (challenge.opaque) {
      segments.push(`opaque="${challenge.opaque}"`);
    }

    if (challenge.algorithm) {
      segments.push(`algorithm=${challenge.algorithm}`);
    }

    return `Digest ${segments.join(', ')}`;
  }

  private async fetchDigestChallenge(
    method: string,
    path: string,
    timeout = 5000,
  ): Promise<DigestChallenge> {
    const url = `${this.baseUrl}${path}`;
    const response = await axios({
      method,
      url,
      timeout,
      validateStatus: () => true,
    });

    if (response.status !== 401) {
      throw new Error(`Device did not respond with 401 challenge at ${url}`);
    }

    const wwwAuth = response.headers['www-authenticate'];
    if (!wwwAuth || typeof wwwAuth !== 'string') {
      throw new Error(`No WWW-Authenticate header in 401 response from ${url}`);
    }

    return this.parseWWWAuth(wwwAuth);
  }

  private async authenticatedRequest(
    method: string,
    path: string,
    options: AuthenticatedRequestOptions = {},
  ): Promise<AxiosResponse<any>> {
    const timeout = options.timeout || 10000;
    const challenge = await this.fetchDigestChallenge(method, path, Math.min(timeout, 5000));
    const authorization = this.buildDigestHeader(challenge, path, method.toUpperCase());

    const requestConfig: AxiosRequestConfig = {
      method,
      url: `${this.baseUrl}${path}`,
      data: options.data,
      timeout,
      responseType: options.responseType,
      headers: {
        Authorization: authorization,
        ...options.headers,
      },
      validateStatus: (status) => status >= 200 && status < 300,
    };

    if (options.data !== undefined && !requestConfig.headers?.['Content-Type']) {
      requestConfig.headers = {
        ...requestConfig.headers,
        'Content-Type': 'application/json',
      };
    }

    return axios(requestConfig);
  }

  async request(method: string, path: string, data?: unknown, timeout = 10000): Promise<any> {
    const response = await this.authenticatedRequest(method, path, { data, timeout });
    const result = response.data;

    // P0 FIX: Intelbras devices return HTTP 200 with body "Bad Request" when
    // the payload is rejected (e.g. face too large, invalid UserID format).
    // Without this check the sync worker would consider it a success.
    if (typeof result === 'string') {
      const lower = result.trim().toLowerCase();
      if (lower.includes('bad request') || lower.includes('error') || lower.includes('failed')) {
        throw new Error(`Device rejected request on ${path}: ${result.trim().slice(0, 200)}`);
      }
    }

    return result;
  }

  async openAutoRegisterSession(timeout = 10000): Promise<string> {
    const response = await this.authenticatedRequest('POST', '/cgi-bin/api/global/login', {
      timeout,
      headers: {
        'Content-Length': '0',
      },
    });

    const token = response.data?.Token || response.data?.token;
    if (typeof token !== 'string' || !token.trim()) {
      throw new Error(`AutoRegister login did not return a token for device ${this.ip}`);
    }

    return token.trim();
  }

  async keepAutoRegisterAlive(token: string, timeout = 10000): Promise<boolean> {
    await axios({
      method: 'POST',
      url: `${this.baseUrl}/cgi-bin/api/global/keep-alive`,
      timeout,
      headers: {
        'X-cgi-token': token,
        'Content-Length': '0',
      },
      validateStatus: (status) => status >= 200 && status < 300,
    });

    return true;
  }

  async insertUsers(users: any[]) {
    return this.request('POST', '/cgi-bin/AccessUser.cgi?action=insertMulti', {
      UserList: users,
    });
  }

  async insertFaces(faces: { UserID: string; PhotoData: string[] }[]) {
    return this.request('POST', '/cgi-bin/AccessFace.cgi?action=insertMulti', {
      FaceList: faces,
    });
  }

  async removeUser(userId: string) {
    return this.request('POST', '/cgi-bin/AccessUser.cgi?action=removeMulti', {
      UserIDList: [userId],
    });
  }

  async removeFace(userId: string) {
    return this.request('POST', '/cgi-bin/AccessFace.cgi?action=removeMulti', {
      UserIDList: [userId],
    });
  }

  async getDeviceInfo() {
    return this.request('GET', '/cgi-bin/magicBox.cgi?action=getDeviceType');
  }

  async downloadFile(fileName: string, timeout = 15000): Promise<Buffer> {
    const safeFileName = encodeURIComponent(fileName).replace(/%2F/g, '/');
    const response = await this.authenticatedRequest(
      'GET',
      `/cgi-bin/FileManager.cgi?action=downloadFile&fileName=${safeFileName}`,
      {
        timeout,
        responseType: 'arraybuffer',
      },
    );

    if (Buffer.isBuffer(response.data)) {
      return response.data;
    }

    return Buffer.from(response.data);
  }

  async heartbeat() {
    try {
      const data = await this.getDeviceInfo();
      return { online: true, data };
    } catch {
      return { online: false, data: null };
    }
  }
}
