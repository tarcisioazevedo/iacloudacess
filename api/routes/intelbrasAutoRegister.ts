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
// Intelbras devices on firmware 20251201+ post here to establish reverse TCP tunnel.
// Body is already parsed by the Content-Type injector + express.json() in server.ts.
router.post('/connect', autoRegisterAllowlist, (req: Request, res: Response) => {
  const { DevClass, DeviceID, ServerIP } = req.body;
  const resolvedDeviceId = (req as any).resolvedDeviceId as string | undefined;
  const socket = req.socket;

  // ─── CRITICAL: Detach socket from Node.js HTTP server ───
  // Express/HTTP server will interfere with the reverse TCP tunnel if we don't
  // properly complete the HTTP transaction and detach the socket.
  // 1. Send the HTTP 200 response via Express (marks transaction as complete)
  res.writeHead(200, {
    'Connection': 'keep-alive',
    'Content-Length': '0',
  });
  res.flushHeaders();

  // 2. Detach the socket from Express's HTTP internals
  //    This prevents the HTTP parser from trying to read new HTTP requests
  //    from the socket (which would conflict with the DVRIP tunnel protocol).
  socket.removeAllListeners('timeout');
  if ((socket as any).parser) {
    (socket as any).parser = null;
  }
  if ((socket as any)._httpMessage) {
    delete (socket as any)._httpMessage;
  }

  socket.setTimeout(0);

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
