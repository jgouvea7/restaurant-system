import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { getRedisClient } from './redis.client';

interface RateLimitRequest {
  ip?: string;
  path?: string;
  url?: string;
}
interface RateLimitResponse {
  setHeader(name: string, value: string): void;
}

interface Bucket {
  count: number;
  resetAt: number;
}

interface RateLimitResult {
  count: number;
  resetAt: number;
}

const MAX_BUCKETS = 50_000;
const SENSITIVE_PATHS = new Set([
  '/auth/login',
  '/auth/refresh',
  '/users/authenticate',
]);
const REDIS_INCREMENT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {current, ttl}
`;

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly windowMs = this.readPositiveInt(
    'RATE_LIMIT_WINDOW_MS',
    60_000,
  );
  private readonly maxRequests = this.readPositiveInt(
    'RATE_LIMIT_MAX_REQUESTS',
    240,
  );
  private readonly sensitiveMaxRequests = this.readPositiveInt(
    'RATE_LIMIT_AUTH_MAX_REQUESTS',
    10,
  );
  private readonly buckets = new Map<string, Bucket>();

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<RateLimitRequest>();
    const path = this.pathname(request.path ?? request.url ?? '');

    if (path.startsWith('/health') || path.startsWith('/metrics')) {
      return true;
    }

    const isSensitive = SENSITIVE_PATHS.has(path);
    const maxRequests = isSensitive
      ? this.sensitiveMaxRequests
      : this.maxRequests;
    const clientId = request.ip || 'unknown';
    const key = `${isSensitive ? 'auth' : 'default'}:${clientId}`;
    const now = Date.now();
    const { count, resetAt } = await this.consume(key, now);

    if (count > maxRequests) {
      const retryAfter = Math.max(1, Math.ceil((resetAt - now) / 1000));
      http
        .getResponse<RateLimitResponse>()
        .setHeader('Retry-After', String(retryAfter));

      throw new HttpException(
        'Muitas requisicoes; tente novamente em instantes',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private async consume(key: string, now: number): Promise<RateLimitResult> {
    const redis = getRedisClient();

    if (redis) {
      try {
        const response = (await redis.eval(
          REDIS_INCREMENT_SCRIPT,
          1,
          `rate-limit:${key}`,
          String(this.windowMs),
        )) as [number | string, number | string];
        const count = Number(response[0]);
        const ttl = Number(response[1]);

        if (Number.isFinite(count) && Number.isFinite(ttl)) {
          return {
            count,
            resetAt: now + Math.max(ttl, 0),
          };
        }
      } catch {
        // Redis indisponivel: usa o fallback local para nao bloquear o servico.
      }
    }

    return this.consumeLocal(key, now);
  }

  private consumeLocal(key: string, now: number): RateLimitResult {
    const current = this.buckets.get(key);

    if (!current || current.resetAt <= now) {
      const bucket = {
        count: 1,
        resetAt: now + this.windowMs,
      };
      this.buckets.set(key, bucket);
      this.prune(now);
      return bucket;
    }

    current.count += 1;
    return current;
  }

  private pathname(value: string): string {
    const queryIndex = value.indexOf('?');
    return queryIndex === -1 ? value : value.slice(0, queryIndex);
  }

  private prune(now: number): void {
    if (this.buckets.size <= MAX_BUCKETS) {
      if (this.buckets.size < 10_000) {
        return;
      }

      for (const [key, bucket] of this.buckets) {
        if (bucket.resetAt <= now) {
          this.buckets.delete(key);
        }
      }

      return;
    }

    for (const [key, bucket] of this.buckets) {
      if (this.buckets.size <= MAX_BUCKETS / 2) {
        break;
      }

      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }

    while (this.buckets.size > MAX_BUCKETS) {
      const oldestKey = this.buckets.keys().next().value;

      if (oldestKey === undefined) {
        break;
      }

      this.buckets.delete(oldestKey);
    }
  }

  private readPositiveInt(name: string, fallback: number): number {
    const value = Number(process.env[name] ?? fallback);
    return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
  }
}

