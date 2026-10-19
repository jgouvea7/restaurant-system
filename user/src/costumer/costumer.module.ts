import { Module } from '@nestjs/common';
import { CostumerService } from './costumer.service';
import { CostumerController } from './costumer.controller';

@Module({
  controllers: [CostumerController],
  providers: [CostumerService],
})
export class CostumerModule {}
