import { Prisma } from '@prisma/client';
import crypto from 'crypto';
import { prisma } from '../prisma';
import { logger } from '../lib/logger';

export type OpsLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface WriteOpsLogInput {
  level: OpsLogLevel;
  source: string;
  category?: string | null;
  outcome?: string | null;
  message: string;
  requestId?: string | null;
  correlationId?: string | null;
  integratorId?: string | null;
  schoolId?: string | null;
  schoolUnitId?: string | null;
  schoolName?: string | null;
  deviceId?: string | null;
  deviceName?: string | null;
  deviceRef?: string | null;
  eventId?: string | null;
  eventCode?: string | null;
  transport?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date;
}

export interface OpsLogFilters {
  allowedDeviceIds?: string[] | null;
  deviceId?: string | null;
  level?: string | null;
  source?: string | null;
  outcome?: string | null;
  requestId?: string | null;
  search?: string | null;
  limit?: number;
  page?: number;
}

export interface OpsLogRow {
  id: string;
  createdAt: Date;
  level: string;
  source: string;
  category: string | null;
  outcome: string | null;
  message: string;
  requestId: string | null;
  correlationId: string | null;
  integratorId: string | null;
  schoolId: string | null;
  schoolUnitId: string | null;
  schoolName: string | null;
  deviceId: string | null;
  deviceName: string | null;
  deviceRef: string | null;
  eventId: string | null;
  eventCode: string | null;
  transport: string | null;
  metadata: Record<string, unknown> | null;
}

export interface OpsLogSummary {
  total: number;
  last24h: number;
  errors24h: number;
  warnings24h: number;
  bySource: Array<{ source: string; count: number }>;
  byOutcome: Array<{ outcome: string; count: number }>;
}

export type OpsHealthStatus = 'healthy' | 'attention' | 'critical' | 'idle';

export interface OpsDeviceHealthRow {
  deviceId: string;
  deviceName: string;
  deviceRef: string | null;
  location: string | null;
  schoolName: string;
  deviceStatus: string;
  connectionPolicy: string;
  connectivityMode: string;
  lastHeartbeat: Date | null;
  lastEventAt: Date | null;
  lastLogAt: Date | null;
  lastSuccessAt: Date | null;
  lastErrorAt: Date | null;
  logs24h: number;
  errors24h: number;
  warnings24h: number;
  success24h: number;
  snapshotFailures24h: number;
  parserFailures24h: number;
  notificationFailures24h: number;
  duplicates24h: number;
  healthStatus: OpsHealthStatus;
  healthLabel: string;
  reasons: string[];
}

export interface OpsDeviceAlert {
  severity: 'critical' | 'attention' | 'info';
  deviceId: string;
  deviceName: string;
  schoolName: string;
  title: string;
  message: string;
  reasons: string[];
  lastLogAt: Date | null;
  lastHeartbeat: Date | null;
  lastEventAt: Date | null;
}

export interface OpsHealthDashboard {
  totals: Record<OpsHealthStatus, number>;
  alerts: OpsDeviceAlert[];
  devices: OpsDeviceHealthRow[];
}

interface OpsDeviceAggregateRow {
  deviceId: string;
  lastLogAt: Date | null;
  lastSuccessAt: Date | null;
  lastErrorAt: Date | null;
  logs24h: bigint | number;
  errors24h: bigint | number;
  warnings24h: bigint | number;
  success24h: bigint | number;
  snapshotFailures24h: bigint | number;
  parserFailures24h: bigint | number;
  notificationFailures24h: bigint | number;
  duplicates24h: bigint | number;
}

interface OpsHealthFilters {
  allowedDeviceIds?: string[] | null;
  deviceId?: string | null;
  search?: string | null;
}

let ensurePromise: Promise<void> | null = null;
const HEALTH_LABELS: Record<OpsHealthStatus, string> = {
  healthy: 'Saudavel',
  attention: 'Sob atencao',
  critical: 'Critico',
  idle: 'Ocioso',
};
const HEALTH_SORT_ORDER: Record<OpsHealthStatus, number> = {
  critical: 0,
  attention: 1,
  idle: 2,
  healthy: 3,
};

function appendCondition(conditions: string[], values: unknown[], sql: string, value: unknown) {
  values.push(value);
  const placeholder = `$${values.length}`;
  conditions.push(sql.replace('?', placeholder));
}

async function ensureOpsLogTable() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS device_operational_logs (
          id TEXT PRIMARY KEY,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          level TEXT NOT NULL,
          source TEXT NOT NULL,
          category TEXT NULL,
          outcome TEXT NULL,
          message TEXT NOT NULL,
          request_id TEXT NULL,
          correlation_id TEXT NULL,
          integrator_id TEXT NULL,
          school_id TEXT NULL,
          school_unit_id TEXT NULL,
          school_name TEXT NULL,
          device_id TEXT NULL,
          device_name TEXT NULL,
          device_ref TEXT NULL,
          event_id TEXT NULL,
          event_code TEXT NULL,
          transport TEXT NULL,
          metadata JSONB NULL DEFAULT '{}'::jsonb
        );
      `);

      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_device_operational_logs_created_at
        ON device_operational_logs (created_at DESC);
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_device_operational_logs_device
        ON device_operational_logs (device_id, created_at DESC);
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_device_operational_logs_request
        ON device_operational_logs (request_id);
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_device_operational_logs_source_level
        ON device_operational_logs (source, level, created_at DESC);
      `);
    })().catch((err) => {
      ensurePromise = null;
      throw err;
    });
  }

  return ensurePromise;
}

export async function initOpsLogStore() {
  await ensureOpsLogTable();
}

export async function writeOpsLog(input: WriteOpsLogInput) {
  try {
    await ensureOpsLogTable();

    await prisma.$executeRawUnsafe(
      `
        INSERT INTO device_operational_logs (
          id, created_at, level, source, category, outcome, message,
          request_id, correlation_id, integrator_id, school_id, school_unit_id, school_name,
          device_id, device_name, device_ref, event_id, event_code, transport, metadata
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13,
          $14, $15, $16, $17, $18, $19, $20::jsonb
        )
      `,
      crypto.randomUUID(),
      input.createdAt || new Date(),
      input.level,
      input.source,
      input.category || null,
      input.outcome || null,
      input.message,
      input.requestId || null,
      input.correlationId || null,
      input.integratorId || null,
      input.schoolId || null,
      input.schoolUnitId || null,
      input.schoolName || null,
      input.deviceId || null,
      input.deviceName || null,
      input.deviceRef || null,
      input.eventId || null,
      input.eventCode || null,
      input.transport || null,
      JSON.stringify(input.metadata || {}),
    );
  } catch (err: any) {
    logger.warn('Failed to persist operational log', { error: err.message, source: input.source });
  }
}

function buildWhereClause(filters: OpsLogFilters) {
  const conditions: string[] = [];
  const values: unknown[] = [];

  const allowedDeviceIds = filters.allowedDeviceIds || null;
  if (allowedDeviceIds && allowedDeviceIds.length === 0) {
    conditions.push('1 = 0');
  } else if (allowedDeviceIds && allowedDeviceIds.length > 0) {
    const placeholders = allowedDeviceIds.map((id) => {
      values.push(id);
      return `$${values.length}`;
    });
    conditions.push(`device_id IN (${placeholders.join(', ')})`);
  }

  if (filters.deviceId) appendCondition(conditions, values, 'device_id = ?', filters.deviceId);
  if (filters.level) appendCondition(conditions, values, 'level = ?', filters.level);
  if (filters.source) appendCondition(conditions, values, 'source = ?', filters.source);
  if (filters.outcome) appendCondition(conditions, values, 'outcome = ?', filters.outcome);
  if (filters.requestId) appendCondition(conditions, values, 'request_id = ?', filters.requestId);

  if (filters.search) {
    values.push(`%${filters.search}%`);
    const placeholder = `$${values.length}`;
    conditions.push(`(
      message ILIKE ${placeholder}
      OR COALESCE(device_name, '') ILIKE ${placeholder}
      OR COALESCE(device_ref, '') ILIKE ${placeholder}
      OR COALESCE(event_code, '') ILIKE ${placeholder}
      OR COALESCE(request_id, '') ILIKE ${placeholder}
    )`);
  }

  return {
    whereClause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    values,
  };
}

function buildOpsHealthDeviceWhere(filters: OpsHealthFilters): Prisma.DeviceWhereInput {
  const where: Prisma.DeviceWhereInput = {};
  const allowedDeviceIds = filters.allowedDeviceIds || null;

  if (allowedDeviceIds && allowedDeviceIds.length === 0) {
    return { id: '__deny_all__' };
  }

  if (allowedDeviceIds && allowedDeviceIds.length > 0) {
    where.id = { in: allowedDeviceIds };
  }

  if (filters.deviceId) {
    where.id = filters.deviceId;
  }

  const search = filters.search?.trim();
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { location: { contains: search, mode: 'insensitive' } },
      { localIdentifier: { contains: search, mode: 'insensitive' } },
      { serialNumber: { contains: search, mode: 'insensitive' } },
    ];
  }

  return where;
}

function minutesSince(value: Date | null | undefined) {
  if (!value) return null;
  return Math.max(0, Math.round((Date.now() - value.getTime()) / 60000));
}

function hoursSince(value: Date | null | undefined) {
  if (!value) return null;
  return Math.max(0, Math.round((Date.now() - value.getTime()) / 3600000));
}

function buildHealthAssessment(input: {
  deviceStatus: string;
  lastHeartbeat: Date | null;
  lastEventAt: Date | null;
  lastLogAt: Date | null;
  lastSuccessAt: Date | null;
  lastErrorAt: Date | null;
  logs24h: number;
  errors24h: number;
  warnings24h: number;
  success24h: number;
  snapshotFailures24h: number;
  parserFailures24h: number;
  notificationFailures24h: number;
}) {
  const criticalReasons: string[] = [];
  const attentionReasons: string[] = [];
  const idleReasons: string[] = [];

  const heartbeatAgeMinutes = minutesSince(input.lastHeartbeat);
  const eventAgeHours = hoursSince(input.lastEventAt);
  const successAgeHours = hoursSince(input.lastSuccessAt);
  const errorAgeMinutes = minutesSince(input.lastErrorAt);

  if (input.deviceStatus === 'offline') {
    criticalReasons.push('Dispositivo marcado offline pela plataforma');
  }
  if (input.errors24h >= 5) {
    criticalReasons.push(`${input.errors24h} erros nas ultimas 24 horas`);
  }
  if (input.parserFailures24h >= 2) {
    criticalReasons.push('Falhas recorrentes de parser ou normalizacao do webhook');
  }
  if (input.success24h === 0 && input.errors24h >= 3 && (errorAgeMinutes === null || errorAgeMinutes <= 180)) {
    criticalReasons.push('Sem sucesso recente enquanto erros recorrentes seguem ocorrendo');
  }

  if (!criticalReasons.length) {
    if (input.deviceStatus === 'unstable') {
      attentionReasons.push('Dispositivo marcado como instavel');
    }
    if (heartbeatAgeMinutes !== null && heartbeatAgeMinutes > 30 && input.deviceStatus === 'online') {
      attentionReasons.push(`Heartbeat atrasado ha ${heartbeatAgeMinutes} min`);
    }
    if (input.snapshotFailures24h >= 2) {
      attentionReasons.push(`${input.snapshotFailures24h} falhas de snapshot nas ultimas 24 horas`);
    }
    if (input.notificationFailures24h >= 3) {
      attentionReasons.push('Falhas recorrentes no disparo de notificacoes');
    }
    if (input.warnings24h >= 5) {
      attentionReasons.push(`${input.warnings24h} avisos nas ultimas 24 horas`);
    }
    if (input.logs24h > 0 && input.success24h === 0 && successAgeHours !== null && successAgeHours > 24) {
      attentionReasons.push('Sem persistencia bem-sucedida recente apesar de atividade operacional');
    }
  }

  if (!criticalReasons.length && !attentionReasons.length) {
    if (!input.lastLogAt && !input.lastEventAt) {
      idleReasons.push('Sem atividade operacional registrada ainda');
    } else if (input.deviceStatus === 'online' && eventAgeHours !== null && eventAgeHours > 24 && input.logs24h === 0) {
      idleReasons.push(`Sem eventos recentes ha ${eventAgeHours} horas`);
    }
  }

  if (criticalReasons.length) {
    return {
      healthStatus: 'critical' as const,
      healthLabel: HEALTH_LABELS.critical,
      reasons: criticalReasons,
    };
  }

  if (attentionReasons.length) {
    return {
      healthStatus: 'attention' as const,
      healthLabel: HEALTH_LABELS.attention,
      reasons: attentionReasons,
    };
  }

  if (idleReasons.length) {
    return {
      healthStatus: 'idle' as const,
      healthLabel: HEALTH_LABELS.idle,
      reasons: idleReasons,
    };
  }

  return {
    healthStatus: 'healthy' as const,
    healthLabel: HEALTH_LABELS.healthy,
    reasons: ['Fluxo operacional sem anomalias relevantes no momento'],
  };
}

export async function queryOpsLogs(filters: OpsLogFilters) {
  await ensureOpsLogTable();

  const page = Math.max(1, filters.page || 1);
  const limit = Math.max(1, Math.min(filters.limit || 50, 200));
  const offset = (page - 1) * limit;
  const { whereClause, values } = buildWhereClause(filters);

  const countRows = await prisma.$queryRawUnsafe<Array<{ total: bigint | number }>>(
    `SELECT COUNT(*)::bigint AS total FROM device_operational_logs ${whereClause}`,
    ...values,
  );
  const total = Number(countRows[0]?.total || 0);

  const logs = await prisma.$queryRawUnsafe<OpsLogRow[]>(
    `
      SELECT
        id,
        created_at AS "createdAt",
        level,
        source,
        category,
        outcome,
        message,
        request_id AS "requestId",
        correlation_id AS "correlationId",
        integrator_id AS "integratorId",
        school_id AS "schoolId",
        school_unit_id AS "schoolUnitId",
        school_name AS "schoolName",
        device_id AS "deviceId",
        device_name AS "deviceName",
        device_ref AS "deviceRef",
        event_id AS "eventId",
        event_code AS "eventCode",
        transport,
        metadata
      FROM device_operational_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${values.length + 1}
      OFFSET $${values.length + 2}
    `,
    ...values,
    limit,
    offset,
  );

  return {
    logs,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function summarizeOpsLogs(filters: Omit<OpsLogFilters, 'limit' | 'page'>): Promise<OpsLogSummary> {
  await ensureOpsLogTable();
  const { whereClause, values } = buildWhereClause(filters);

  const totalsRows = await prisma.$queryRawUnsafe<Array<{
    total: bigint | number;
    last24h: bigint | number;
    errors24h: bigint | number;
    warnings24h: bigint | number;
  }>>(
    `
      SELECT
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::bigint AS "last24h",
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours' AND level = 'error')::bigint AS "errors24h",
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours' AND level = 'warn')::bigint AS "warnings24h"
      FROM device_operational_logs
      ${whereClause}
    `,
    ...values,
  );

  const bySource = await prisma.$queryRawUnsafe<Array<{ source: string; count: bigint | number }>>(
    `
      SELECT source, COUNT(*)::bigint AS count
      FROM device_operational_logs
      ${whereClause}
      GROUP BY source
      ORDER BY count DESC
      LIMIT 6
    `,
    ...values,
  );

  const byOutcome = await prisma.$queryRawUnsafe<Array<{ outcome: string | null; count: bigint | number }>>(
    `
      SELECT outcome, COUNT(*)::bigint AS count
      FROM device_operational_logs
      ${whereClause}
      GROUP BY outcome
      ORDER BY count DESC
      LIMIT 6
    `,
    ...values,
  );

  const totals = totalsRows[0];
  return {
    total: Number(totals?.total || 0),
    last24h: Number(totals?.last24h || 0),
    errors24h: Number(totals?.errors24h || 0),
    warnings24h: Number(totals?.warnings24h || 0),
    bySource: bySource.map((row) => ({ source: row.source, count: Number(row.count) })),
    byOutcome: byOutcome.map((row) => ({ outcome: row.outcome || 'unspecified', count: Number(row.count) })),
  };
}

export async function getOpsHealthDashboard(filters: OpsHealthFilters): Promise<OpsHealthDashboard> {
  await ensureOpsLogTable();

  const deviceWhere = buildOpsHealthDeviceWhere(filters);
  const devices = await prisma.device.findMany({
    where: deviceWhere,
    select: {
      id: true,
      name: true,
      location: true,
      status: true,
      lastHeartbeat: true,
      lastEventAt: true,
      localIdentifier: true,
      serialNumber: true,
      connectionPolicy: true,
      connectivityMode: true,
      schoolUnit: {
        select: {
          school: {
            select: {
              name: true,
            },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  if (!devices.length) {
    return {
      totals: {
        healthy: 0,
        attention: 0,
        critical: 0,
        idle: 0,
      },
      alerts: [],
      devices: [],
    };
  }

  const deviceIds = devices.map((device) => device.id);
  const aggregateArgs: unknown[] = [];
  const placeholders = deviceIds.map((id) => {
    aggregateArgs.push(id);
    return `$${aggregateArgs.length}`;
  });

  const aggregates = await prisma.$queryRawUnsafe<OpsDeviceAggregateRow[]>(
    `
      SELECT
        device_id AS "deviceId",
        MAX(created_at) AS "lastLogAt",
        MAX(created_at) FILTER (WHERE outcome IN ('event_persisted', 'ping_ok', 'tunnel_auth_ok')) AS "lastSuccessAt",
        MAX(created_at) FILTER (WHERE level = 'error') AS "lastErrorAt",
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::bigint AS "logs24h",
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours' AND level = 'error')::bigint AS "errors24h",
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours' AND level = 'warn')::bigint AS "warnings24h",
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours' AND outcome IN ('event_persisted', 'ping_ok', 'tunnel_auth_ok'))::bigint AS "success24h",
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours' AND outcome IN ('download_failed', 'upload_failed'))::bigint AS "snapshotFailures24h",
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours' AND outcome IN ('normalize_failed', 'parse_failed'))::bigint AS "parserFailures24h",
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours' AND outcome = 'notification_failed')::bigint AS "notificationFailures24h",
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours' AND outcome = 'duplicate_ignored')::bigint AS "duplicates24h"
      FROM device_operational_logs
      WHERE device_id IN (${placeholders.join(', ')})
      GROUP BY device_id
    `,
    ...aggregateArgs,
  );

  const aggregateMap = new Map(aggregates.map((row) => [row.deviceId, row]));

  const deviceHealthRows: OpsDeviceHealthRow[] = devices.map((device) => {
    const aggregate = aggregateMap.get(device.id);
    const base = {
      lastLogAt: aggregate?.lastLogAt || null,
      lastSuccessAt: aggregate?.lastSuccessAt || null,
      lastErrorAt: aggregate?.lastErrorAt || null,
      logs24h: Number(aggregate?.logs24h || 0),
      errors24h: Number(aggregate?.errors24h || 0),
      warnings24h: Number(aggregate?.warnings24h || 0),
      success24h: Number(aggregate?.success24h || 0),
      snapshotFailures24h: Number(aggregate?.snapshotFailures24h || 0),
      parserFailures24h: Number(aggregate?.parserFailures24h || 0),
      notificationFailures24h: Number(aggregate?.notificationFailures24h || 0),
      duplicates24h: Number(aggregate?.duplicates24h || 0),
    };
    const assessment = buildHealthAssessment({
      deviceStatus: device.status,
      lastHeartbeat: device.lastHeartbeat,
      lastEventAt: device.lastEventAt,
      ...base,
    });

    return {
      deviceId: device.id,
      deviceName: device.name,
      deviceRef: device.localIdentifier || device.serialNumber || device.id,
      location: device.location,
      schoolName: device.schoolUnit.school.name,
      deviceStatus: device.status,
      connectionPolicy: device.connectionPolicy,
      connectivityMode: device.connectivityMode,
      lastHeartbeat: device.lastHeartbeat,
      lastEventAt: device.lastEventAt,
      ...base,
      healthStatus: assessment.healthStatus,
      healthLabel: assessment.healthLabel,
      reasons: assessment.reasons,
    };
  });

  deviceHealthRows.sort((left, right) => {
    const healthOrder = HEALTH_SORT_ORDER[left.healthStatus] - HEALTH_SORT_ORDER[right.healthStatus];
    if (healthOrder !== 0) return healthOrder;

    const errorOrder = right.errors24h - left.errors24h;
    if (errorOrder !== 0) return errorOrder;

    const lastLogOrder = (right.lastLogAt?.getTime() || 0) - (left.lastLogAt?.getTime() || 0);
    if (lastLogOrder !== 0) return lastLogOrder;

    return left.deviceName.localeCompare(right.deviceName);
  });

  const totals: Record<OpsHealthStatus, number> = {
    healthy: 0,
    attention: 0,
    critical: 0,
    idle: 0,
  };
  for (const row of deviceHealthRows) {
    totals[row.healthStatus] += 1;
  }

  const alerts: OpsDeviceAlert[] = deviceHealthRows
    .filter((row) => row.healthStatus !== 'healthy')
    .slice(0, 8)
    .map((row) => ({
      severity: row.healthStatus === 'critical'
        ? 'critical'
        : row.healthStatus === 'attention'
          ? 'attention'
          : 'info',
      deviceId: row.deviceId,
      deviceName: row.deviceName,
      schoolName: row.schoolName,
      title: row.healthStatus === 'critical'
        ? `Acao imediata em ${row.deviceName}`
        : row.healthStatus === 'attention'
          ? `Atencao operacional em ${row.deviceName}`
          : `Sem atividade recente em ${row.deviceName}`,
      message: row.reasons[0] || row.healthLabel,
      reasons: row.reasons,
      lastLogAt: row.lastLogAt,
      lastHeartbeat: row.lastHeartbeat,
      lastEventAt: row.lastEventAt,
    }));

  return {
    totals,
    alerts,
    devices: deviceHealthRows,
  };
}
