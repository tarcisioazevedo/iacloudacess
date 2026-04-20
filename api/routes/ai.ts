// @ts-nocheck
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { queryAI, anonymize } from '../services/aiService';
import {
  SYSTEM_ANALYTICS, SYSTEM_NL_QUERY,
  promptAttendanceInsight, promptPeriodSummary,
  promptAnomalyDetect, promptComparativePeriod, promptNLAnswer,
} from '../services/aiPrompts';

const router = Router();
router.use(requireAuth);

const GEMINI_MODELS = [
  'gemini-2.5-pro-preview-05-06',
  'gemini-2.5-flash-preview-04-17',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
];
const OPENAI_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo'];

// ── Helper: get integratorId for current user ─────────────────────────────────
function getIntegratorId(req: Request): string | null {
  const u = req.user!;
  if (u.role === 'superadmin') return req.body?.integratorId ?? req.query?.integratorId ?? null;
  return u.integratorId ?? null;
}

// ── GET /api/ai/config — tenant config + list of school overrides ─────────────
router.get('/config', async (req: Request, res: Response) => {
  try {
    const integratorId = getIntegratorId(req);
    if (!integratorId) return res.status(400).json({ message: 'integratorId obrigatório' });

    const configs = await prisma.aIConfig.findMany({
      where: { integratorId },
      select: {
        id: true, schoolId: true, primaryProvider: true,
        geminiModel: true, openaiModel: true, enabled: true,
        monthlyTokenQuota: true, usedTokensMonth: true, quotaResetAt: true,
        cacheEnabled: true, cacheTtlMinutes: true,
        geminiApiKey: true, openaiApiKey: true,
      },
      orderBy: [{ schoolId: 'asc' }],
    });

    // Mask keys — only expose whether key is set, not the value
    const masked = configs.map(c => ({
      ...c,
      geminiApiKey:  c.geminiApiKey  ? `****${c.geminiApiKey.slice(-4)}`  : null,
      openaiApiKey:  c.openaiApiKey  ? `****${c.openaiApiKey.slice(-4)}`  : null,
      hasGeminiKey:  !!c.geminiApiKey,
      hasOpenaiKey:  !!c.openaiApiKey,
      scope:         c.schoolId ? 'school' : 'tenant',
    }));

    const tenantConfig  = masked.find(c => !c.schoolId) ?? null;
    const schoolConfigs = masked.filter(c => !!c.schoolId);

    return res.json({ tenantConfig, schoolConfigs });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/ai/config — upsert tenant-wide config ───────────────────────────
router.put('/config', async (req: Request, res: Response) => {
  try {
    const integratorId = getIntegratorId(req);
    if (!integratorId) return res.status(400).json({ message: 'integratorId obrigatório' });

    const {
      enabled, primaryProvider, geminiApiKey, openaiApiKey,
      geminiModel, openaiModel, monthlyTokenQuota, cacheEnabled, cacheTtlMinutes,
    } = req.body;

    if (primaryProvider && !['gemini', 'openai'].includes(primaryProvider)) {
      return res.status(400).json({ message: 'primaryProvider deve ser "gemini" ou "openai"' });
    }
    if (geminiModel && !GEMINI_MODELS.includes(geminiModel)) {
      return res.status(400).json({ message: `Modelo Gemini inválido. Use: ${GEMINI_MODELS.join(', ')}` });
    }
    if (openaiModel && !OPENAI_MODELS.includes(openaiModel)) {
      return res.status(400).json({ message: `Modelo OpenAI inválido. Use: ${OPENAI_MODELS.join(', ')}` });
    }

    const now = new Date();
    // First day of next month — used as initial quota reset date on creation
    const nextMonthReset = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const data: Record<string, unknown> = { updatedAt: now };
    if (enabled          !== undefined) data.enabled          = enabled;
    if (primaryProvider  !== undefined) data.primaryProvider  = primaryProvider;
    if (geminiApiKey     !== undefined) data.geminiApiKey     = geminiApiKey || null;
    if (openaiApiKey     !== undefined) data.openaiApiKey     = openaiApiKey || null;
    if (geminiModel      !== undefined) data.geminiModel      = geminiModel;
    if (openaiModel      !== undefined) data.openaiModel      = openaiModel;
    if (monthlyTokenQuota !== undefined) data.monthlyTokenQuota = Number(monthlyTokenQuota);
    if (cacheEnabled     !== undefined) data.cacheEnabled     = cacheEnabled;
    if (cacheTtlMinutes  !== undefined) data.cacheTtlMinutes  = Number(cacheTtlMinutes);

    const config = await prisma.aIConfig.upsert({
      where: { integratorId_schoolId: { integratorId, schoolId: null as any } },
      create: { integratorId, schoolId: null, quotaResetAt: nextMonthReset, ...data },
      update: data,
    });

    return res.json({ config: { id: config.id, enabled: config.enabled, scope: 'tenant' } });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/ai/config/schools/:schoolId — upsert school override ─────────────
router.put('/config/schools/:schoolId', async (req: Request, res: Response) => {
  try {
    const integratorId = getIntegratorId(req);
    if (!integratorId) return res.status(400).json({ message: 'integratorId obrigatório' });

    const { schoolId } = req.params;

    // Validate school belongs to integrator
    const school = await prisma.school.findFirst({
      where: { id: schoolId, integratorId },
      select: { id: true, name: true },
    });
    if (!school) return res.status(404).json({ message: 'Escola não encontrada' });

    const {
      enabled, primaryProvider, geminiApiKey, openaiApiKey,
      geminiModel, openaiModel, monthlyTokenQuota, cacheEnabled, cacheTtlMinutes,
    } = req.body;

    const now2 = new Date();
    const nextMonthReset2 = new Date(now2.getFullYear(), now2.getMonth() + 1, 1);

    const data: Record<string, unknown> = { updatedAt: now2 };
    if (enabled          !== undefined) data.enabled          = enabled;
    if (primaryProvider  !== undefined) data.primaryProvider  = primaryProvider;
    if (geminiApiKey     !== undefined) data.geminiApiKey     = geminiApiKey || null;
    if (openaiApiKey     !== undefined) data.openaiApiKey     = openaiApiKey || null;
    if (geminiModel      !== undefined) data.geminiModel      = geminiModel;
    if (openaiModel      !== undefined) data.openaiModel      = openaiModel;
    if (monthlyTokenQuota !== undefined) data.monthlyTokenQuota = Number(monthlyTokenQuota);
    if (cacheEnabled     !== undefined) data.cacheEnabled     = cacheEnabled;
    if (cacheTtlMinutes  !== undefined) data.cacheTtlMinutes  = Number(cacheTtlMinutes);

    const config = await prisma.aIConfig.upsert({
      where: { integratorId_schoolId: { integratorId, schoolId } },
      create: { integratorId, schoolId, quotaResetAt: nextMonthReset2, ...data },
      update: data,
    });

    return res.json({ config: { id: config.id, enabled: config.enabled, schoolId, schoolName: school.name, scope: 'school' } });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ── DELETE /api/ai/config/schools/:schoolId — remove school override ──────────
router.delete('/config/schools/:schoolId', async (req: Request, res: Response) => {
  try {
    const integratorId = getIntegratorId(req);
    if (!integratorId) return res.status(400).json({ message: 'integratorId obrigatório' });

    const { schoolId } = req.params;
    const cfg = await prisma.aIConfig.findUnique({
      where: { integratorId_schoolId: { integratorId, schoolId } },
    });
    if (!cfg) return res.status(404).json({ message: 'Override não encontrado' });

    await prisma.aIConfig.delete({ where: { id: cfg.id } });
    return res.json({ message: 'Override removido. A escola usará a configuração do tenant.' });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ── GET /api/ai/usage — token usage summary ──────────────────────────────────
router.get('/usage', async (req: Request, res: Response) => {
  try {
    const integratorId = getIntegratorId(req);
    if (!integratorId) return res.status(400).json({ message: 'integratorId obrigatório' });

    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const [configs, recentLogs] = await Promise.all([
      prisma.aIConfig.findMany({
        where: { integratorId },
        select: { id: true, schoolId: true, monthlyTokenQuota: true, usedTokensMonth: true, quotaResetAt: true, enabled: true },
      }),
      prisma.aIQueryLog.findMany({
        where: { aiConfig: { integratorId }, createdAt: { gte: monthStart } },
        select: { queryType: true, promptTokens: true, replyTokens: true, latencyMs: true, cached: true, createdAt: true, provider: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    const totalTokens = recentLogs.reduce((s, l) => s + l.promptTokens + l.replyTokens, 0);
    const cachedCount = recentLogs.filter(l => l.cached).length;

    return res.json({
      configs,
      totalTokensMonth: totalTokens,
      cachedRequests:   cachedCount,
      totalRequests:    recentLogs.length,
      recentLogs,
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ── POST /api/ai/query — natural language question ───────────────────────────
router.post('/query', async (req: Request, res: Response) => {
  try {
    const integratorId = getIntegratorId(req);
    if (!integratorId) return res.status(400).json({ message: 'integratorId obrigatório' });

    const { question, context, schoolId } = req.body;
    if (!question?.trim()) return res.status(400).json({ message: '"question" obrigatório' });

    const result = await queryAI({
      integratorId,
      schoolId: schoolId ?? req.user!.schoolId ?? undefined,
      queryType: 'nl_query',
      systemPrompt: SYSTEM_NL_QUERY,
      userPrompt: promptNLAnswer(question, anonymize(context ?? {})),
    });

    return res.json(result);
  } catch (err: any) {
    const status = err.message?.includes('Quota') ? 429 : err.message?.includes('não habilitada') ? 403 : 500;
    return res.status(status).json({ message: err.message });
  }
});

// ── POST /api/ai/reports/attendance — attendance insight ─────────────────────
router.post('/reports/attendance', async (req: Request, res: Response) => {
  try {
    const integratorId = getIntegratorId(req);
    if (!integratorId) return res.status(400).json({ message: 'integratorId obrigatório' });

    const { schoolId, period = 'week', startDate, endDate } = req.body;
    const resolvedSchoolId = schoolId ?? req.user!.schoolId;
    if (!resolvedSchoolId) return res.status(400).json({ message: '"schoolId" obrigatório' });

    const since = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 86_400_000);
    const until = endDate   ? new Date(endDate)   : new Date();

    const [school, daily] = await Promise.all([
      prisma.school.findFirst({ where: { id: resolvedSchoolId, integratorId }, select: { name: true } }),
      prisma.analyticsDaily.findMany({
        where: { schoolId: resolvedSchoolId, reportDate: { gte: since, lte: until } },
        orderBy: { reportDate: 'asc' },
        select: { reportDate: true, totalEntries: true, totalExits: true, uniqueStudents: true, totalDenied: true, attendanceRate: true, peakHour: true },
      }),
    ]);
    if (!school) return res.status(404).json({ message: 'Escola não encontrada' });

    const cacheKey = crypto.createHash('sha256')
      .update(`attendance:${resolvedSchoolId}:${since.toISOString()}:${until.toISOString()}`)
      .digest('hex');

    const result = await queryAI({
      integratorId,
      schoolId: resolvedSchoolId,
      queryType: 'attendance_insight',
      systemPrompt: SYSTEM_ANALYTICS,
      userPrompt: promptAttendanceInsight(anonymize({ daily, period, totalDays: daily.length }), period, school.name),
      cacheKey,
    });

    return res.json(result);
  } catch (err: any) {
    const status = err.message?.includes('Quota') ? 429 : err.message?.includes('não habilitada') ? 403 : 500;
    return res.status(status).json({ message: err.message });
  }
});

// ── GET /api/ai/reports/summary/:period — executive summary ──────────────────
router.get('/reports/summary/:period', async (req: Request, res: Response) => {
  try {
    const integratorId = getIntegratorId(req);
    if (!integratorId) return res.status(400).json({ message: 'integratorId obrigatório' });

    const { period } = req.params;
    const { schoolId } = req.query as { schoolId?: string };
    const resolvedSchoolId = schoolId ?? (req.user!.role === 'school_admin' ? req.user!.schoolId : undefined);

    const dayMap: Record<string, number> = { today: 1, week: 7, month: 30, quarter: 90 };
    const days = dayMap[period] ?? 7;
    const since = new Date(Date.now() - days * 86_400_000);

    const where: any = { reportDate: { gte: since } };
    if (resolvedSchoolId) where.schoolId = resolvedSchoolId;
    else where.school = { integratorId };

    const daily = await prisma.analyticsDaily.findMany({
      where,
      select: { reportDate: true, totalEntries: true, totalExits: true, uniqueStudents: true, totalDenied: true, attendanceRate: true, peakHour: true },
      orderBy: { reportDate: 'asc' },
    });

    const cacheKey = crypto.createHash('sha256')
      .update(`summary:${integratorId}:${resolvedSchoolId ?? 'all'}:${period}:${since.toDateString()}`)
      .digest('hex');

    const result = await queryAI({
      integratorId,
      schoolId: resolvedSchoolId ?? undefined,
      queryType: 'report_summary',
      systemPrompt: SYSTEM_ANALYTICS,
      userPrompt: promptPeriodSummary(anonymize({ daily, period, days }), period),
      cacheKey,
    });

    return res.json(result);
  } catch (err: any) {
    const status = err.message?.includes('Quota') ? 429 : err.message?.includes('não habilitada') ? 403 : 500;
    return res.status(status).json({ message: err.message });
  }
});

// ── POST /api/ai/reports/anomalies — anomaly detection ───────────────────────
router.post('/reports/anomalies', async (req: Request, res: Response) => {
  try {
    const integratorId = getIntegratorId(req);
    if (!integratorId) return res.status(400).json({ message: 'integratorId obrigatório' });

    const { schoolId, days = 30 } = req.body;
    const resolvedSchoolId = schoolId ?? req.user!.schoolId;
    if (!resolvedSchoolId) return res.status(400).json({ message: '"schoolId" obrigatório' });

    const since = new Date(Date.now() - Number(days) * 86_400_000);

    const [hourly, daily] = await Promise.all([
      prisma.analyticsHourly.findMany({
        where: { schoolId: resolvedSchoolId, bucketHour: { gte: since } },
        select: { bucketHour: true, entryEvents: true, exitEvents: true, deniedEvents: true, uniqueStudents: true },
        orderBy: { bucketHour: 'asc' },
      }),
      prisma.analyticsDaily.findMany({
        where: { schoolId: resolvedSchoolId, reportDate: { gte: since } },
        select: { reportDate: true, totalEntries: true, totalDenied: true, attendanceRate: true, peakHour: true },
        orderBy: { reportDate: 'asc' },
      }),
    ]);

    const result = await queryAI({
      integratorId,
      schoolId: resolvedSchoolId,
      queryType: 'anomaly_detect',
      systemPrompt: SYSTEM_ANALYTICS,
      userPrompt: promptAnomalyDetect(anonymize({ hourly, daily, days })),
    });

    let anomalies: any[] = [];
    try {
      const parsed = JSON.parse(result.text);
      anomalies = parsed.anomalies ?? [];
    } catch {
      anomalies = [];
    }

    return res.json({ ...result, anomalies });
  } catch (err: any) {
    const status = err.message?.includes('Quota') ? 429 : err.message?.includes('não habilitada') ? 403 : 500;
    return res.status(status).json({ message: err.message });
  }
});

// ── POST /api/ai/reports/compare — comparative period ────────────────────────
router.post('/reports/compare', async (req: Request, res: Response) => {
  try {
    const integratorId = getIntegratorId(req);
    if (!integratorId) return res.status(400).json({ message: 'integratorId obrigatório' });

    const { schoolId, currentStart, currentEnd, previousStart, previousEnd, period = 'custom' } = req.body;
    const resolvedSchoolId = schoolId ?? req.user!.schoolId;
    if (!resolvedSchoolId || !currentStart || !currentEnd || !previousStart || !previousEnd) {
      return res.status(400).json({ message: 'Campos obrigatórios: schoolId, currentStart, currentEnd, previousStart, previousEnd' });
    }

    const [current, previous] = await Promise.all([
      prisma.analyticsDaily.findMany({
        where: { schoolId: resolvedSchoolId, reportDate: { gte: new Date(currentStart), lte: new Date(currentEnd) } },
        select: { reportDate: true, totalEntries: true, totalExits: true, uniqueStudents: true, totalDenied: true, attendanceRate: true },
        orderBy: { reportDate: 'asc' },
      }),
      prisma.analyticsDaily.findMany({
        where: { schoolId: resolvedSchoolId, reportDate: { gte: new Date(previousStart), lte: new Date(previousEnd) } },
        select: { reportDate: true, totalEntries: true, totalExits: true, uniqueStudents: true, totalDenied: true, attendanceRate: true },
        orderBy: { reportDate: 'asc' },
      }),
    ]);

    const cacheKey = crypto.createHash('sha256')
      .update(`compare:${resolvedSchoolId}:${currentStart}:${currentEnd}:${previousStart}:${previousEnd}`)
      .digest('hex');

    const result = await queryAI({
      integratorId,
      schoolId: resolvedSchoolId,
      queryType: 'report_summary',
      systemPrompt: SYSTEM_ANALYTICS,
      userPrompt: promptComparativePeriod(anonymize({ daily: current }), anonymize({ daily: previous }), period),
      cacheKey,
    });

    return res.json(result);
  } catch (err: any) {
    const status = err.message?.includes('Quota') ? 429 : err.message?.includes('não habilitada') ? 403 : 500;
    return res.status(status).json({ message: err.message });
  }
});

// ── GET /api/ai/models — list available models ────────────────────────────────
router.get('/models', (_req: Request, res: Response) => {
  return res.json({ gemini: GEMINI_MODELS, openai: OPENAI_MODELS });
});

export default router;
