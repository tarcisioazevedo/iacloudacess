import { Router, Request, Response } from 'express';
import { IntelbrasAutoRegisterService } from '../services/intelbrasAutoRegisterService';
import {
  autoRegisterRateLimit,
  autoRegisterConnectionLimit,
  autoRegisterAllowlist,
} from '../middleware/autoRegisterSecurity';

import express from 'express';

const router = Router();

router.use(autoRegisterRateLimit);
router.use(autoRegisterConnectionLimit);

// Force parsing of JSON even if Content-Type is missing or weird
router.use(express.json({ type: '*/*' }));
router.use(express.urlencoded({ extended: true, limit: '10mb' }));

// POST /cgi-bin/api/autoRegist/connect
// Intelbras devices on firmware 20251201+ post here to establish reverse TCP tunnel.
router.post('/connect', (req: Request, res: Response, next) => {
  console.log(`[AutoRegister] Incoming request headers:`, req.headers);
  console.log(`[AutoRegister] Incoming request raw body:`, req.body);
  next();
}, autoRegisterAllowlist, (req: Request, _res: Response) => {
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
