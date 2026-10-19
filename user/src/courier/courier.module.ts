import { Module } from '@nestjs/common';
import { CourierService } from './courier.service';
import { CourierController } from './courier.controller';

@Module({
  controllers: [CourierController],
  providers: [CourierService],
})
export class CourierModule {}
