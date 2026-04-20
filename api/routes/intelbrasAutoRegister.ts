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
// IMPORTANT: The device does NOT expect an HTTP response to this POST.
// After sending the POST, it waits for the server to send commands (login, etc.)
// directly over the same TCP socket. Sending an HTTP 200 will cause the device
// to close the connection immediately.
router.post('/connect', autoRegisterAllowlist, (req: Request, _res: Response) => {
  const { DevClass, DeviceID, ServerIP } = req.body;
  const resolvedDeviceId = (req as any).resolvedDeviceId as string | undefined;
  const socket = req.socket;

  // ─── CRITICAL: Detach socket from Node.js HTTP server ───
  // We must prevent the HTTP server from:
  // 1. Sending any HTTP response (device doesn't expect one)
  // 2. Parsing future data on this socket as HTTP requests
  // 3. Applying timeouts
  socket.removeAllListeners('timeout');
  socket.removeAllListeners('data');   // Remove HTTP parser's data listener
  socket.removeAllListeners('end');    // Remove HTTP parser's end listener

  // Nullify HTTP server references to fully detach socket
  if ((socket as any).parser) {
    (socket as any).parser.close?.();
    (socket as any).parser = null;
  }
  if ((socket as any)._httpMessage) {
    (socket as any)._httpMessage.detachSocket?.(socket);
    delete (socket as any)._httpMessage;
  }
  (socket as any)._server = null;

  socket.setTimeout(0);
  socket.setKeepAlive(true, 10_000);

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
