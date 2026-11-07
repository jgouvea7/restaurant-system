import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { getRedisClient } from './redis.client';

interface IdempotencyRequest {
  method?: string;
  path?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  user?: { userId?: string };
}

interface IdempotencyResponse {
  statusCode: number;
  status(code: number): unknown;
}

interface CachedResponse {
  statusCode: number;
  body: unknown;
}

interface LocalEntry {
  expiresAt: number;
  value: string;
}

const HEADER = 'idempotency-key';
const PROCESSING = '__processing__';
const TTL_MS = 24 * 60 * 60 * 1000;
const LOCK_MS = 30_000;
const MAX_LOCAL_ENTRIES = 10_000;
const KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly local = new Map<string, LocalEntry>();

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const request = http.getRequest<IdempotencyRequest>();
    const response = http.getResponse<IdempotencyResponse>();
    const method = (request.method ?? 'GET').toUpperCase();

    if (!MUTATING_METHODS.has(method) || !request.user?.userId) {
      return next.handle();
    }

    const header = request.headers[HEADER];
    const idempotencyKey = Array.isArray(header) ? header[0] : header;

    if (!idempotencyKey) {
      return next.handle();
    }

    if (!KEY_PATTERN.test(idempotencyKey)) {
      throw new BadRequestException('Idempotency-Key invalida');
    }

    const key = this.storageKey(request, method, idempotencyKey);
    const cached = await this.read(key);
    const replay = this.parseCached(cached);

    if (replay) {
      response.status(replay.statusCode);
      return of(replay.body);
    }

    if (cached === PROCESSING) {
      throw new ConflictException(
        'Requisicao idempotente em andamento; tente novamente',
      );
    }

    const claimed = await this.claim(key);

    if (!claimed) {
      const raced = this.parseCached(await this.read(key));

      if (raced) {
        response.status(raced.statusCode);
        return of(raced.body);
      }

      throw new ConflictException(
        'Requisicao idempotente em andamento; tente novamente',
      );
    }

    return next.handle().pipe(
      tap({
        next: (body) => {
          const statusCode = response.statusCode ?? 200;

          if (statusCode >= 200 && statusCode < 300) {
            void this.write(key, { statusCode, body });
          } else {
            void this.release(key);
          }
        },
        error: () => {
          void this.release(key);
        },
      }),
    );
  }

  private storageKey(
    request: IdempotencyRequest,
    method: string,
    idempotencyKey: string,
  ): string {
    const path = request.path ?? request.url ?? '';
    const pathname = path.split('?')[0];
    const user = request.user?.userId ?? 'anonymous';
    const service = process.env.SERVICE_NAME ?? 'service';

    return `idempotency:${service}:${user}:${method}:${pathname}:${idempotencyKey}`;
  }

  private parseCached(value: string | null): CachedResponse | null {
    if (!value || value === PROCESSING) {
      return null;
    }

    try {
      const parsed = JSON.parse(value) as Partial<CachedResponse>;

      if (
        typeof parsed.statusCode !== 'number' ||
        parsed.statusCode < 200 ||
        parsed.statusCode >= 300
      ) {
        return null;
      }

      return {
        statusCode: parsed.statusCode,
        body: parsed.body,
      };
    } catch {
      return null;
    }
  }

  private async read(key: string): Promise<string | null> {
    const redis = getRedisClient();

    if (redis) {
      try {
        return await redis.get(key);
      } catch {
        // Redis indisponivel: usa o fallback local.
      }
    }

    const entry = this.local.get(key);

    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      this.local.delete(key);
      return null;
    }

    return entry.value;
  }

  private async claim(key: string): Promise<boolean> {
    const redis = getRedisClient();

    if (redis) {
      try {
        const result = await redis.set(
          key,
          PROCESSING,
          'PX',
          LOCK_MS,
          'NX',
        );
        return result === 'OK';
      } catch {
        // Redis indisponivel: usa o fallback local.
      }
    }

    const existing = this.local.get(key);

    if (existing && existing.expiresAt > Date.now()) {
      return false;
    }

    this.ensureLocalCapacity();
    this.local.set(key, {
      expiresAt: Date.now() + LOCK_MS,
      value: PROCESSING,
    });

    return true;
  }

  private async write(key: string, value: CachedResponse): Promise<void> {
    const serialized = JSON.stringify(value);
    const redis = getRedisClient();

    if (redis) {
      try {
        await redis.set(key, serialized, 'PX', TTL_MS);
        return;
      } catch {
        // Redis indisponivel: usa o fallback local.
      }
    }

    this.ensureLocalCapacity();
    this.local.set(key, {
      expiresAt: Date.now() + TTL_MS,
      value: serialized,
    });
  }

  private async release(key: string): Promise<void> {
    const redis = getRedisClient();

    if (redis) {
      try {
        await redis.del(key);
      } catch {
        // Redis indisponivel: remove apenas o fallback local.
      }
    }

    this.local.delete(key);
  }

  private ensureLocalCapacity(): void {
    if (this.local.size < MAX_LOCAL_ENTRIES) {
      return;
    }

    const now = Date.now();

    for (const [key, entry] of this.local) {
      if (entry.expiresAt <= now) {
        this.local.delete(key);
      }
    }

    while (this.local.size >= MAX_LOCAL_ENTRIES) {
      const oldestKey = this.local.keys().next().value;

      if (oldestKey === undefined) {
        break;
      }

      this.local.delete(oldestKey);
    }
  }
}
