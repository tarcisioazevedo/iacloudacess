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

// Force parse raw body string to see what the 203 bytes actually contain!
import bodyParser from 'body-parser';
router.use(bodyParser.text({ type: '*/*' }));

// POST /cgi-bin/api/autoRegist/connect
// Intelbras devices on firmware 20251201+ post here to establish reverse TCP tunnel.
router.post('/connect', (req: Request, res: Response, next) => {
  console.log(`[AutoRegister] Incoming request raw body string:`, (req as any).rawBody || req.body);
  
  // Try to parse manually if it looks like JSON or Form
  let parsedBody: any = {};
  const bodyText = (req as any).rawBody || req.body;
  if (typeof bodyText === 'string' && bodyText.length > 0) {
    try {
      parsedBody = JSON.parse(bodyText);
    } catch {
      // Not JSON, maybe query string?
      const params = new URLSearchParams(bodyText);
      for (const [key, value] of params.entries()) {
        parsedBody[key] = value;
      }
    }
  } else if (typeof req.body === 'object') {
    parsedBody = req.body;
  }
  
  req.body = parsedBody;
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
