import { createServer, type Server } from 'http';
import express from 'express';
import { renderEdgeUi } from './webUi';

interface LocalServerOptions {
  host: string;
  port: number;
  intakeSecret?: string;
  onIntelbrasEvent: (deviceRef: string, payload: Record<string, unknown>) => Promise<void>;
  onAutoRegisterConnect: (
    payload: { DevClass?: string; DeviceID?: string; ServerIP?: string },
    context: { remoteAddress?: string | null },
  ) => Promise<unknown>;
  onStatus: () => Promise<Record<string, unknown>>;
  onClaim: (payload: { enrollmentToken?: string; force?: boolean }) => Promise<Record<string, unknown>>;
  onLicense: () => Promise<Record<string, unknown>>;
  onAction: (
    action: 'heartbeat' | 'sync-poll' | 'flush-events' | 'simulate-event',
    payload?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
}

export async function startEdgeLocalServer(options: LocalServerOptions): Promise<Server> {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  app.get('/', (_req, res) => {
    res.redirect('/ui');
  });

  app.get('/ui', (_req, res) => {
    res.type('html').send(renderEdgeUi());
  });

  app.get('/health', async (_req, res) => {
    try {
      const health = await options.onStatus();
      res.json(health);
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.get('/api/local/status', async (_req, res) => {
    try {
      const status = await options.onStatus();
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.get('/api/local/license', async (_req, res) => {
    try {
      const license = await options.onLicense();
      res.json(license);
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.post('/api/local/license/refresh', async (_req, res) => {
    try {
      const license = await options.onLicense();
      res.json(license);
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.post('/api/local/claim', async (req, res) => {
    try {
      const result = await options.onClaim({
        enrollmentToken: typeof req.body?.enrollmentToken === 'string' ? req.body.enrollmentToken.trim() : undefined,
        force: Boolean(req.body?.force),
      });
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post('/api/local/actions/:action', async (req, res) => {
    try {
      const action = req.params.action as 'heartbeat' | 'sync-poll' | 'flush-events' | 'simulate-event';
      if (!['heartbeat', 'sync-poll', 'flush-events', 'simulate-event'].includes(action)) {
        return res.status(404).json({ message: 'Action not found' });
      }
      const payload = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
        ? req.body as Record<string, unknown>
        : undefined;
      const result = await options.onAction(action, payload);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post('/cgi-bin/api/autoRegist/connect', async (req, res) => {
    try {
      await options.onAutoRegisterConnect({
        DevClass: typeof req.body?.DevClass === 'string' ? req.body.DevClass.trim() : undefined,
        DeviceID: typeof req.body?.DeviceID === 'string' ? req.body.DeviceID.trim() : undefined,
        ServerIP: typeof req.body?.ServerIP === 'string' ? req.body.ServerIP.trim() : undefined,
      }, {
        remoteAddress: req.ip || null,
      });

      res.status(200).end();
    } catch (err: any) {
      res.status(403).json({ message: err.message });
    }
  });

  app.post('/local/intelbras/events/:deviceRef', async (req, res) => {
    try {
      if (options.intakeSecret && req.header('x-edge-intake-secret') !== options.intakeSecret) {
        return res.status(401).json({ message: 'Invalid intake secret' });
      }

      await options.onIntelbrasEvent(req.params.deviceRef, req.body || {});
      return res.json({ status: 'queued' });
    } catch (err: any) {
      return res.status(400).json({ message: err.message });
    }
  });

  const server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(options.port, options.host, () => resolve());
  });

  return server;
}
