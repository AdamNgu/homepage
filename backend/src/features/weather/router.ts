import { Router } from 'express';

import { getWeather } from './service.js';

// Express 5 forwards rejected handler promises to the error middleware.
export const weatherRouter = Router();

weatherRouter.get('/', async (_req, res) => {
  res.json(await getWeather());
});
