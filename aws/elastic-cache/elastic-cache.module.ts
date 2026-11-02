import { Module } from '@nestjs/common';
import { ElastiCacheService } from './elastic-cache.service';

@Module({
  providers: [ElastiCacheService],
  exports: [ElastiCacheService],
})
export class ElastiCacheModule {}
