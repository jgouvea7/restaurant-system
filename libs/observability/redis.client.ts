import Redis from 'ioredis';

let client: Redis | null = null;
let enabled = false;

function redisDisabled(): boolean {
  return process.env.RATE_LIMIT_BACKEND === 'memory';
}

export function getRedisClient(): Redis | null {
  if (redisDisabled()) {
    return null;
  }

  const host =
    process.env.REDIS_HOST?.trim() ||
    process.env.ELASTICACHE_HOST?.trim();

  if (!host) {
    return null;
  }

  if (!client) {
    const port = Number(
      process.env.REDIS_PORT ?? process.env.ELASTICACHE_PORT ?? 6379,
    );

    client = new Redis({
      host,
      port: Number.isFinite(port) ? port : 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      lazyConnect: true,
      connectTimeout: 1000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
    });

    client.on('error', () => {
      enabled = false;
    });
    client.on('ready', () => {
      enabled = true;
    });
    client.on('close', () => {
      enabled = false;
    });

    client.connect().catch(() => {
      enabled = false;
    });
  }

  return enabled ? client : null;
}

export async function closeRedisClient(): Promise<void> {
  if (!client) {
    return;
  }

  const current = client;
  client = null;
  enabled = false;

  try {
    await current.quit();
  } catch {
    current.disconnect();
  }
}
