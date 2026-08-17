import type { ErrorRequestHandler } from 'express';

import { UpstreamError } from '../features/weather/weather-gov.js';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error('[error]', err);
  if (err instanceof UpstreamError) {
    res.status(502).json({ error: 'weather.gov unavailable' });
    return;
  }
  res.status(500).json({ error: 'internal error' });
};
