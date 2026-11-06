import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EventPublisherService } from '@restaurant/aws';
import type { AuthenticatedUser } from '@restaurant/geolocation';
import { OrdersService } from './orders.service';
import { RestaurantAccessService } from '../restaurants/restaurant-access.service';
import { Order, OrderStatus } from './entities/order.entity';

describe('OrdersService', () => {
  let service: OrdersService;
  let order: Record<string, unknown>;
  let orderRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
  };
  let productRepository: { find: jest.Mock };
  let restaurantRepository: { findOne: jest.Mock; find: jest.Mock };
  let addressRepository: { findOne: jest.Mock };
  let eventPublisher: { publish: jest.Mock };
  let restaurantAccess: {
    findByOwnerOrFail: jest.Mock;
    isOwnedBy: jest.Mock;
    listIdsByOwner: jest.Mock;
  };
  let manager: { create: jest.Mock; save: jest.Mock };

  const costumerUser = {
    userId: 'costumer-1',
    email: 'costumer@example.com',
    roles: ['costumer'],
    ownerId: null,
    courierId: null,
    costumerId: 'costumer-1',
  } as AuthenticatedUser;

  const ownerUser = {
    userId: 'owner-user-1',
    email: 'owner@example.com',
    roles: ['owner'],
    ownerId: 'owner-1',
    courierId: null,
    costumerId: null,
  } as AuthenticatedUser;

  beforeEach(() => {
    order = {
      id: 'order-1',
      restaurantId: 'restaurant-1',
      costumerUserId: 'costumer-1',
      total: '20.00',
      status: OrderStatus.PENDING_PAYMENT,
      paymentMethod: 'pix',
      deliveryAddress: null,
      courierId: null,
      courierAssignedAt: null,
      items: [],
    };

    orderRepository = {
      find: jest.fn().mockResolvedValue([order]),
      findOne: jest.fn().mockImplementation(() => Promise.resolve(order)),
      save: jest.fn().mockImplementation((value) => Promise.resolve(value)),
    };

    productRepository = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'product-1',
          name: 'Pizza',
          price: '10.00',
          isActive: true,
          isAvailable: true,
          restaurant: { id: 'restaurant-1' },
        },
      ]),
    };

    restaurantRepository = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'restaurant-1', ownerUserId: 'owner-1' }),
      find: jest.fn().mockResolvedValue([{ id: 'restaurant-1' }]),
    };

    addressRepository = {
      findOne: jest.fn().mockResolvedValue({
        latitude: -23.5,
        longitude: -46.6,
      }),
    };

    manager = {
      create: jest.fn().mockImplementation((_entity, value) => ({ ...value })),
      save: jest.fn().mockImplementation((value) =>
        Promise.resolve({
          ...value,
          id: 'order-1',
          items: value.items.map((item: unknown, index: number) => ({
            ...(item as object),
            id: `item-${index}`,
          })),
        }),
      ),
    };

    const dataSource = {
      getRepository: jest.fn((entity) => {
        if (entity.name === 'Order') {
          return orderRepository;
        }

        if (entity.name === 'Product') {
          return productRepository;
        }

        if (entity.name === 'RestaurantAddress') {
          return addressRepository;
        }

        return restaurantRepository;
      }),
      transaction: jest.fn(async (callback) => callback(manager)),
    } as unknown as DataSource;

    eventPublisher = { publish: jest.fn().mockResolvedValue('event-id') };

    restaurantAccess = {
      findByOwnerOrFail: jest.fn().mockResolvedValue({
        id: 'restaurant-1',
        ownerUserId: 'owner-1',
      }),
      isOwnedBy: jest.fn().mockResolvedValue(true),
      listIdsByOwner: jest.fn().mockResolvedValue(['restaurant-1']),
    };

    service = new OrdersService(
      dataSource,
      eventPublisher as unknown as EventPublisherService,
      restaurantAccess as unknown as RestaurantAccessService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates an order with item snapshots and publishes order.created', async () => {
    const result = await service.create(
      {
        restaurantId: 'restaurant-1',
        paymentMethod: 'pix',
        items: [{ productId: 'product-1', quantity: 2 }],
      },
      costumerUser,
    );

    expect(result.total).toBe('20.00');
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      'order.created',
      expect.objectContaining({
        orderId: 'order-1',
        restaurantId: 'restaurant-1',
        total: 20,
        items: [
          expect.objectContaining({
            productId: 'product-1',
            productName: 'Pizza',
            quantity: 2,
            subtotal: 20,
          }),
        ],
      }),
      'restaurant',
      expect.anything(),
    );
  });

  it('rejects an order without items', async () => {
    await expect(
      service.create(
        {
          restaurantId: 'restaurant-1',
          paymentMethod: 'pix',
          items: [],
        },
        costumerUser,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects products from another restaurant', async () => {
    productRepository.find.mockResolvedValue([
      {
        id: 'product-1',
        name: 'Pizza',
        price: '10.00',
        isActive: true,
        isAvailable: true,
        restaurant: { id: 'restaurant-2' },
      },
    ]);

    await expect(
      service.create(
        {
          restaurantId: 'restaurant-1',
          paymentMethod: 'pix',
          items: [{ productId: 'product-1', quantity: 1 }],
        },
        costumerUser,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates the status and publishes order.status.changed', async () => {
    const result = await service.updateStatus('order-1', OrderStatus.CONFIRMED);

    expect(result.status).toBe(OrderStatus.CONFIRMED);
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      'order.status.changed',
      {
        orderId: 'order-1',
        restaurantId: 'restaurant-1',
        status: OrderStatus.CONFIRMED,
        previousStatus: OrderStatus.PENDING_PAYMENT,
      },
      'restaurant',
      expect.anything(),
    );
  });

  it('rejects an invalid status transition', async () => {
    await expect(
      service.updateStatus('order-1', OrderStatus.DELIVERED),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('confirms the order when payment is approved', async () => {
    const result = await service.handlePaymentResult('order-1', true);

    expect(result?.status).toBe(OrderStatus.CONFIRMED);
  });

  it('does not change an order that is no longer pending', async () => {
    order.status = OrderStatus.CONFIRMED;

    const result = await service.handlePaymentResult('order-1', false);

    expect(result?.status).toBe(OrderStatus.CONFIRMED);
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('assigns an explicit courier and starts delivery', async () => {
    order.status = OrderStatus.READY;
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      status: 200,
      ok: true,
      json: jest.fn().mockResolvedValue({
        courierId: 'courier-1',
        available: 'available',
      }),
    } as unknown as Response);

    const result = await service.assignCourier(
      'order-1',
      ownerUser,
      'courier-1',
      'Bearer test',
    );

    expect(result.status).toBe(OrderStatus.OUT_FOR_DELIVERY);
    expect(result.courierId).toBe('courier-1');
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      'order.courier.assigned',
      expect.objectContaining({
        orderId: 'order-1',
        restaurantId: 'restaurant-1',
        courierId: 'courier-1',
        status: OrderStatus.OUT_FOR_DELIVERY,
      }),
      'restaurant',
      expect.anything(),
    );
  });

  it('releases the courier when the order is delivered', async () => {
    order.status = OrderStatus.OUT_FOR_DELIVERY;
    order.courierId = 'courier-1';
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      status: 200,
      ok: true,
      json: jest.fn().mockResolvedValue({ released: true }),
    } as unknown as Response);

    const result = await service.updateStatus(
      'order-1',
      OrderStatus.DELIVERED,
      'Bearer test',
    );

    expect(result.status).toBe(OrderStatus.DELIVERED);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/courier/courier-1/release'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ orderId: 'order-1' }),
      }),
    );
  });

  it('selects the nearest available courier when none is given', async () => {
    order.status = OrderStatus.READY;
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      status: 200,
      ok: true,
      json: jest
        .fn()
        .mockResolvedValue([
          { courierId: 'courier-1', vehicleType: 'moto', distanceKm: 1.2 },
        ]),
    } as unknown as Response);

    const result = await service.assignCourier(
      'order-1',
      ownerUser,
      undefined,
      'Bearer test',
    );

    expect(result.courierId).toBe('courier-1');
  });

  it('rejects courier assignment from another owner', async () => {
    order.status = OrderStatus.READY;
    restaurantAccess.findByOwnerOrFail.mockRejectedValue(
      new ForbiddenException('Restaurante de outro owner'),
    );

    await expect(
      service.assignCourier('order-1', ownerUser, 'courier-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns the order to ready when the courier assignment fails', async () => {
    order.status = OrderStatus.OUT_FOR_DELIVERY;
    order.courierId = 'courier-1';
    order.courierAssignedAt = new Date();

    const result = await service.handleCourierAssignmentFailure(
      'order-1',
      'courier-1',
    );

    expect(result?.status).toBe(OrderStatus.READY);
    expect(result?.courierId).toBeNull();
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      'order.status.changed',
      expect.objectContaining({
        orderId: 'order-1',
        status: OrderStatus.READY,
        previousStatus: OrderStatus.OUT_FOR_DELIVERY,
      }),
      'restaurant',
      expect.anything(),
    );
  });

  it('ignores assignment failures from a different courier', async () => {
    order.status = OrderStatus.OUT_FOR_DELIVERY;
    order.courierId = 'courier-2';

    const result = await service.handleCourierAssignmentFailure(
      'order-1',
      'courier-1',
    );

    expect(result?.status).toBe(OrderStatus.OUT_FOR_DELIVERY);
    expect(result?.courierId).toBe('courier-2');
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });
});
