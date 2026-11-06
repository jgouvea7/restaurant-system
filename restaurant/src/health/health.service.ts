import { Injectable, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ElastiCacheService } from '@restaurant/aws';

export interface HealthCheckResult {
  status: 'ok' | 'error';
  latencyMs: number;
  error?: string;
}

export interface HealthReport {
  service: string;
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  timestamp: string;
  checks: {
    database: HealthCheckResult;
    redis?: HealthCheckResult;
  };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly dataSource: DataSource,
    @Optional() private readonly cache?: ElastiCacheService,
  ) {}

  async check(): Promise<HealthReport> {
    const [database, redis] = await Promise.all([
      this.measure(() => this.dataSource.query('SELECT 1')),
      this.cache
        ? this.measure(() => this.cache!.ping())
        : Promise.resolve(undefined),
    ]);

    const checks: HealthReport['checks'] = { database };

    if (redis) {
      checks.redis = redis;
    }

    const status =
      database.status === 'ok' && (!redis || redis.status === 'ok')
        ? 'ok'
        : 'degraded';

    return {
      service: process.env.SERVICE_NAME ?? 'restaurant',
      status,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  private async measure(
    action: () => Promise<unknown>,
  ): Promise<HealthCheckResult> {
    const startedAt = Date.now();

    try {
      await action();
      return { status: 'ok', latencyMs: Date.now() - startedAt };
    } catch (error) {
      return {
        status: 'error',
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
