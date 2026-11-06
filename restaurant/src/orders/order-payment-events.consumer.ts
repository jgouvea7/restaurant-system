import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import {
  CourierAssignmentExpiredEvent,
  CourierAssignmentRejectedEvent,
  DomainEvent,
  EVENT_TYPES,
  EventConsumerService,
  PaymentApprovedEvent,
  PaymentRejectedEvent,
} from '@restaurant/aws';
import { OrdersService } from './orders.service';

@Injectable()
export class OrderPaymentEventsConsumer implements OnApplicationBootstrap {
  private readonly logger = new Logger(OrderPaymentEventsConsumer.name);

  constructor(
    private readonly eventConsumer: EventConsumerService,
    private readonly ordersService: OrdersService,
  ) {}

  onApplicationBootstrap(): void {
    this.eventConsumer.start((event) => this.handle(event), {
      pollIntervalMs: 1000,
    });
  }

  private async handle(event: DomainEvent): Promise<void> {
    if (event.type === EVENT_TYPES.PAYMENT_APPROVED) {
      const data = event.data as PaymentApprovedEvent;
      await this.ordersService.handlePaymentResult(data.orderId, true);
      return;
    }

    if (event.type === EVENT_TYPES.PAYMENT_REJECTED) {
      const data = event.data as PaymentRejectedEvent;
      await this.ordersService.handlePaymentResult(data.orderId, false);
      return;
    }

    if (event.type === EVENT_TYPES.COURIER_ASSIGNMENT_REJECTED) {
      const data = event.data as CourierAssignmentRejectedEvent;
      await this.ordersService.handleCourierAssignmentFailure(
        data.orderId,
        data.courierId,
      );
      return;
    }

    if (event.type === EVENT_TYPES.COURIER_ASSIGNMENT_EXPIRED) {
      const data = event.data as CourierAssignmentExpiredEvent;
      await this.ordersService.handleCourierAssignmentFailure(
        data.orderId,
        data.courierId,
      );
      return;
    }

    this.logger.debug(`Evento ignorado pelo restaurant: ${event.type}`);
  }
}
