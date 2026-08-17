import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectRedis } from './lib/redis.js';

const main = async (): Promise<void> => {
  await connectRedis();
  createApp().listen(env.port, () => {
    console.log(`homepage backend listening on :${env.port}`);
  });
};

void main();
