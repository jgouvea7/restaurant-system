import { Module } from '@nestjs/common';
import { EventConsumerService } from './event-consumer.service';
import { EventPublisherService } from './event-publisher.service';
import { OutboxRelayService } from './outbox-relay.service';

@Module({
  providers: [
    EventPublisherService,
    EventConsumerService,
    OutboxRelayService,
  ],
  exports: [
    EventPublisherService,
    EventConsumerService,
    OutboxRelayService,
  ],
})
export class EventsModule {}
