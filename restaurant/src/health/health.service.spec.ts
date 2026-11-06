import { DataSource } from 'typeorm';
import { ElastiCacheService } from '@restaurant/aws';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let dataSource: { query: jest.Mock };
  let cache: { ping: jest.Mock };

  beforeEach(() => {
    dataSource = { query: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    cache = { ping: jest.fn().mockResolvedValue('PONG') };
  });

  it('reports ok when database and redis respond', async () => {
    const service = new HealthService(
      dataSource as unknown as DataSource,
      cache as unknown as ElastiCacheService,
    );

    const report = await service.check();

    expect(report.status).toBe('ok');
    expect(report.checks.database.status).toBe('ok');
    expect(report.checks.redis?.status).toBe('ok');
  });

  it('reports degraded when redis fails', async () => {
    cache.ping.mockRejectedValue(new Error('connection refused'));
    const service = new HealthService(
      dataSource as unknown as DataSource,
      cache as unknown as ElastiCacheService,
    );

    const report = await service.check();

    expect(report.status).toBe('degraded');
    expect(report.checks.redis?.status).toBe('error');
  });

  it('reports degraded when the database fails', async () => {
    dataSource.query.mockRejectedValue(new Error('db down'));
    const service = new HealthService(
      dataSource as unknown as DataSource,
      cache as unknown as ElastiCacheService,
    );

    const report = await service.check();

    expect(report.status).toBe('degraded');
    expect(report.checks.database.status).toBe('error');
  });
});
