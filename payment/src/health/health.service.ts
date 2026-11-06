import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface HealthReport {
  service: string;
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  timestamp: string;
  checks: {
    database: {
      status: 'ok' | 'error';
      latencyMs: number;
      error?: string;
    };
  };
}

@Injectable()
export class HealthService {
  constructor(private readonly dataSource: DataSource) {}

  async check(): Promise<HealthReport> {
    const startedAt = Date.now();
    let database: HealthReport['checks']['database'];

    try {
      await this.dataSource.query('SELECT 1');
      database = { status: 'ok', latencyMs: Date.now() - startedAt };
    } catch (error) {
      database = {
        status: 'error',
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    return {
      service: process.env.SERVICE_NAME ?? 'payment',
      status: database.status === 'ok' ? 'ok' : 'degraded',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      checks: { database },
    };
  }
}
