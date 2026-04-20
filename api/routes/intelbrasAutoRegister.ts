import { Router, Request, Response } from 'express';
import { IntelbrasAutoRegisterService } from '../services/intelbrasAutoRegisterService';
import {
  autoRegisterRateLimit,
  autoRegisterConnectionLimit,
  autoRegisterAllowlist,
} from '../middleware/autoRegisterSecurity';

const router = Router();

router.use(autoRegisterRateLimit);
router.use(autoRegisterConnectionLimit);

// POST /cgi-bin/api/autoRegist/connect
// Intelbras CGI AutoRegister reverse tunnel protocol.
//
// Protocol flow (from official Intelbras docs):
//   1. Device → Server: POST /connect (body: {DevClass, DeviceID, ServerIP})
//   2. Server → Device: HTTP/1.1 200 OK (acknowledge)
//   3. Server → Device: POST /login (empty body, login challenge)
//   4. Device → Server: HTTP 401 + WWW-Authenticate Digest
//   5. Server → Device: POST /login + Authorization Digest
//   6. Device → Server: HTTP 200 + Token
//   7. Server → Device: POST /keep-alive (every 20s with X-cgi-token)
//
// CRITICAL: After step 2, the socket roles reverse — the server becomes the
// HTTP client sending requests TO the device. Node.js HTTP server must be fully
// detached from the socket before step 3, otherwise its parser will intercept
// the device's 401 response (step 4), misinterpret it as a new HTTP request,
// and close the socket.
router.post('/connect', autoRegisterAllowlist, (req: Request, _res: Response) => {
  const { DevClass, DeviceID, ServerIP } = req.body;
  const resolvedDeviceId = (req as any).resolvedDeviceId as string | undefined;
  const socket = req.socket;

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: Fully detach socket from Node.js HTTP server BEFORE any writes.
  // This ensures the HTTP parser won't intercept the device's future responses
  // (401, 200+Token, keepalive ACKs) and misparse them as new HTTP requests.
  // ═══════════════════════════════════════════════════════════════════════════

  // Remove HTTP server listeners (but NOT internal stream mechanics)
  // We must NOT call removeAllListeners() as it breaks the socket's read pipeline.
  // We must NOT call parser.close() as it unregisters the libuv read handler.
  // Instead, surgically remove only what the HTTP server added.
  socket.removeAllListeners('timeout');
  socket.removeAllListeners('close');
  socket.removeAllListeners('error');
  socket.removeAllListeners('drain');

  // Null out the HTTP parser reference so it won't process future data.
  // IMPORTANT: Do NOT call parser.close() — it unregisters the native read handler
  // and the socket can never receive data again.
  if ((socket as any).parser) {
    (socket as any).parser = null;
  }

  // Unlink socket from Express's response object
  if ((socket as any)._httpMessage) {
    const httpMsg = (socket as any)._httpMessage;
    if (typeof httpMsg.detachSocket === 'function') {
      httpMsg.detachSocket(socket);
    }
    delete (socket as any)._httpMessage;
  }

  // Remove server reference so HTTP server won't track this socket
  (socket as any)._server = null;

  // Configure socket for long-lived tunnel
  socket.setTimeout(0);
  socket.setNoDelay(true);
  socket.setKeepAlive(true, 10_000);

  // Force socket into flowing mode so data events fire for new listeners
  socket.resume();

  // Re-attach minimal error handling
  socket.on('error', (err) => {
    console.error(`[AutoRegister] Socket error for ${DeviceID}:`, err.message);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: Hand off to the AutoRegister service.
  // The service will:
  //   a) Write HTTP 200 OK to socket (acknowledge connection per protocol docs)
  //   b) Set up data/close/error listeners
  //   c) Perform Digest login over the reverse tunnel
  //   d) Start keep-alive interval
  // ═══════════════════════════════════════════════════════════════════════════

  const authTimeout = setTimeout(() => {
    const service = IntelbrasAutoRegisterService.getInstance();
    if (!service.hasLocalDevice(DeviceID)) {
      console.warn(`[AutoRegister] Auth timeout for ${DeviceID} - dropping socket`);
      socket.destroy();
    }
  }, 15_000);

  const service = IntelbrasAutoRegisterService.getInstance();
  service.handleNewConnection(
    DeviceID,
    DevClass || 'unknown',
    ServerIP || req.ip || '',
    socket,
    resolvedDeviceId,
  )
    .then(() => clearTimeout(authTimeout))
    .catch(() => {
      clearTimeout(authTimeout);
      socket.destroy();
    });
});

export default router;
