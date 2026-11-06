import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import Redis from 'ioredis';

interface RateLimitRequest {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
  path?: string;
  url?: string;
}

interface Bucket {
  count: number;
  resetAt: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate, OnModuleDestroy {
  private readonly logger = new Logger(RateLimitGuard.name);
  private readonly windowMs = Number(
    process.env.RATE_LIMIT_WINDOW_MS ?? 60_000,
  );
  private readonly maxRequests = Number(
    process.env.RATE_LIMIT_MAX_REQUESTS ?? 240,
  );
  private readonly serviceName = process.env.SERVICE_NAME ?? 'unknown';
  private readonly buckets = new Map<string, Bucket>();
  private readonly redis?: Redis;
  private redisAvailable = false;
  private redisErrorLogged = false;

  constructor() {
    if (process.env.RATE_LIMIT_REDIS_ENABLED === 'false') {
      return;
    }

    const url = process.env.RATE_LIMIT_REDIS_URL;

    if (!url && !process.env.REDIS_HOST && !process.env.ELASTICACHE_HOST) {
      return;
    }

    this.redis = url
      ? new Redis(url, {
          lazyConnect: true,
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
          retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
        })
      : new Redis({
          host:
            process.env.REDIS_HOST ??
            process.env.ELASTICACHE_HOST ??
            'localhost',
          port: Number(
            process.env.REDIS_PORT ?? process.env.ELASTICACHE_PORT ?? 16379,
          ),
          password: process.env.REDIS_PASSWORD || undefined,
          db: Number(process.env.RATE_LIMIT_REDIS_DB ?? 0),
          lazyConnect: true,
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
          retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
        });

    this.redis.on('ready', () => {
      this.redisAvailable = true;
      this.redisErrorLogged = false;
    });
    this.redis.on('end', () => {
      this.redisAvailable = false;
    });
    this.redis.on('error', (error: Error) => {
      this.redisAvailable = false;

      if (!this.redisErrorLogged) {
        this.logger.warn(
          `Rate limit distribuido indisponivel; usando memoria: ${error.message}`,
        );
        this.redisErrorLogged = true;
      }
    });

    void this.redis.connect().catch(() => undefined);
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.redis) {
      return;
    }

    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RateLimitRequest>();
    const path = request.path ?? request.url ?? '';

    if (path.startsWith('/health') || path.startsWith('/metrics')) {
      return true;
    }

    const clientId = this.clientId(request);

    if (this.redis && this.redisAvailable) {
      const distributed = await this.incrementDistributed(clientId);

      if (distributed !== null) {
        return this.assertWithinLimit(distributed);
      }
    }

    return this.assertWithinLimit(this.incrementInMemory(clientId));
  }

  private async incrementDistributed(clientId: string): Promise<number | null> {
    if (!this.redis) {
      return null;
    }

    const windowStart = Math.floor(Date.now() / this.windowMs);
    const key = `rate-limit:${this.serviceName}:${clientId}:${windowStart}`;

    try {
      const count = await this.redis.incr(key);

      if (count === 1) {
        await this.redis.pexpire(key, this.windowMs * 2);
      }

      return count;
    } catch {
      this.redisAvailable = false;
      return null;
    }
  }

  private incrementInMemory(clientId: string): number {
    const now = Date.now();
    const current = this.buckets.get(clientId);

    if (!current || current.resetAt <= now) {
      this.buckets.set(clientId, {
        count: 1,
        resetAt: now + this.windowMs,
      });
      this.prune(now);
      return 1;
    }

    current.count += 1;

    return current.count;
  }

  private assertWithinLimit(count: number): boolean {
    if (count > this.maxRequests) {
      throw new HttpException(
        'Muitas requisicoes; tente novamente em instantes',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private clientId(request: RateLimitRequest): string {
    const forwarded = request.headers['x-forwarded-for'];
    const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded;

    return forwardedIp?.split(',')[0]?.trim() || request.ip || 'unknown';
  }

  private prune(now: number): void {
    if (this.buckets.size < 10_000) {
      return;
    }

    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }
}
