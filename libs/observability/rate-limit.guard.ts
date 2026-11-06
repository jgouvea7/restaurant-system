import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';

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
export class RateLimitGuard implements CanActivate {
  private readonly windowMs = Number(
    process.env.RATE_LIMIT_WINDOW_MS ?? 60_000,
  );
  private readonly maxRequests = Number(
    process.env.RATE_LIMIT_MAX_REQUESTS ?? 240,
  );
  private readonly buckets = new Map<string, Bucket>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RateLimitRequest>();
    const path = request.path ?? request.url ?? '';

    if (path.startsWith('/health')) {
      return true;
    }

    const forwarded = request.headers['x-forwarded-for'];
    const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const clientId =
      forwardedIp?.split(',')[0]?.trim() || request.ip || 'unknown';
    const now = Date.now();
    const current = this.buckets.get(clientId);

    if (!current || current.resetAt <= now) {
      this.buckets.set(clientId, {
        count: 1,
        resetAt: now + this.windowMs,
      });
      this.prune(now);
      return true;
    }

    current.count += 1;

    if (current.count > this.maxRequests) {
      throw new HttpException(
        'Muitas requisicoes; tente novamente em instantes',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
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
