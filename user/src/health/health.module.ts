import { Module } from '@nestjs/common';
import { ElastiCacheModule } from '@restaurant/aws';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [ElastiCacheModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
