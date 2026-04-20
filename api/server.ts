import { existsSync } from 'fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { createServer } from 'http';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { fileURLToPath } from 'url';
import { redisGlobal } from './lib/redis';
import { logger } from './lib/logger';
import { getJwtSecret } from './lib/runtimeConfig';
import { autoRegisterPresenceService } from './services/autoRegisterPresenceService';
import authRoutes from './routes/auth';
import registrationRoutes from './routes/registration';
import intelbrasRoutes from './routes/intelbras';
import studentsRoutes from './routes/students';
import guardiansRoutes from './routes/guardians';
import devicesRoutes from './routes/devices';
import eventsRoutes from './routes/events';
import deviceSyncRoutes from './routes/deviceSync';
import edgeRoutes from './routes/edge';
import analyticsRoutes from './routes/analytics';
import schoolUnitsRoutes from './routes/schoolUnits';
import tvPanelRoutes from './routes/tvPanel';
import schoolsRoutes from './routes/schools';
import integratorsRoutes from './routes/integrators';
import notificationsRoutes from './routes/notifications';
import licensesRoutes from './routes/licenses';
import aiRoutes from './routes/ai';
import { initStorage } from './services/storageService';
import { startAnalyticsJobs, startDeviceHealthChecker } from './jobs/scheduler';
import { apiRateLimiter, authRateLimiter, webhookRateLimiter } from './middleware/rateLimiter';
import { prisma } from './prisma';
import intelbrasAutoRegisterRoutes from './routes/intelbrasAutoRegister';
import internalAutoRegisterRoutes from './routes/internalAutoRegister';
import { IntelbrasAutoRegisterService } from './services/intelbrasAutoRegisterService';
import { resolveDeviceForAutoRegister } from './services/autoRegisterDeviceLookup';
import diagnosticsRoutes from './routes/diagnostics';
import auditTrailRoutes from './routes/auditTrail';
import opsLogsRoutes from './routes/opsLogs';
import virtualDevicesRoutes from './routes/virtualDevices';
import profilesRoutes from './routes/profiles';
import platformConfigRoutes from './routes/platformConfig';
import schoolBillingRoutes from './routes/schoolBilling';
import schoolMessagingRoutes from './routes/schoolMessaging';
import { initOpsLogStore } from './services/opsLogService';

const JWT_SECRET = getJwtSecret();
const IS_AUTOREG_GATEWAY = process.env.AUTOREG_GATEWAY_MODE === 'true';
const IS_WORKER = process.env.WORKER_MODE === 'true';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIST_PATH = path.resolve(__dirname, '../dist');
const WEB_INDEX_PATH = path.join(WEB_DIST_PATH, 'index.html');
const HAS_WEB_DIST = existsSync(WEB_INDEX_PATH);

const app = express();

// ═══════════════════════════════════════════════════════════════════════════════
// RAW HTTP HANDLER: Intercept AutoRegister tunnel requests BEFORE Express.
// The Intelbras CGI AutoRegister protocol requires socket hijacking — the device
// opens a POST, receives a 200 OK, then the roles reverse and the server sends
// HTTP requests TO the device over the same TCP socket. Express's HTTP parser
// interferes with this by trying to parse the device's responses as new HTTP
// requests. By intercepting at the http.Server level, Express never touches
// these connections.
// ═══════════════════════════════════════════════════════════════════════════════
const httpServer = createServer((req, res) => {
  if (
    req.method === 'POST' &&
    req.url?.startsWith('/cgi-bin/api/autoRegist/connect')
  ) {
    handleAutoRegistRawConnection(req, res);
    return;
  }
  // Everything else goes through Express normally
  app(req, res);
});

/**
 * Handle Intelbras CGI AutoRegister connection at the raw HTTP level.
 * This runs OUTSIDE of Express — no middleware, no parser interference.
 */
function handleAutoRegistRawConnection(
  req: import('http').IncomingMessage,
  _res: import('http').ServerResponse,
) {
  const socket = req.socket;
  const chunks: Buffer[] = [];

  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', () => {
    // Parse the device's JSON body
    let body: any = {};
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      logger.warn('[AutoRegister] Failed to parse raw body as JSON');
      socket.write('HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n');
      socket.destroy();
      return;
    }

    const { DevClass, DeviceID, ServerIP } = body;
    if (!DeviceID) {
      logger.warn('[AutoRegister] Missing DeviceID in body');
      socket.write('HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n');
      socket.destroy();
      return;
    }

    logger.info('[AutoRegister] Raw TCP connection intercepted before Express', {
      deviceId: DeviceID,
      devClass: DevClass,
    });

    // Detach socket from Node.js HTTP server internals
    // After reading the body via req.on('data'/'end'), the HTTP parser has
    // finished processing this request. We must prevent it from trying to
    // parse the next "request" on this socket (which will actually be the
    // device's response to our login command).
    socket.removeAllListeners('timeout');
    const parser = (socket as any).parser;
    if (parser) {
      // unconsume detaches the C++ parser from the socket's libuv handle
      if (typeof parser.unconsume === 'function') parser.unconsume();
      // close releases parser resources
      if (typeof parser.close === 'function') parser.close();
      (socket as any).parser = null;
    }
    if ((socket as any)._httpMessage) {
      const httpMsg = (socket as any)._httpMessage;
      if (typeof httpMsg.detachSocket === 'function') httpMsg.detachSocket(socket);
      delete (socket as any)._httpMessage;
    }
    (socket as any)._server = null;

    // Configure for long-lived tunnel
    socket.setTimeout(0);
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 10_000);
    socket.resume();

    // Look up device (supports truncated UUIDs from Intelbras firmware)
    resolveDeviceForAutoRegister(DeviceID).then(({ resolvedId }) => {
      const service = IntelbrasAutoRegisterService.getInstance();
      service.handleNewConnection(
        DeviceID,
        DevClass || 'unknown',
        ServerIP || req.socket.remoteAddress || '',
        socket,
        resolvedId || undefined,
      ).catch((err) => {
        logger.error('[AutoRegister] handleNewConnection failed', { error: err.message });
        socket.destroy();
      });
    }).catch((err) => {
      logger.error('[AutoRegister] Device lookup failed', { error: err.message, DeviceID });
      socket.destroy();
    });
  });

  req.on('error', () => {
    socket.destroy();
  });
}

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:4000', 'http://localhost:3000'];

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? ALLOWED_ORIGINS : '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  pingTimeout: 30000,
  pingInterval: 25000,
});

async function setupSocketRedisAdapter() {
  try {
    const pubClient = redisGlobal;
    const subClient = pubClient.duplicate();

    subClient.on('error', () => { /* ignore */ });

    if (pubClient.status !== 'ready') {
      await pubClient.connect();
    }
    if (subClient.status !== 'ready') {
      await subClient.connect();
    }

    io.adapter(createAdapter(pubClient, subClient));
    logger.info('Socket.io Redis adapter connected (multi-replica broadcasting enabled)');
  } catch (err: any) {
    logger.warn('Socket.io Redis adapter failed - running single-instance', { error: err.message });
  }
}

app.set('io', io);
app.set('trust proxy', true);

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? ALLOWED_ORIGINS : true,
  credentials: true,
}));

// ─── Security headers via Helmet ───
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],  // Vite HMR + inline scripts
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'", 'wss:', 'ws:', 'https:'],
      frameSrc: ["'self'"],  // TV Panel pode ser embeddado
    },
  },
  crossOriginEmbedderPolicy: false,  // Allow cross-origin images (S3/MinIO)
}));

// Content-Type injection for /cgi-bin is no longer needed since autoRegist
// connections are now handled at the raw HTTP server level (before Express).

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// ─── P0 FIX: Catch JSON parse errors on the Intelbras webhook path ───
// When express.json() fails (malformed/truncated JSON from device), the error
// handler below intercepts it ONLY for /api/intelbras/* and returns ACK 200
// to prevent the device from entering an infinite retry loop.
app.use('/api/intelbras', (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.type === 'entity.parse.failed') {
    logger.warn('Intelbras webhook: malformed body received, ACK to prevent retry', {
      tenantKey: req.path,
      contentType: req.headers['content-type'],
      bodyPreview: typeof err.body === 'string' ? err.body.slice(0, 120) : '',
    });
    return res.status(200).json({ ok: true, warning: 'parse_failed' });
  }
  next(err);
});

app.use('/cgi-bin', (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.type === 'entity.parse.failed') {
    logger.warn('[AutoRegister] JSON parse failed on cgi-bin. Returning 400 manually.', {
      path: req.path,
      contentType: req.headers['content-type'],
      rawBodyPreview: typeof err.body === 'string' ? err.body.slice(0, 500) : '',
    });
    return res.status(400).json({ error: 'invalid json payload sent by device', raw: err.body });
  }
  next(err);
});

app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] as string || crypto.randomUUID();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
});

app.get('/api/health', async (_req, res) => {
  const checks: Record<string, string> = {
    server: 'ok',
    uptime: `${Math.floor(process.uptime())}s`,
    mode: IS_AUTOREG_GATEWAY ? 'autoreg_gateway' : IS_WORKER ? 'worker' : 'api',
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch {
    checks.database = 'error';
  }

  const isHealthy = checks.database === 'ok';
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'degraded',
    version: '0.3.0',
    timestamp: new Date().toISOString(),
    hostname: process.env.HOSTNAME || 'unknown',
    checks,
  });
});

app.get('/api/ready', (_req, res) => {
  res.status(200).json({ ready: true });
});

// AutoRegister routes are now handled at the raw HTTP server level (before Express)
// to avoid the HTTP parser conflict with the reverse TCP tunnel protocol.
// app.use('/cgi-bin/api/autoRegist', intelbrasAutoRegisterRoutes);

if (IS_AUTOREG_GATEWAY) {
  app.use('/api/internal/autoreg', internalAutoRegisterRoutes);
}

if (!IS_AUTOREG_GATEWAY) {
  app.use('/api/diagnostics', diagnosticsRoutes);
  app.use('/api/auth', authRateLimiter, authRoutes);
  app.use('/api/auth', authRateLimiter, registrationRoutes);
  app.use('/api/intelbras', webhookRateLimiter, intelbrasRoutes);
  app.use('/api/students', apiRateLimiter, studentsRoutes);
  app.use('/api/guardians', apiRateLimiter, guardiansRoutes);
  app.use('/api/devices', apiRateLimiter, devicesRoutes);
  app.use('/api/events', apiRateLimiter, eventsRoutes);
  app.use('/api/device-sync', apiRateLimiter, deviceSyncRoutes);
  app.use('/api/edge', apiRateLimiter, edgeRoutes);
  app.use('/api/analytics', apiRateLimiter, analyticsRoutes);
  app.use('/api/school-units', apiRateLimiter, schoolUnitsRoutes);
  app.use('/api/schools', apiRateLimiter, schoolsRoutes);
  app.use('/api/integrators', apiRateLimiter, integratorsRoutes);
  app.use('/api/notifications', apiRateLimiter, notificationsRoutes);
  app.use('/api/licenses', apiRateLimiter, licensesRoutes);
  app.use('/api/tv', tvPanelRoutes);
  app.use('/api/ai', apiRateLimiter, aiRoutes);
  app.use('/api/audit-trail', apiRateLimiter, auditTrailRoutes);
  app.use('/api/ops-logs', apiRateLimiter, opsLogsRoutes);
  app.use('/api/virtual-devices', apiRateLimiter, virtualDevicesRoutes);
  app.use('/api/profiles', apiRateLimiter, profilesRoutes);
  app.use('/api/admin/platform-config', apiRateLimiter, platformConfigRoutes);
  // School billing sub-routes (merged with schools router by path param)
  app.use('/api/schools/:id', apiRateLimiter, schoolBillingRoutes);
  app.use('/api/schools/:id', apiRateLimiter, schoolMessagingRoutes);
}

if (!IS_AUTOREG_GATEWAY && !IS_WORKER && HAS_WEB_DIST) {
  app.use(express.static(WEB_DIST_PATH, { index: false }));

  app.get('*', (req, res, next) => {
    if (req.method !== 'GET') return next();
    if (
      req.path.startsWith('/api')
      || req.path.startsWith('/socket.io')
      || req.path.startsWith('/cgi-bin')
    ) {
      return next();
    }

    return res.sendFile(WEB_INDEX_PATH);
  });
}

app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    message: process.env.NODE_ENV === 'production'
      ? 'Erro interno do servidor'
      : err.message || 'Internal Server Error',
  });
});

io.use((socket, next) => {
  const token = socket.handshake.auth.token as string;
  if (!token) {
    return next(new Error('Authentication required'));
  }

  if (token.startsWith('tv_')) {
    (socket as any).authType = 'tv_panel';
    (socket as any).tvToken = token;
    return next();
  }

  if (token === 'demo-token') {
    (socket as any).authType = 'demo';
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      profileId: string;
      role: string;
      integratorId: string | null;
      schoolId: string | null;
    };
    (socket as any).user = decoded;
    (socket as any).authType = 'jwt';
    next();
  } catch {
    next(new Error('Invalid or expired token'));
  }
});

io.on('connection', (socket) => {
  const authType = (socket as any).authType;
  const requestedSchoolId = socket.handshake.query.schoolId as string;

  if (authType === 'tv_panel') {
    if (requestedSchoolId) {
      socket.join(`school:${requestedSchoolId}`);
      socket.join(`tv:${requestedSchoolId}`);
    }
    return;
  }

  const user = (socket as any).user;
  if (user?.schoolId) {
    socket.join(`school:${user.schoolId}`);
  }
  if (user?.integratorId) {
    socket.join(`integrator:${user.integratorId}`);
  }
  if (user?.role === 'superadmin') {
    socket.join('platform');
  }

  logger.debug('Socket.io client connected', {
    role: user?.role || 'demo',
    school: user?.schoolId || 'none',
  });

  socket.on('disconnect', () => {
    logger.debug('Socket.io client disconnected');
  });
});

async function bootstrap() {
  if (IS_WORKER) {
    logger.info('Starting in WORKER mode (background jobs only)');
    try {
      await startAnalyticsJobs();
      await startDeviceHealthChecker();

      const { startNotificationWorker } = await import('./workers/notificationWorker');
      startNotificationWorker();

      if (process.env.ENABLE_DIRECT_DEVICE_SYNC === 'true') {
        const { startDeviceSyncWorker } = await import('./workers/deviceSyncWorker');
        startDeviceSyncWorker();
        logger.info('Direct device sync worker started in WORKER mode');
      }

      logger.info('Worker jobs started');
    } catch (err: any) {
      logger.error('Worker startup failed', { error: err.message });
    }
    return;
  }

  await autoRegisterPresenceService.start();

  if (IS_AUTOREG_GATEWAY) {
    logger.info('Starting in AUTOREG_GATEWAY mode');
    return;
  }

  await setupSocketRedisAdapter();

  try {
    await initStorage();

    // Apply lifecycle policy for event photo auto-expiration if configured
    const retentionDays = parseInt(process.env.STORAGE_HISTORY_RETENTION_DAYS || '0', 10);
    if (retentionDays > 0) {
      const { setLifecyclePolicy, BUCKETS } = await import('./services/storageService');
      await setLifecyclePolicy(BUCKETS.HISTORY, retentionDays);
      logger.info(`Storage lifecycle: event photos expire after ${retentionDays} days`);
    }

    logger.info('Storage initialized (Hetzner S3)');
  } catch (err: any) {
    logger.warn('Storage init failed (Hetzner S3 may not be reachable)', { error: err.message });
  }

  try {
    await initOpsLogStore();
    logger.info('Operational log store initialized');
  } catch (err: any) {
    logger.warn('Operational log store init failed', { error: err.message });
  }

  try {
    await startAnalyticsJobs();
    await startDeviceHealthChecker();
    logger.info('Background jobs started');
  } catch (err: any) {
    logger.warn('Job scheduler failed (Redis may not be running)', { error: err.message });
  }

  if (process.env.ENABLE_DIRECT_DEVICE_SYNC === 'true') {
    try {
      const { startDeviceSyncWorker } = await import('./workers/deviceSyncWorker');
      startDeviceSyncWorker();
      logger.info('Direct device sync worker started');
    } catch (err: any) {
      logger.warn('Direct sync worker failed', { error: err.message });
    }
  }

  try {
    const { VirtualDeviceSimulator } = await import('./services/virtualDeviceSimulator');
    await VirtualDeviceSimulator.getInstance().resumeAll();
  } catch (err: any) {
    logger.warn('Virtual simulator resume failed', { error: err.message });
  }
}

let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  logger.info(`Received ${signal} - shutting down gracefully...`);

  httpServer.close(() => {
    logger.info('HTTP server closed');
  });

  io.close(() => {
    logger.info('Socket.io closed');
  });

  await autoRegisterPresenceService.stop().catch(() => undefined);

  try {
    await prisma.$disconnect();
    logger.info('Database disconnected');
  } catch {
    // ignore
  }

  setTimeout(() => {
    logger.warn('Forcing shutdown after timeout');
    process.exit(0);
  }, 10_000);
}

process.on('SIGTERM', () => { void gracefulShutdown('SIGTERM'); });
process.on('SIGINT', () => { void gracefulShutdown('SIGINT'); });

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  logger.info('School Access Platform API v0.3.0 started', {
    port: PORT,
    env: process.env.NODE_ENV || 'development',
    hostname: process.env.HOSTNAME || 'local',
    worker: IS_WORKER,
    autoregGateway: IS_AUTOREG_GATEWAY,
  });

  bootstrap().catch((err) => logger.error('Bootstrap fatal error', { error: err.message }));
});

export { io };
export default app;
