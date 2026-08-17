import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectRedis } from './lib/redis.js';

// Fire-and-forget: node-redis retries unreachable hosts forever, so awaiting
// connect() would block listen() for as long as Redis is down. The cache is
// optional (isReady guards) and activates whenever the client gets through.
void connectRedis();

const server = createApp().listen(env.port, () => {
  console.log(`homepage backend listening on :${env.port}`);
});

// As container PID 1, node has no default signal disposition — without these
// handlers every `podman stop` waits out the 10s SIGKILL timeout.
const shutdown = (): void => {
  server.close(() => process.exit(0));
  server.closeAllConnections();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
