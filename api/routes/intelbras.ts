import express, { Router, Request, Response } from 'express';
import { logger } from '../lib/logger';
import {
  ingestIntelbrasWebhook,
  parseIntelbrasWebhook,
  shouldUseIntelbrasRawBody,
} from '../services/intelbrasEventIngestion';
import { writeOpsLog } from '../services/opsLogService';

const router = Router();
const intelbrasRawParser = express.raw({
  type: (req) => shouldUseIntelbrasRawBody(req.headers),
  limit: process.env.INTELBRAS_WEBHOOK_LIMIT || '25mb',
});

/**
 * POST /api/intelbras/events/:tenantKey
 *
 * Receiver compatible with Intelbras official event push payloads
 * (JSON, multipart form-data and multipart mixed).
 */
router.post('/events/:tenantKey', intelbrasRawParser, async (req: Request, res: Response) => {
  const requestId = typeof req.headers['x-request-id'] === 'string'
    ? req.headers['x-request-id']
    : null;

  let parsed;
  try {
    parsed = parseIntelbrasWebhook(req.body, req.headers['content-type']);
  } catch (err: any) {
    void writeOpsLog({
      level: 'warn',
      source: 'intelbras_webhook',
      category: 'parser',
      outcome: 'parse_failed',
      message: 'Falha ao interpretar payload Intelbras antes do ACK',
      requestId,
      deviceRef: req.params.tenantKey,
      metadata: {
        error: err.message,
        contentType: req.headers['content-type'] || null,
      },
    });
    logger.warn('Intelbras webhook parse failed before ACK', {
      tenantKey: req.params.tenantKey,
      requestId: requestId || undefined,
      error: err.message,
    });
    return res.status(200).end();
  }

  res.status(200).end();

  void ingestIntelbrasWebhook({
    tenantKey: req.params.tenantKey,
    parsed,
    requestId,
    io: req.app.get('io'),
  }).catch((err: any) => {
    void writeOpsLog({
      level: 'error',
      source: 'intelbras_webhook',
      category: 'ingestion',
      outcome: 'background_failed',
      message: 'Falha no processamento assíncrono do webhook Intelbras',
      requestId,
      deviceRef: req.params.tenantKey,
      metadata: {
        error: err.message,
      },
    });
    logger.error('Intelbras webhook background ingestion failed', {
      tenantKey: req.params.tenantKey,
      requestId: requestId || undefined,
      error: err.message,
    });
  });
});

export default router;
