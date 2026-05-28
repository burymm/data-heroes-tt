import { Router, type Request, type Response } from 'express';
import type { PreferenceService } from '../app/preference-service.js';
import type { EvaluationService } from '../app/evaluation-service.js';
import type { Region } from '../domain/types.js';
import { REGIONS } from '../domain/types.js';
import {
  createUserBody,
  updatePreferencesBody,
  messengerBody,
  quietHoursBody,
  evaluateBody,
} from './validation.js';

export function createRouter(
  prefs: PreferenceService,
  evalSvc: EvaluationService,
): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    res.json({
      service: 'notification-preferences-service',
      version: '0.1.0',
      endpoints: {
        health: 'GET /health',
        createUser: 'POST /users',
        getPreferences: 'GET /users/:id/preferences?category=&channel=&region=&datetime=',
        updatePreference: 'PUT /users/:id/preferences',
        setQuietHours: 'PUT /users/:id/quiet-hours',
        connectMessenger: 'POST /users/:id/messengers',
        disconnectMessenger: 'DELETE /users/:id/messengers/:messenger',
        evaluate: 'POST /evaluate',
      },
    });
  });

  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  // POST /users — create user with contact info
  router.post('/users', async (req: Request, res: Response) => {
    const parsed = createUserBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const { id, email, phone, region } = parsed.data;
      await prefs.createUser(id, email ?? null, phone ?? null, region ?? 'US');
      res.status(201).json({ id });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /users/:id/preferences
  // Without filters → all settings (what's on/off)
  // With ?category=&channel=&region=&datetime= → only currently allowed
  router.get('/users/:id/preferences', async (req: Request, res: Response) => {
    try {
      const userId = req.params.id as string;
      const filterCategory = req.query.category as string | undefined;
      const filterChannel = req.query.channel as string | undefined;
      const region = req.query.region as string | undefined;
      const datetime = req.query.datetime as string | undefined;

      // At least one filter param → evaluate
      if (region || datetime || filterCategory || filterChannel) {
        const userRegion: Region = region && REGIONS.includes(region as Region)
          ? (region as Region)
          : 'US';
        let available = await evalSvc.evaluateAll(
          userId,
          userRegion,
          datetime ? new Date(datetime) : new Date(),
        );
        let allowed = available.filter((a) => a.available);
        if (filterCategory) allowed = allowed.filter((a) => a.category === filterCategory);
        if (filterChannel) allowed = allowed.filter((a) => a.channel === filterChannel);
        res.json(allowed.map((a) => ({ category: a.category, channel: a.channel })));
        return;
      }

      // No filters — full settings
      const result = await prefs.getPreferences(userId);
      res.json({
        effective: result.effective,
        messengers: result.messengers.map((m) => m.messenger),
        quietHours: result.quietHours,
      });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.put('/users/:id/preferences', async (req: Request, res: Response) => {
    const parsed = updatePreferencesBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const { category, channel, enabled } = parsed.data;
      if (category === '*') {
        await prefs.batchUpdatePreference(req.params.id as string, channel, enabled);
      } else {
        await prefs.updatePreference(req.params.id as string, category, channel, enabled);
      }
      res.json({ status: 'ok' });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.put('/users/:id/quiet-hours', async (req: Request, res: Response) => {
    const parsed = quietHoursBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      await prefs.updateQuietHours(req.params.id as string, parsed.data);
      res.json({ status: 'ok' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      res.status(400).json({ error: message });
    }
  });

  router.post('/users/:id/messengers', async (req: Request, res: Response) => {
    const parsed = messengerBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      await prefs.connectMessenger(req.params.id as string, parsed.data.messenger);
      res.json({ status: 'ok' });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.delete(
    '/users/:id/messengers/:messenger',
    async (req: Request, res: Response) => {
      try {
        await prefs.disconnectMessenger(
          req.params.id as string,
          req.params.messenger as string,
        );
        res.json({ status: 'ok' });
      } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
      }
    },
  );

  router.post('/evaluate', async (req: Request, res: Response) => {
    const parsed = evaluateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const result = await evalSvc.evaluate(
        parsed.data.userId,
        parsed.data.category,
        parsed.data.channel,
        parsed.data.region,
        new Date(parsed.data.datetime),
      );
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
