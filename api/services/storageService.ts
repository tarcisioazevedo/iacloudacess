import { Client as MinioClient } from 'minio';

function readStorageEndpoint() {
  return process.env.HETZNER_ENDPOINT
    || process.env.MINIO_ENDPOINT
    || 'localhost';
}

function readStoragePort() {
  const raw = process.env.HETZNER_PORT || process.env.MINIO_PORT || '9000';
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 9000;
}

function readStorageSslFlag() {
  if (process.env.HETZNER_SSL !== undefined) {
    return process.env.HETZNER_SSL !== 'false';
  }
  if (process.env.MINIO_USE_SSL !== undefined) {
    return process.env.MINIO_USE_SSL === 'true';
  }
  return readStoragePort() === 443;
}

const minio = new MinioClient({
  endPoint: readStorageEndpoint(),
  port: readStoragePort(),
  useSSL: readStorageSslFlag(),
  accessKey: process.env.HETZNER_ACCESS_KEY || process.env.MINIO_ACCESS_KEY || '',
  secretKey: process.env.HETZNER_SECRET_KEY || process.env.MINIO_SECRET_KEY || '',
});

export const BUCKETS = {
  HISTORY: process.env.HETZNER_HISTORY_BUCKET || process.env.MINIO_HISTORY_BUCKET || 'iacloud-school-history-records',
  STUDENT_PHOTOS: process.env.MINIO_STUDENT_PHOTOS_BUCKET || 'student-photos',
  EVENT_PHOTOS: process.env.MINIO_EVENT_PHOTOS_BUCKET || 'event-photos',
} as const;

function uniqueBuckets() {
  return Array.from(new Set(Object.values(BUCKETS)));
}

/**
 * Ensure required buckets exist.
 * Uses a retry loop so bootstrap tolerates object storage cold starts.
 */
export async function initStorage(retries = 5, delayMs = 2000) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      for (const bucket of uniqueBuckets()) {
        const exists = await minio.bucketExists(bucket);
        if (!exists) {
          await minio.makeBucket(bucket);
          console.log(`[Storage] Created bucket: ${bucket}`);
        }
      }
      return;
    } catch (err: any) {
      if (attempt === retries) {
        console.error(`[Storage] Init failed after ${retries} attempts:`, err.message);
        throw err;
      }

      console.warn(`[Storage] Not ready (attempt ${attempt}/${retries}), retrying in ${delayMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      delayMs = Math.round(delayMs * 1.5);
    }
  }
}

/**
 * Upload a file to a target bucket/path and return a stable storage pointer.
 */
export async function uploadFile(
  bucket: string,
  path: string,
  buffer: Buffer,
  contentType = 'image/jpeg',
): Promise<string> {
  await minio.putObject(bucket, path, buffer, buffer.length, { 'Content-Type': contentType });
  return `${bucket}/${path}`;
}

/**
 * Compatibility alias for callers using the newer generic naming.
 */
export async function uploadGenericFile(
  bucket: string,
  path: string,
  buffer: Buffer,
  contentType = 'image/jpeg',
): Promise<string> {
  return uploadFile(bucket, path, buffer, contentType);
}

/**
 * Upload an event resource using a tenant-aware hierarchical path.
 */
export async function uploadEventResource(
  integratorId: string,
  schoolId: string,
  date: Date,
  filename: string,
  buffer: Buffer,
  contentType = 'image/jpeg',
): Promise<string> {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const objectPath = `integrator_${integratorId}/school_${schoolId}/events/${year}/${month}/${day}/${filename}`;

  return uploadFile(BUCKETS.EVENT_PHOTOS, objectPath, buffer, contentType);
}

/**
 * Get a temporary signed URL for viewing/downloading a stored object.
 */
export async function getSignedUrl(storagePath: string, expirySeconds = 900): Promise<string> {
  const [bucket, ...rest] = storagePath.split('/');
  const objectPath = rest.join('/');
  return minio.presignedGetObject(bucket, objectPath, expirySeconds);
}

/**
 * Delete a file from storage.
 */
export async function deleteFile(storagePath: string): Promise<void> {
  const [bucket, ...rest] = storagePath.split('/');
  const objectPath = rest.join('/');
  await minio.removeObject(bucket, objectPath);
}

/**
 * Delete all objects belonging to an integrator across all buckets.
 * Uses the integrator_ prefix convention for hierarchical cleanup.
 */
export async function deleteIntegratorData(integratorId: string): Promise<{ deleted: number; errors: number }> {
  const prefix = `integrator_${integratorId}/`;
  let deleted = 0;
  let errors = 0;

  for (const bucket of uniqueBuckets()) {
    try {
      const objectsList = minio.listObjectsV2(bucket, prefix, true);
      const toDelete: string[] = [];

      for await (const obj of objectsList) {
        toDelete.push(obj.name);
      }

      if (toDelete.length > 0) {
        await minio.removeObjects(bucket, toDelete);
        deleted += toDelete.length;
      }
    } catch (err: any) {
      console.error(`[Storage] Failed to cleanup bucket ${bucket} for integrator ${integratorId}:`, err.message);
      errors += 1;
    }
  }

  return { deleted, errors };
}

/**
 * Set a lifecycle policy on a bucket to auto-expire objects after N days.
 * Hetzner Object Storage supports S3-compatible lifecycle rules.
 *
 * Usage: await setLifecyclePolicy(BUCKETS.HISTORY, 90);
 */
export async function setLifecyclePolicy(bucket: string, expirationDays: number): Promise<void> {
  const lifecycleConfig = {
    Rule: [
      {
        ID: `auto-expire-${expirationDays}d`,
        Status: 'Enabled' as const,
        Expiration: {
          Days: expirationDays,
        },
      },
    ],
  };

  await minio.setBucketLifecycle(bucket, lifecycleConfig);
  console.log(`[Storage] Lifecycle policy set on ${bucket}: expire after ${expirationDays} days`);
}

export { minio };
