import crypto from 'crypto';
import { hashSecret, normalizeStringArray } from './edgeSecurity';

const DEFAULT_TUNNEL_CIDR = '100.96.0.0/16';
const DEFAULT_PERSISTENT_KEEPALIVE = 25;
const RESERVED_HOST_OFFSET = 10;

function base64UrlToBase64(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const remainder = padded.length % 4;
  return remainder === 0 ? padded : `${padded}${'='.repeat(4 - remainder)}`;
}

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');
}

function parseCommaSeparated(value: string | undefined, fallback: string[] = []): string[] {
  if (!value) return fallback;
  return normalizeStringArray(
    value.split(',').map((item) => item.trim()).filter(Boolean),
    32,
  );
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    throw new Error(`IPv4 inválido: ${ip}`);
  }

  return ((((parts[0] << 8) | parts[1]) << 8) | parts[2]) * 256 + parts[3];
}

function intToIpv4(value: number): string {
  return [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ].join('.');
}

function parseIpv4Cidr(cidr: string) {
  const [ip, prefixRaw] = cidr.split('/');
  const prefix = Number(prefixRaw);
  if (!ip || !Number.isInteger(prefix) || prefix < 8 || prefix > 30) {
    throw new Error(`CIDR inválido: ${cidr}`);
  }

  const baseInt = ipv4ToInt(ip);
  const mask = prefix === 0 ? 0 : ((0xffffffff << (32 - prefix)) >>> 0);
  const networkInt = baseInt & mask;
  const hostCount = 2 ** (32 - prefix);
  const broadcastInt = networkInt + hostCount - 1;

  return {
    cidr,
    prefix,
    networkInt,
    broadcastInt,
  };
}

function generateWireGuardKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519');
  const publicJwk = publicKey.export({ format: 'jwk' }) as JsonWebKey;
  const privateJwk = privateKey.export({ format: 'jwk' }) as JsonWebKey;

  if (!publicJwk.x || !privateJwk.d) {
    throw new Error('Falha ao exportar chaves X25519 em formato JWK');
  }

  return {
    publicKey: base64UrlToBase64(publicJwk.x),
    privateKey: base64UrlToBase64(privateJwk.d),
  };
}

function generatePresharedKey(): string {
  return crypto.randomBytes(32).toString('base64');
}

function extractTunnelAddress(metadata: any): string | null {
  const tunnelAddress = metadata?.management?.wireguard?.tunnelAddress;
  return typeof tunnelAddress === 'string' && tunnelAddress.trim() ? tunnelAddress.trim() : null;
}

function allocateTunnelAddress(connectors: Array<{ id: string; metadata?: unknown }>, tunnelCidr: string) {
  const network = parseIpv4Cidr(tunnelCidr);
  const used = new Set<number>();

  for (const connector of connectors) {
    const tunnelAddress = extractTunnelAddress(connector.metadata);
    if (!tunnelAddress) continue;
    const ip = tunnelAddress.split('/')[0];
    if (!ip) continue;
    try {
      used.add(ipv4ToInt(ip));
    } catch {
      // Ignore malformed historical metadata.
    }
  }

  const start = network.networkInt + RESERVED_HOST_OFFSET;
  const end = network.broadcastInt - 1;

  for (let candidate = start; candidate <= end; candidate += 1) {
    if (!used.has(candidate)) {
      return {
        tunnelAddress: `${intToIpv4(candidate)}/32`,
        peerIndex: candidate - network.networkInt,
      };
    }
  }

  throw new Error(`Sem endereços disponíveis no pool ${tunnelCidr} para novos peers WireGuard`);
}

export interface WireGuardInfrastructureStatus {
  mode: 'wireguard_management';
  configured: boolean;
  endpoint: string | null;
  serverPublicKey: string | null;
  tunnelCidr: string;
  allowedIps: string[];
  dns: string[];
  persistentKeepalive: number;
  reasons: string[];
  notes: string[];
}

export interface WireGuardProfile {
  profileName: string;
  generatedAt: string;
  tunnelAddress: string;
  endpoint: string;
  serverPublicKey: string;
  clientPublicKey: string;
  clientPrivateKey: string;
  presharedKey: string;
  allowedIps: string[];
  dns: string[];
  persistentKeepalive: number;
  configText: string;
}

export interface WireGuardMetadata {
  status: 'ready' | 'pending_infra';
  profileName: string;
  endpoint: string | null;
  serverPublicKey: string | null;
  tunnelAddress: string | null;
  tunnelCidr: string;
  allowedIps: string[];
  dns: string[];
  persistentKeepalive: number;
  clientPublicKey: string | null;
  presharedKeyHash: string | null;
  peerIndex: number | null;
  generatedAt: string;
  lastRotationAt: string | null;
  notes: string[];
  reasons: string[];
}

export interface WireGuardProvisionResult {
  infrastructure: WireGuardInfrastructureStatus;
  metadata: WireGuardMetadata;
  profile: WireGuardProfile | null;
}

export function getWireGuardInfrastructureStatus(): WireGuardInfrastructureStatus {
  const endpoint = process.env.EDGE_WG_ENDPOINT?.trim() || null;
  const serverPublicKey = process.env.EDGE_WG_SERVER_PUBLIC_KEY?.trim() || null;
  const tunnelCidr = process.env.EDGE_WG_TUNNEL_CIDR?.trim() || DEFAULT_TUNNEL_CIDR;
  const allowedIps = parseCommaSeparated(process.env.EDGE_WG_ALLOWED_IPS, [tunnelCidr]);
  const dns = parseCommaSeparated(process.env.EDGE_WG_DNS);
  const persistentKeepalive = parsePositiveInt(
    process.env.EDGE_WG_PERSISTENT_KEEPALIVE,
    DEFAULT_PERSISTENT_KEEPALIVE,
  );
  const reasons: string[] = [];

  if (!endpoint) reasons.push('EDGE_WG_ENDPOINT não configurado');
  if (!serverPublicKey) reasons.push('EDGE_WG_SERVER_PUBLIC_KEY não configurado');

  try {
    parseIpv4Cidr(tunnelCidr);
  } catch (err: any) {
    reasons.push(err.message || 'EDGE_WG_TUNNEL_CIDR inválido');
  }

  return {
    mode: 'wireguard_management',
    configured: reasons.length === 0,
    endpoint,
    serverPublicKey,
    tunnelCidr,
    allowedIps,
    dns,
    persistentKeepalive,
    reasons,
    notes: [
      'A VPN deve terminar no edge local, não na LAN inteira da escola.',
      'O edge continua sendo o ponto de acesso aos dispositivos locais; a VPN existe para gestão remota controlada.',
      'A configuração WireGuard é gerada pela plataforma, mas depende de um gateway VPN já publicado na infraestrutura.',
    ],
  };
}

export function getConnectorWireGuardSummary(metadata: any) {
  const wireguard = metadata?.management?.wireguard;
  if (!wireguard || typeof wireguard !== 'object') {
    return null;
  }

  return {
    status: typeof wireguard.status === 'string' ? wireguard.status : 'pending_infra',
    endpoint: typeof wireguard.endpoint === 'string' ? wireguard.endpoint : null,
    tunnelAddress: typeof wireguard.tunnelAddress === 'string' ? wireguard.tunnelAddress : null,
    tunnelCidr: typeof wireguard.tunnelCidr === 'string' ? wireguard.tunnelCidr : DEFAULT_TUNNEL_CIDR,
    allowedIps: Array.isArray(wireguard.allowedIps) ? wireguard.allowedIps.filter((item: unknown) => typeof item === 'string') : [],
    dns: Array.isArray(wireguard.dns) ? wireguard.dns.filter((item: unknown) => typeof item === 'string') : [],
    profileName: typeof wireguard.profileName === 'string' ? wireguard.profileName : null,
    generatedAt: typeof wireguard.generatedAt === 'string' ? wireguard.generatedAt : null,
    lastRotationAt: typeof wireguard.lastRotationAt === 'string' ? wireguard.lastRotationAt : null,
    reasons: Array.isArray(wireguard.reasons) ? wireguard.reasons.filter((item: unknown) => typeof item === 'string') : [],
    notes: Array.isArray(wireguard.notes) ? wireguard.notes.filter((item: unknown) => typeof item === 'string') : [],
  };
}

function buildProfileName(connectorName: string, schoolName: string) {
  const left = slugify(schoolName).slice(0, 18) || 'school';
  const right = slugify(connectorName).slice(0, 24) || 'edge';
  return `${left}-${right}-wg`;
}

export function provisionWireGuardForConnector(input: {
  connector: { id: string; name: string };
  school: { name: string };
  existingConnectors: Array<{ id: string; metadata?: unknown }>;
}): WireGuardProvisionResult {
  const infrastructure = getWireGuardInfrastructureStatus();
  const generatedAt = new Date().toISOString();
  const profileName = buildProfileName(input.connector.name, input.school.name);

  if (!infrastructure.configured || !infrastructure.endpoint || !infrastructure.serverPublicKey) {
    return {
      infrastructure,
      metadata: {
        status: 'pending_infra',
        profileName,
        endpoint: infrastructure.endpoint,
        serverPublicKey: infrastructure.serverPublicKey,
        tunnelAddress: null,
        tunnelCidr: infrastructure.tunnelCidr,
        allowedIps: infrastructure.allowedIps,
        dns: infrastructure.dns,
        persistentKeepalive: infrastructure.persistentKeepalive,
        clientPublicKey: null,
        presharedKeyHash: null,
        peerIndex: null,
        generatedAt,
        lastRotationAt: null,
        notes: infrastructure.notes,
        reasons: infrastructure.reasons,
      },
      profile: null,
    };
  }

  const { publicKey, privateKey } = generateWireGuardKeyPair();
  const presharedKey = generatePresharedKey();
  const allocation = allocateTunnelAddress(input.existingConnectors, infrastructure.tunnelCidr);

  const configLines = [
    '[Interface]',
    `PrivateKey = ${privateKey}`,
    `Address = ${allocation.tunnelAddress}`,
    ...(infrastructure.dns.length > 0 ? [`DNS = ${infrastructure.dns.join(', ')}`] : []),
    '',
    '[Peer]',
    `PublicKey = ${infrastructure.serverPublicKey}`,
    `PresharedKey = ${presharedKey}`,
    `AllowedIPs = ${infrastructure.allowedIps.join(', ')}`,
    `Endpoint = ${infrastructure.endpoint}`,
    `PersistentKeepalive = ${infrastructure.persistentKeepalive}`,
  ];

  return {
    infrastructure,
    metadata: {
      status: 'ready',
      profileName,
      endpoint: infrastructure.endpoint,
      serverPublicKey: infrastructure.serverPublicKey,
      tunnelAddress: allocation.tunnelAddress,
      tunnelCidr: infrastructure.tunnelCidr,
      allowedIps: infrastructure.allowedIps,
      dns: infrastructure.dns,
      persistentKeepalive: infrastructure.persistentKeepalive,
      clientPublicKey: publicKey,
      presharedKeyHash: hashSecret(presharedKey),
      peerIndex: allocation.peerIndex,
      generatedAt,
      lastRotationAt: generatedAt,
      notes: infrastructure.notes,
      reasons: [],
    },
    profile: {
      profileName,
      generatedAt,
      tunnelAddress: allocation.tunnelAddress,
      endpoint: infrastructure.endpoint,
      serverPublicKey: infrastructure.serverPublicKey,
      clientPublicKey: publicKey,
      clientPrivateKey: privateKey,
      presharedKey,
      allowedIps: infrastructure.allowedIps,
      dns: infrastructure.dns,
      persistentKeepalive: infrastructure.persistentKeepalive,
      configText: configLines.join('\n'),
    },
  };
}
