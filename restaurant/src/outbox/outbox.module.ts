import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  EVENT_IDEMPOTENCY_STORE,
  EVENT_OUTBOX_STORE,
} from '@restaurant/aws';
import { OutboxEvent } from './outbox-event.entity';
import { ProcessedEvent } from './processed-event.entity';
import { TypeOrmEventStore } from './typeorm-event.store';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([OutboxEvent, ProcessedEvent])],
  providers: [
    TypeOrmEventStore,
    { provide: EVENT_OUTBOX_STORE, useExisting: TypeOrmEventStore },
    {
      provide: EVENT_IDEMPOTENCY_STORE,
      useExisting: TypeOrmEventStore,
    },
  ],
  exports: [
    TypeOrmEventStore,
    EVENT_OUTBOX_STORE,
    EVENT_IDEMPOTENCY_STORE,
  ],
})
export class OutboxModule {}
