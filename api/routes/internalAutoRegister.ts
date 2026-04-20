import { Router, Request, Response } from 'express';
import { IntelbrasAutoRegisterService } from '../services/intelbrasAutoRegisterService';
import { autoRegisterPresenceService } from '../services/autoRegisterPresenceService';

const router = Router();

function requireInternalToken(req: Request, res: Response, next: () => void) {
  const configuredToken = process.env.AUTOREG_INTERNAL_TOKEN?.trim();
  if (!configuredToken) {
    return res.status(503).json({
      message: 'AutoRegister internal token is not configured',
    });
  }

  const receivedToken = req.header('x-autoreg-internal-token')?.trim();
  if (!receivedToken || receivedToken !== configuredToken) {
    return res.status(401).json({
      message: 'Unauthorized AutoRegister internal request',
    });
  }

  next();
}

router.use(requireInternalToken);

router.get('/sessions', async (_req: Request, res: Response) => {
  return res.json({
    instanceId: autoRegisterPresenceService.getGatewayInstanceId(),
    activeDevices: autoRegisterPresenceService.getActiveDeviceIds(),
    count: autoRegisterPresenceService.getActiveCount(),
  });
});

router.get('/sessions/:deviceId', async (req: Request, res: Response) => {
  const session = autoRegisterPresenceService.getSession(req.params.deviceId);
  if (!session) {
    return res.status(404).json({
      message: 'No active AutoRegister session for device',
    });
  }

  return res.json({ session });
});

router.post('/devices/:deviceId/request', async (req: Request, res: Response) => {
  const { deviceId } = req.params;
  const { method, path, body, responseType } = req.body || {};

  if (!method || typeof method !== 'string' || !path || typeof path !== 'string') {
    return res.status(400).json({
      message: 'method and path are required',
    });
  }

  try {
    const service = IntelbrasAutoRegisterService.getInstance();
    if (responseType === 'binary') {
      const response = await service.sendBinaryCgiRequest(deviceId, method.toUpperCase(), path, body);
      return res.json({
        dataBase64: response.body.toString('base64'),
        headers: response.headers,
        statusLine: response.statusLine,
      });
    }

    const data = await service.sendCgiRequest(deviceId, method.toUpperCase(), path, body);
    return res.json({ data });
  } catch (err: any) {
    return res.status(502).json({
      message: err.message || 'AutoRegister request failed',
    });
  }
});

export default router;
