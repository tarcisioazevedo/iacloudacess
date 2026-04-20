import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import type { CloudEdgeCredentials, NormalizedEdgeEventPayload, SpoolEventRecord } from './types';

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return JSON.parse(text) as T;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return fallback;
    }
    throw err;
  }
}

async function writeJsonFile(filePath: string, payload: unknown) {
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

export class EdgeStateStore {
  private readonly credentialsPath: string;
  private readonly eventSpoolPath: string;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly stateDir: string) {
    this.credentialsPath = path.join(stateDir, 'credentials.json');
    this.eventSpoolPath = path.join(stateDir, 'event-spool.json');
  }

  async init() {
    await fs.mkdir(this.stateDir, { recursive: true });
  }

  async loadCredentials(): Promise<CloudEdgeCredentials | null> {
    return readJsonFile<CloudEdgeCredentials | null>(this.credentialsPath, null);
  }

  async saveCredentials(credentials: CloudEdgeCredentials) {
    await this.init();
    await writeJsonFile(this.credentialsPath, credentials);
  }

  private withLock<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation);
    this.queue = next.then(() => undefined, () => undefined);
    return next;
  }

  async appendEvent(payload: NormalizedEdgeEventPayload): Promise<SpoolEventRecord> {
    return this.withLock(async () => {
      await this.init();
      const records = await readJsonFile<SpoolEventRecord[]>(this.eventSpoolPath, []);
      const record: SpoolEventRecord = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        attempts: 0,
        payload,
      };
      records.push(record);
      await writeJsonFile(this.eventSpoolPath, records);
      return record;
    });
  }

  async peekEvents(limit: number): Promise<SpoolEventRecord[]> {
    return this.withLock(async () => {
      const records = await readJsonFile<SpoolEventRecord[]>(this.eventSpoolPath, []);
      return records.slice(0, limit);
    });
  }

  async acknowledgeEvents(ids: string[]) {
    if (ids.length === 0) return;
    await this.withLock(async () => {
      const records = await readJsonFile<SpoolEventRecord[]>(this.eventSpoolPath, []);
      const nextRecords = records.filter((record) => !ids.includes(record.id));
      await writeJsonFile(this.eventSpoolPath, nextRecords);
    });
  }

  async bumpEventAttempts(ids: string[]) {
    if (ids.length === 0) return;
    await this.withLock(async () => {
      const records = await readJsonFile<SpoolEventRecord[]>(this.eventSpoolPath, []);
      const nextRecords = records.map((record) => (
        ids.includes(record.id)
          ? { ...record, attempts: record.attempts + 1 }
          : record
      ));
      await writeJsonFile(this.eventSpoolPath, nextRecords);
    });
  }

  async getSpoolSize(): Promise<number> {
    return this.withLock(async () => {
      const records = await readJsonFile<SpoolEventRecord[]>(this.eventSpoolPath, []);
      return records.length;
    });
  }
}
