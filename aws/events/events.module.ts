import { Module } from '@nestjs/common';
import { EventConsumerService } from './event-consumer.service';
import { EventPublisherService } from './event-publisher.service';

@Module({
  providers: [EventPublisherService, EventConsumerService],
  exports: [EventPublisherService, EventConsumerService],
})
export class EventsModule {}
