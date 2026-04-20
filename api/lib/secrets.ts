/**
 * Docker Secrets reader utility.
 * In Swarm, secrets are mounted as files at /run/secrets/<name>.
 * This module provides a helper to read them with env fallback.
 */
import { readFileSync, existsSync } from 'fs';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Reads a secret value. Priority:
 * 1. Docker secret file (/run/secrets/<name>)
 * 2. Environment variable
 * 3. Default value
 */
export function readSecret(secretName: string, envVar: string, defaultValue?: string): string {
  const secretPath = `/run/secrets/${secretName}`;

  // Try Docker secret file first
  if (existsSync(secretPath)) {
    try {
      return readFileSync(secretPath, 'utf-8').trim();
    } catch {
      // Fall through to env
    }
  }

  // Fall back to environment variable
  const envValue = process.env[envVar];
  if (envValue) return envValue;

  // Use default only outside production
  if (!isProduction && defaultValue !== undefined) return defaultValue;

  throw new Error(`Secret '${secretName}' not found and env '${envVar}' not set`);
}

export function readDbPassword(): string {
  return readSecret('db_password', 'DB_PASSWORD', 'schoolpass2026');
}

export function readJwtSecret(): string {
  return readSecret('jwt_secret', 'JWT_SECRET', 'dev-secret');
}

export function readJwtRefreshSecret(): string {
  return readSecret('jwt_refresh_secret', 'JWT_REFRESH_SECRET', 'dev-refresh-secret');
}

export function readMinioSecretKey(): string {
  return readSecret('minio_secret_key', 'MINIO_SECRET_KEY', 'miniopass2026');
}

/**
 * Load all application secrets at startup.
 * Call once in server bootstrap.
 */
export function loadSecrets() {
  return {
    dbPassword: readDbPassword(),
    jwtSecret: readJwtSecret(),
    jwtRefreshSecret: readJwtRefreshSecret(),
    minioSecretKey: readMinioSecretKey(),
  };
}
