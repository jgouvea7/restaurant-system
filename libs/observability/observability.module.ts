import { Global, Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { RateLimitGuard } from './rate-limit.guard';
import { RequestContextMiddleware } from './request-context.middleware';

@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsService, RequestContextMiddleware, RateLimitGuard],
  exports: [MetricsService, RequestContextMiddleware, RateLimitGuard],
})
export class ObservabilityModule {}
