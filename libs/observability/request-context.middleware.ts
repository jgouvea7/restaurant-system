import { randomUUID } from 'node:crypto';
import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { requestContextStorage } from './request-context';
import { MetricsService } from './metrics.service';

export interface RequestLike {
  method: string;
  originalUrl?: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  requestId?: string;
}

export interface ResponseLike {
  statusCode: number;
  setHeader(name: string, value: string): void;
  on(event: 'finish', listener: () => void): void;
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HttpRequest');

  constructor(private readonly metrics?: MetricsService) {}

  use(req: RequestLike, res: ResponseLike, next: () => void): void {
    const inbound = req.headers['x-request-id'];
    const requestId =
      typeof inbound === 'string' && inbound.length <= 128
        ? inbound
        : randomUUID();
    const traceparent = this.readHeader(req.headers.traceparent);

    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);

    const startedAt = process.hrtime.bigint();
    const path = this.normalizePath(req.originalUrl ?? req.url);

    res.on('finish', () => {
      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const labels = {
        method: req.method,
        path,
        status: String(res.statusCode),
      };

      this.metrics?.increment('http_requests_total', labels);
      this.metrics?.observe(
        'http_request_duration_ms',
        durationMs,
        labels,
      );

      this.logger.log(
        JSON.stringify({
          requestId,
          traceId: this.traceId(traceparent),
          method: req.method,
          path,
          statusCode: res.statusCode,
          durationMs: Number(durationMs.toFixed(2)),
        }),
      );
    });

    requestContextStorage.run({ requestId, traceparent }, () => next());
  }

  private readHeader(
    value: string | string[] | undefined,
  ): string | undefined {
    return Array.isArray(value) ? value[0] : value;
  }

  private traceId(traceparent: string | undefined): string | undefined {
    return traceparent?.split('-')[1];
  }

  private normalizePath(path: string): string {
    const withoutQuery = path.split('?')[0] ?? path;

    return withoutQuery
      .replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        ':id',
      )
      .replace(/\/\d+(?=\/|$)/g, '/:id');
  }
}
