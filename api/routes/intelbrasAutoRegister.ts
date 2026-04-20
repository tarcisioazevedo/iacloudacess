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

  // Remove HTTP server listeners
  socket.removeAllListeners('timeout');
  socket.removeAllListeners('close');
  socket.removeAllListeners('error');
  socket.removeAllListeners('drain');
  socket.removeAllListeners('data');
  socket.removeAllListeners('end');

  // Detach the C++ HTTP parser from the socket's native handle.
  // parser.unconsume() is the CORRECT Node.js API for this:
  // - It calls stream_ = nullptr at the C++ level (detaches from libuv handle)
  // - It pushes any buffered data back to the stream
  // - It does NOT destroy the socket's read mechanism (unlike parser.close())
  const parser = (socket as any).parser;
  if (parser) {
    if (typeof parser.unconsume === 'function') {
      parser.unconsume();
    }
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
