import path from 'node:path';

import express from 'express';

import { env } from './config/env.js';
import { weatherRouter } from './features/weather/router.js';
import { errorHandler } from './middleware/error-handler.js';

export const createApp = (): express.Express => {
  const app = express();
  app.disable('x-powered-by');

  // Answers "is the process serving" — deliberately no Redis/upstream checks.
  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/weather', weatherRouter);
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not found' });
  });

  if (env.staticDir !== undefined) {
    const staticDir = env.staticDir;
    app.use(express.static(staticDir));
    // SPA fallback: unknown non-API paths get index.html.
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
};
