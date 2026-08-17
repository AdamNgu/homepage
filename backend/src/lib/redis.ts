import { createClient } from 'redis';

import { env } from '../config/env.js';

const client = createClient({ url: env.redisUrl });

client.on('error', (err: Error) => {
  console.error('[redis] error:', err.message);
});

// Resolves even when Redis is unreachable: the app must serve without its cache.
export const connectRedis = async (): Promise<void> => {
  try {
    await client.connect();
    console.log('[redis] connected');
  } catch (err) {
    console.error('[redis] initial connect failed, running uncached:', err);
  }
};

// Cache-aside: any Redis failure falls through to a fresh fetch.
export const getCached = async <T>(
  key: string,
  ttlSeconds: number,
  fetchFresh: () => Promise<T>,
): Promise<T> => {
  if (client.isReady) {
    try {
      const hit = await client.get(key);
      if (hit !== null) {
        return JSON.parse(hit) as T;
      }
    } catch (err) {
      console.error(`[redis] read failed for ${key}:`, err);
    }
  }
  const fresh = await fetchFresh();
  if (client.isReady) {
    try {
      await client.setEx(key, ttlSeconds, JSON.stringify(fresh));
    } catch (err) {
      console.error(`[redis] write failed for ${key}:`, err);
    }
  }
  return fresh;
};
