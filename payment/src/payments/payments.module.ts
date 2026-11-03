import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsModule } from '@restaurant/aws';
import { Payment } from './entities/payment.entity';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PaymentEventsConsumer } from './payment-events.consumer';

@Module({
  imports: [TypeOrmModule.forFeature([Payment]), EventsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentEventsConsumer],
})
export class PaymentsModule {}
