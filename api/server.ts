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
import schoolClassesRoutes from './routes/schoolClasses';
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
import schoolCalendarRoutes from './routes/schoolCalendar';
import broadcastsRoutes from './routes/broadcasts';
import { initOpsLogStore } from './services/opsLogService';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

const JWT_SECRET = getJwtSecret();
const IS_AUTOREG_GATEWAY = process.env.AUTOREG_GATEWAY_MODE === 'true';
const IS_WORKER = process.env.WORKER_MODE === 'true';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIST_PATH = path.resolve(__dirname, '../dist');
const WEB_INDEX_PATH = path.join(WEB_DIST_PATH, 'index.html');
const HAS_WEB_DIST = existsSync(WEB_INDEX_PATH);

const app = express();
const httpServer = createServer(app);

// ═══════════════════════════════════════════════════════════════════════════════
// INTELBRAS CGI AUTO-REGISTER: Raw TCP Server on port 7010
//
// The Intelbras CGI AutoRegister protocol is a REVERSE TUNNEL protocol:
//   1. Device → Server: POST /connect (body: {DevClass, DeviceID, ServerIP})
//   2. Server → Device: HTTP 200 OK
//   3. Server → Device: POST /login (the server acts as HTTP CLIENT)
//   4. Device → Server: HTTP 401 + Digest challenge
//   5. Server → Device: POST /login + Digest auth
//   6. Device → Server: HTTP 200 + Token
//   7. Server → Device: POST /keep-alive every 20s
//
// This protocol CANNOT go through an HTTP reverse proxy (Traefik) because
// after step 2, the roles reverse — the server sends HTTP requests TO the
// device through the SAME TCP socket. An L7 proxy would intercept these
// and break the tunnel.
//
// Solution: Raw TCP server (net.Server) on a dedicated port, exposed directly
// to the internet without any HTTP proxy. The server manually parses the
// incoming HTTP POST request from the device.
// ═══════════════════════════════════════════════════════════════════════════════
import { createServer as createTcpServer, Socket as NetSocket } from 'net';

const AUTOREG_TCP_PORT = parseInt(process.env.AUTOREG_TCP_PORT || '7010', 10);

const autoregTcpServer = createTcpServer((socket: NetSocket) => {
  logger.info('[AutoRegister TCP] New raw TCP connection', {
    remoteAddress: socket.remoteAddress,
    remotePort: socket.remotePort,
  });

  // Configure socket
  socket.setTimeout(30_000); // 30s to receive the initial POST
  socket.setNoDelay(true);
  socket.setKeepAlive(true, 10_000);

  let buffer = Buffer.alloc(0);
  let headersParsed = false;

  const onData = (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);

    if (!headersParsed) {
      // Look for the end of HTTP headers (\r\n\r\n)
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) {
        // Haven't received full headers yet, keep buffering
        if (buffer.length > 8192) {
          // Headers too large, reject
          logger.warn('[AutoRegister TCP] Headers too large, dropping connection');
          socket.destroy();
        }
        return;
      }

      headersParsed = true;
      const headersStr = buffer.subarray(0, headerEnd).toString('utf8');
      const bodyStart = headerEnd + 4;

      // Parse Content-Length from headers
      const clMatch = headersStr.match(/content-length:\s*(\d+)/i);
      const contentLength = clMatch ? parseInt(clMatch[1], 10) : 0;

      // Check we have the full body
      const bodyReceived = buffer.length - bodyStart;
      if (bodyReceived < contentLength) {
        // Wait for more data
        return;
      }

      // We have the full HTTP request — parse the body
      const bodyBuf = buffer.subarray(bodyStart, bodyStart + contentLength);
      let body: any = {};
      try {
        body = JSON.parse(bodyBuf.toString('utf8'));
      } catch {
        logger.warn('[AutoRegister TCP] Failed to parse JSON body');
        socket.write('HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n');
        socket.destroy();
        return;
      }

      const { DevClass, DeviceID, ServerIP } = body;
      if (!DeviceID) {
        logger.warn('[AutoRegister TCP] Missing DeviceID');
        socket.write('HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n');
        socket.destroy();
        return;
      }

      logger.info('[AutoRegister TCP] Device connected via raw TCP tunnel', {
        deviceId: DeviceID,
        devClass: DevClass,
        serverIp: ServerIP,
        remoteAddress: socket.remoteAddress,
      });

      // Remove our temporary data/timeout handlers — the tunnel service
      // will set up its own listeners
      socket.removeListener('data', onData);
      socket.removeListener('timeout', onTimeout);
      socket.removeListener('error', onError);
      socket.setTimeout(0); // Disable timeout for long-lived tunnel

      // Look up device and hand off to tunnel service
      resolveDeviceForAutoRegister(DeviceID).then((result) => {
        const service = IntelbrasAutoRegisterService.getInstance();
        service.handleNewConnection(
          DeviceID,
          DevClass || 'unknown',
          ServerIP || socket.remoteAddress || '',
          socket,
          result.device?.id,
        ).catch((err) => {
          logger.error('[AutoRegister TCP] handleNewConnection failed', { error: err.message });
          socket.destroy();
        });
      }).catch((err) => {
        logger.error('[AutoRegister TCP] Device lookup failed', { error: err.message, DeviceID });
        socket.destroy();
      });
    }
  };

  const onTimeout = () => {
    logger.warn('[AutoRegister TCP] Connection timeout waiting for HTTP request');
    socket.destroy();
  };

  const onError = (err: Error) => {
    logger.warn('[AutoRegister TCP] Socket error during handshake', { error: err.message });
    socket.destroy();
  };

  socket.on('data', onData);
  socket.on('timeout', onTimeout);
  socket.on('error', onError);
  socket.on('close', () => {
    socket.removeListener('data', onData);
  });
});

// Start TCP server alongside HTTP server (done in the listen section below)


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
      // await pubClient.connect();
    }
    if (subClient.status !== 'ready') {
      // await subClient.connect();
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

  try {
    await redisGlobal.ping();
    checks.redis = 'ok';
  } catch {
    checks.redis = 'error';
  }

  try {
    const { minio } = await import('./services/storageService');
    await minio.listBuckets();
    checks.storage = 'ok';
  } catch {
    checks.storage = 'error';
  }

  const isHealthy = checks.database === 'ok' && checks.redis === 'ok';
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
  app.use('/api/school-classes', apiRateLimiter, schoolClassesRoutes);
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
  app.use('/api/schools/:id', apiRateLimiter, schoolCalendarRoutes);
  app.use('/api/schools/:id', apiRateLimiter, broadcastsRoutes);

  // ── Bull Board: BullMQ queue dashboard (superadmin only) ────────────
  try {
    const { notificationQueue } = await import('./services/n8nTrigger');
    const { deviceSyncQueue } = await import('./services/deviceSyncQueue');
    const bullBoardAdapter = new ExpressAdapter();
    bullBoardAdapter.setBasePath('/api/admin/queues');
    createBullBoard({
      queues: [
        new BullMQAdapter(notificationQueue),
        new BullMQAdapter(deviceSyncQueue),
        new BullMQAdapter((await import('./workers/broadcastWorker')).broadcastQueue),
      ],
      serverAdapter: bullBoardAdapter,
    });
    app.use('/api/admin/queues', requireAuth, requireRole('superadmin'), bullBoardAdapter.getRouter());
    logger.info('Bull Board dashboard mounted at /api/admin/queues');
  } catch (err: any) {
    logger.warn('Bull Board setup failed', { error: err.message });
  }
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
    if (process.env.NODE_ENV === 'production') {
      return next(new Error('Demo mode is not available in production'));
    }
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
    const retentionDays = parseInt(process.env.STORAGE_HISTORY_RETENTION_DAYS || '90', 10);
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

  // Start raw TCP server for Intelbras CGI AutoRegister reverse tunnel
  if (IS_AUTOREG_GATEWAY) {
    autoregTcpServer.listen(AUTOREG_TCP_PORT, () => {
      logger.info(`[AutoRegister TCP] Raw TCP tunnel server listening on port ${AUTOREG_TCP_PORT}`);
    });
  }

  bootstrap().catch((err) => logger.error('Bootstrap fatal error', { error: err.message }));
});

export { io };
export default app;
