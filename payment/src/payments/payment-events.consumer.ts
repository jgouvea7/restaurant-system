import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import {
  DomainEvent,
  EVENT_TYPES,
  EventConsumerService,
  OrderCreatedEvent,
} from '@restaurant/aws';
import { PaymentsService } from './payments.service';

@Injectable()
export class PaymentEventsConsumer implements OnApplicationBootstrap {
  private readonly logger = new Logger(PaymentEventsConsumer.name);

  constructor(
    private readonly eventConsumer: EventConsumerService,
    private readonly paymentsService: PaymentsService,
  ) {}

  onApplicationBootstrap(): void {
    this.eventConsumer.start((event) => this.handle(event), {
      pollIntervalMs: 1000,
    });
  }

  private async handle(event: DomainEvent): Promise<void> {
    if (event.type !== EVENT_TYPES.ORDER_CREATED) {
      this.logger.debug(`Evento ignorado pelo payment: ${event.type}`);
      return;
    }

    await this.paymentsService.processOrder(event.data as OrderCreatedEvent);
  }
}
