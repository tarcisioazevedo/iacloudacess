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
// Body is already parsed by the raw stream interceptor in server.ts (Intelbras sends no Content-Type).
router.post('/connect', autoRegisterAllowlist, (req: Request, _res: Response) => {
  const { DevClass, DeviceID, ServerIP } = req.body;
  const resolvedDeviceId = (req as any).resolvedDeviceId as string | undefined;
  const socket = req.socket;

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
