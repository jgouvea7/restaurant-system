import { Module } from '@nestjs/common';
import { CourierService } from './courier.service';
import { CourierController } from './courier.controller';
import { CourierReservationSweeper } from './courier-reservation.sweeper';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Courier } from './entities/courier.entity';
import { ElastiCacheModule, EventsModule } from '@restaurant/aws';

@Module({
  imports: [
    TypeOrmModule.forFeature([Courier]),
    ElastiCacheModule,
    EventsModule,
  ],
  controllers: [CourierController],
  providers: [CourierService, CourierReservationSweeper],
})
export class CourierModule {}
