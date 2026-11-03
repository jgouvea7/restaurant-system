import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  EventPublisherService,
  OrderCreatedEvent,
} from '@restaurant/aws';
import { PaymentsService } from './payments.service';
import { PaymentStatus } from './entities/payment.entity';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let repository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let eventPublisher: { publish: jest.Mock };

  const event: OrderCreatedEvent = {
    orderId: 'order-1',
    restaurantId: 'restaurant-1',
    costumerUserId: 'costumer-1',
    total: 25,
    paymentMethod: 'pix',
    deliveryAddress: null,
    items: [],
  };

  beforeEach(() => {
    repository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((value) => value),
      save: jest.fn().mockImplementation((value) =>
        Promise.resolve({ ...value, paymentId: 'payment-1' }),
      ),
    };

    const dataSource = {
      getRepository: jest.fn().mockReturnValue(repository),
    } as unknown as DataSource;

    eventPublisher = { publish: jest.fn().mockResolvedValue('event-id') };

    service = new PaymentsService(
      dataSource,
      eventPublisher as unknown as EventPublisherService,
    );
  });

  it('approves a payment within the limit', async () => {
    const result = await service.processOrder(event);

    expect(result.status).toBe(PaymentStatus.APPROVED);
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      'payment.approved',
      {
        paymentId: 'payment-1',
        orderId: 'order-1',
        amount: 25,
      },
      'payment',
    );
  });

  it('rejects a payment above the limit', async () => {
    const result = await service.processOrder({ ...event, total: 5000 });

    expect(result.status).toBe(PaymentStatus.REJECTED);
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      'payment.rejected',
      expect.objectContaining({
        paymentId: 'payment-1',
        orderId: 'order-1',
        amount: 5000,
        reason: 'valor acima do limite de 1000',
      }),
      'payment',
    );
  });

  it('does not process the same order twice', async () => {
    repository.findOne.mockResolvedValue({
      paymentId: 'payment-existing',
      orderId: 'order-1',
      status: PaymentStatus.APPROVED,
    });

    const result = await service.processOrder(event);

    expect(result).toEqual(
      expect.objectContaining({ paymentId: 'payment-existing' }),
    );
    expect(repository.save).not.toHaveBeenCalled();
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('throws when the payment does not exist', async () => {
    await expect(service.findByOrderId('unknown')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
