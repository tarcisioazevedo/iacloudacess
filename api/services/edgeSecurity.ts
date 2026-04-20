import crypto from 'crypto';

const DEFAULT_TOKEN_BYTES = 24;

export function generateOpaqueSecret(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(DEFAULT_TOKEN_BYTES).toString('base64url')}`;
}

export function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

export function secretsEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function normalizeStringArray(input: unknown, maxItems = 16): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const unique = new Set<string>();

  for (const value of input) {
    if (typeof value !== 'string') continue;
    const normalized = value.trim();
    if (!normalized) continue;
    unique.add(normalized);
    if (unique.size >= maxItems) break;
  }

  return Array.from(unique);
}

export function requestIpAddress(headers: Record<string, string | string[] | undefined>, fallback?: string): string | null {
  const forwarded = headers['x-forwarded-for'];

  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]?.trim() || null;
  }

  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0]?.split(',')[0]?.trim() || null;
  }

  return fallback || null;
}
