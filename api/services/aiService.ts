import crypto from 'crypto';
import { prisma } from '../prisma';

export type AIProvider = 'gemini' | 'openai';

export interface AIResponse {
  text: string;
  promptTokens: number;
  replyTokens: number;
  cached: boolean;
  latencyMs: number;
}

interface QueryContext {
  integratorId: string;
  schoolId?: string;
  queryType: 'nl_query' | 'report_summary' | 'anomaly_detect' | 'attendance_insight';
  systemPrompt: string;
  userPrompt: string;
  cacheKey?: string;
}

const prismaAI = prisma as typeof prisma & {
  aIConfig: any;
  aIQueryLog: any;
  aIReportCache: any;
};

// ── Resolve config: school override → tenant fallback ────────────────────────
async function resolveConfig(integratorId: string, schoolId?: string) {
  if (schoolId) {
    const schoolCfg = await prismaAI.aIConfig.findUnique({
      where: { integratorId_schoolId: { integratorId, schoolId } },
    });
    if (schoolCfg?.enabled) return schoolCfg;
  }
  // Tenant-wide: schoolId IS NULL
  const tenantCfg = await prismaAI.aIConfig.findFirst({
    where: { integratorId, schoolId: null },
  });
  if (tenantCfg?.enabled) return tenantCfg;
  return null;
}

// ── Gemini call ───────────────────────────────────────────────────────────────
async function callGemini(
  apiKey: string,
  model: string,
  system: string,
  user: string,
): Promise<Omit<AIResponse, 'cached'>> {
  const t0 = Date.now();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini ${res.status}: ${body}`);
  }
  const data = await res.json();
  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const usage = data.usageMetadata ?? {};
  return {
    text,
    promptTokens: usage.promptTokenCount  ?? 0,
    replyTokens:  usage.candidatesTokenCount ?? 0,
    latencyMs:    Date.now() - t0,
  };
}

// ── OpenAI call ───────────────────────────────────────────────────────────────
async function callOpenAI(
  apiKey: string,
  model: string,
  system: string,
  user: string,
): Promise<Omit<AIResponse, 'cached'>> {
  const t0 = Date.now();
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.2,
      max_tokens: 2048,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI ${res.status}: ${body}`);
  }
  const data = await res.json();
  return {
    text:         data.choices[0].message.content ?? '',
    promptTokens: data.usage.prompt_tokens ?? 0,
    replyTokens:  data.usage.completion_tokens ?? 0,
    latencyMs:    Date.now() - t0,
  };
}

// ── LGPD anonymiser — strip all PII before sending to any LLM ─────────────────
const PII_KEYS = ['name', 'email', 'cpf', 'phone', 'address', 'photo', 'base64',
  'guardianname', 'whatsapp', 'enrollment', 'cardno', 'serialnumber'];

export function anonymize(data: unknown): unknown {
  if (Array.isArray(data)) return data.map(anonymize);
  if (data && typeof data === 'object') {
    return Object.fromEntries(
      Object.entries(data as Record<string, unknown>)
        .filter(([k]) => !PII_KEYS.some(p => k.toLowerCase().replace(/_/g, '').includes(p)))
        .map(([k, v]) => [k, anonymize(v)]),
    );
  }
  return data;
}

async function logQuery(
  configId: string, provider: string, model: string,
  queryType: string, pt: number, rt: number, ms: number, cached: boolean, errorCode?: string,
) {
  await prismaAI.aIQueryLog.create({
    data: { aiConfigId: configId, provider, model, queryType, promptTokens: pt, replyTokens: rt, latencyMs: ms, cached, errorCode: errorCode ?? null },
  }).catch(() => {});
}

// ── Main engine ───────────────────────────────────────────────────────────────
export async function queryAI(ctx: QueryContext): Promise<AIResponse> {
  const config = await resolveConfig(ctx.integratorId, ctx.schoolId);
  if (!config) throw new Error('IA não habilitada. Configure a chave API em Configurações de IA.');

  // Quota reset check
  const now = new Date();
  if (config.quotaResetAt && now > config.quotaResetAt) {
    await prismaAI.aIConfig.update({
      where: { id: config.id },
      data: {
        usedTokensMonth: 0,
        quotaResetAt: new Date(now.getFullYear(), now.getMonth() + 1, 1),
      },
    });
    config.usedTokensMonth = 0;
  }
  if (config.usedTokensMonth >= config.monthlyTokenQuota) {
    throw new Error('Quota mensal de tokens atingida. Aguarde o próximo ciclo ou aumente o limite.');
  }

  // Cache lookup
  const cacheKey = ctx.cacheKey
    ?? crypto.createHash('sha256').update(`${config.id}:${ctx.queryType}:${ctx.userPrompt}`).digest('hex');

  if (config.cacheEnabled) {
    const hit = await prismaAI.aIReportCache.findUnique({ where: { cacheKey } });
    if (hit && hit.expiresAt > now) {
      await logQuery(config.id, config.primaryProvider, config.geminiModel, ctx.queryType, 0, 0, 0, true);
      return { text: (hit.payload as any).text, promptTokens: 0, replyTokens: 0, cached: true, latencyMs: 0 };
    }
  }

  // Resolve API key
  const apiKey = config.primaryProvider === 'gemini' ? config.geminiApiKey : config.openaiApiKey;
  if (!apiKey) throw new Error(`Chave API do provedor "${config.primaryProvider}" não configurada.`);

  let raw: Omit<AIResponse, 'cached'>;
  try {
    raw = config.primaryProvider === 'gemini'
      ? await callGemini(apiKey, config.geminiModel, ctx.systemPrompt, ctx.userPrompt)
      : await callOpenAI(apiKey, config.openaiModel, ctx.systemPrompt, ctx.userPrompt);
  } catch (err: any) {
    await logQuery(config.id, config.primaryProvider, config.geminiModel, ctx.queryType, 0, 0, 0, false, err.message?.slice(0, 120));
    throw err;
  }

  const result: AIResponse = { ...raw, cached: false };
  const ttlMs = config.cacheTtlMinutes * 60_000;

  await Promise.all([
    config.cacheEnabled
      ? prismaAI.aIReportCache.upsert({
          where: { cacheKey },
          create: { cacheKey, reportType: ctx.queryType, payload: { text: result.text }, expiresAt: new Date(now.getTime() + ttlMs) },
          update: { payload: { text: result.text }, expiresAt: new Date(now.getTime() + ttlMs) },
        })
      : Promise.resolve(),
    prismaAI.aIConfig.update({
      where: { id: config.id },
      data: { usedTokensMonth: { increment: result.promptTokens + result.replyTokens } },
    }),
    logQuery(config.id, config.primaryProvider, config.geminiModel, ctx.queryType, result.promptTokens, result.replyTokens, result.latencyMs, false),
  ]);

  return result;
}

// ── Cache maintenance (call from scheduler) ───────────────────────────────────
export async function cleanExpiredAICache(): Promise<number> {
  const { count } = await prismaAI.aIReportCache.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return count;
}
