import { Module } from '@nestjs/common';
import { EventConsumerService } from './event-consumer.service';
import { EventPublisherService } from './event-publisher.service';
import { OutboxCleanupService } from './outbox-cleanup.service';
import { OutboxRelayService } from './outbox-relay.service';

@Module({
  providers: [
    EventPublisherService,
    EventConsumerService,
    OutboxRelayService,
    OutboxCleanupService,
  ],
  exports: [
    EventPublisherService,
    EventConsumerService,
    OutboxRelayService,
    OutboxCleanupService,
  ],
})
export class EventsModule {}
