import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsModule } from '@restaurant/aws';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrderPaymentEventsConsumer } from './order-payment-events.consumer';
import { RestaurantAccessModule } from '../restaurants/restaurant-access.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem]),
    EventsModule,
    RestaurantAccessModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrderPaymentEventsConsumer],
})
export class OrdersModule {}
