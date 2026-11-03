import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  EVENT_TYPES,
  EventPublisherService,
  OrderCreatedEvent,
} from '@restaurant/aws';
import { Payment, PaymentStatus } from './entities/payment.entity';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly eventPublisher: EventPublisherService,
  ) {}

  async processOrder(event: OrderCreatedEvent) {
    const existing = await this.findByOrderIdOrNull(event.orderId);

    if (existing) {
      this.logger.debug(
        `Pedido ${event.orderId} ja possui pagamento ${existing.paymentId}`,
      );
      return existing;
    }

    const amount = Number(event.total);
    const configuredLimit = Number(process.env.PAYMENT_APPROVAL_LIMIT ?? 1000);
    const limit =
      Number.isFinite(configuredLimit) && configuredLimit >= 0
        ? configuredLimit
        : 1000;
    const approved = Number.isFinite(amount) && amount > 0 && amount <= limit;
    const reason = approved
      ? null
      : this.rejectionReason(amount, limit);

    const repository = this.dataSource.getRepository(Payment);
    const payment = repository.create({
      orderId: event.orderId,
      amount: Number.isFinite(amount) ? amount.toFixed(2) : '0.00',
      method: event.paymentMethod,
      status: approved ? PaymentStatus.APPROVED : PaymentStatus.REJECTED,
      reason,
    });

    let saved: Payment;

    try {
      saved = await repository.save(payment);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        const concurrent = await this.findByOrderIdOrNull(event.orderId);

        if (concurrent) {
          return concurrent;
        }
      }

      throw error;
    }

    const payload = {
      paymentId: saved.paymentId,
      orderId: saved.orderId,
      amount: Number(saved.amount),
    };

    if (approved) {
      await this.eventPublisher.publish(
        EVENT_TYPES.PAYMENT_APPROVED,
        payload,
        'payment',
      );
    } else {
      await this.eventPublisher.publish(
        EVENT_TYPES.PAYMENT_REJECTED,
        { ...payload, reason: reason ?? 'pagamento recusado' },
        'payment',
      );
    }

    return saved;
  }

  async findByOrderId(orderId: string) {
    const payment = await this.findByOrderIdOrNull(orderId);

    if (!payment) {
      throw new NotFoundException('Pagamento nao encontrado');
    }

    return payment;
  }

  private findByOrderIdOrNull(orderId: string) {
    return this.dataSource
      .getRepository(Payment)
      .findOne({ where: { orderId } });
  }

  private rejectionReason(amount: number, limit: number): string {
    if (!Number.isFinite(amount) || amount <= 0) {
      return 'valor invalido';
    }

    return `valor acima do limite de ${limit}`;
  }
}
