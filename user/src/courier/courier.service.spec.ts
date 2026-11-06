import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ElastiCacheService, EventPublisherService } from '@restaurant/aws';
import { CourierService } from './courier.service';
import {
  Courier,
  CourierAssignmentStatus,
  CourierAvailability,
  VehicleType,
} from './entities/courier.entity';

describe('CourierService', () => {
  let service: CourierService;
  let repository: {
    findOne: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let elastiCacheService: {
    addLocation: jest.Mock;
    addToSet: jest.Mock;
    removeFromSet: jest.Mock;
    findNearby: jest.Mock;
    getSetMembers: jest.Mock;
    getPosition: jest.Mock;
  };
  let eventPublisher: { publish: jest.Mock };

  const courier = {
    courierId: 'courier-1',
    vehicleType: VehicleType.MOTO,
    available: CourierAvailability.AVAILABLE,
    reservedForOrderId: null,
    reservedAt: null,
    reservationStatus: null,
    reservationExpiresAt: null,
  } as Courier;

  beforeEach(() => {
    courier.available = CourierAvailability.AVAILABLE;
    courier.reservedForOrderId = null;
    courier.reservedAt = null;
    courier.reservationStatus = null;
    courier.reservationExpiresAt = null;

    const queryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    repository = {
      findOne: jest.fn().mockResolvedValue(courier),
      save: jest.fn().mockImplementation((value) => Promise.resolve(value)),
      find: jest
        .fn()
        .mockResolvedValue([
          { courierId: 'courier-1', vehicleType: VehicleType.MOTO },
        ]),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };

    const dataSource = {
      getRepository: jest.fn().mockReturnValue(repository),
    } as unknown as DataSource;

    elastiCacheService = {
      addLocation: jest.fn().mockResolvedValue(1),
      addToSet: jest.fn().mockResolvedValue(1),
      removeFromSet: jest.fn().mockResolvedValue(1),
      findNearby: jest.fn().mockResolvedValue([
        { member: 'courier-1', distanceKm: 1.5 },
        { member: 'courier-2', distanceKm: 2 },
      ]),
      getSetMembers: jest.fn().mockResolvedValue(['courier-1']),
      getPosition: jest.fn().mockResolvedValue({
        latitude: -23.5,
        longitude: -46.6,
      }),
    };

    eventPublisher = { publish: jest.fn().mockResolvedValue('event-id') };

    service = new CourierService(
      dataSource,
      elastiCacheService as unknown as ElastiCacheService,
      eventPublisher as unknown as EventPublisherService,
    );
  });

  it('stores the courier location and event when the courier is available', async () => {
    const result = await service.updateLocation(
      'courier-1',
      'courier-1',
      -23.5,
      -46.6,
    );

    expect(elastiCacheService.addLocation).toHaveBeenCalledWith(
      'couriers:geo',
      {
        member: 'courier-1',
        latitude: -23.5,
        longitude: -46.6,
      },
    );
    expect(elastiCacheService.addToSet).toHaveBeenCalledWith(
      'couriers:available',
      'courier-1',
    );
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      'courier.location.updated',
      {
        courierId: 'courier-1',
        latitude: -23.5,
        longitude: -46.6,
        available: true,
      },
      'user',
    );
    expect(result).toEqual({
      courierId: 'courier-1',
      latitude: -23.5,
      longitude: -46.6,
    });
  });

  it('rejects invalid coordinates', async () => {
    await expect(
      service.updateLocation('courier-1', 'courier-1', 120, -46.6),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns a service unavailable error when Redis fails', async () => {
    elastiCacheService.addLocation.mockRejectedValue(
      new Error('connection refused'),
    );

    await expect(
      service.updateLocation('courier-1', 'courier-1', -23.5, -46.6),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('sets availability in the database and Redis', async () => {
    const result = await service.setCourierAvailability(
      'courier-1',
      'courier-1',
      false,
    );

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        courierId: 'courier-1',
        available: CourierAvailability.UNAVAILABLE,
      }),
    );
    expect(elastiCacheService.removeFromSet).toHaveBeenCalledWith(
      'couriers:available',
      'courier-1',
    );
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      'courier.availability.changed',
      { courierId: 'courier-1', available: false },
      'user',
    );
    expect(result.available).toBe(CourierAvailability.UNAVAILABLE);
  });

  it('reserves an available courier for an order', async () => {
    const result = await service.reserveCourier('courier-1', 'order-1');

    expect(repository.createQueryBuilder).toHaveBeenCalled();
    expect(elastiCacheService.removeFromSet).toHaveBeenCalledWith(
      'couriers:available',
      'courier-1',
    );
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      'courier.availability.changed',
      { courierId: 'courier-1', available: false },
      'user',
    );
    expect(result).toEqual(
      expect.objectContaining({
        courierId: 'courier-1',
        orderId: 'order-1',
        available: CourierAvailability.UNAVAILABLE,
      }),
    );
  });

  it('rejects reserving an unavailable courier', async () => {
    courier.available = CourierAvailability.UNAVAILABLE;

    await expect(
      service.reserveCourier('courier-1', 'order-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('releases a reserved courier back to available', async () => {
    courier.available = CourierAvailability.UNAVAILABLE;
    courier.reservedForOrderId = 'order-1';

    const result = await service.releaseCourier('courier-1', 'order-1');

    expect(result).toEqual(
      expect.objectContaining({
        courierId: 'courier-1',
        orderId: 'order-1',
        available: CourierAvailability.AVAILABLE,
        released: true,
      }),
    );
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        reservedForOrderId: null,
        available: CourierAvailability.AVAILABLE,
      }),
    );
  });

  it('rejects releasing a courier reserved for another order', async () => {
    courier.reservedForOrderId = 'order-2';

    await expect(
      service.releaseCourier('courier-1', 'order-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects release by another courier', async () => {
    await expect(
      service.releaseCourier('courier-1', 'order-1', {
        userId: 'user-2',
        email: 'courier-2@example.com',
        roles: ['courier'],
        ownerId: null,
        courierId: 'courier-2',
        costumerId: null,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects updates from another courier', async () => {
    await expect(
      service.setCourierAvailability('courier-1', 'courier-2', false),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns only available couriers nearby', async () => {
    const result = await service.findNearbyAvailable({
      latitude: -23.5,
      longitude: -46.6,
    });

    expect(result).toEqual([
      {
        courierId: 'courier-1',
        vehicleType: VehicleType.MOTO,
        distanceKm: 1.5,
      },
    ]);
  });

  it('rejects an invalid radius', async () => {
    await expect(
      service.findNearbyAvailable({
        latitude: -23.5,
        longitude: -46.6,
        radiusKm: 0,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns a courier profile without the password hash', async () => {
    repository.findOne.mockResolvedValue({
      ...courier,
      user: {
        id: 'user-1',
        firstName: 'Courier',
        lastName: 'One',
        email: 'courier@example.com',
        password: 'hash',
        status: 'active',
      },
    });

    const result = await service.findCourierById('courier-1');

    expect(result.user).toEqual(
      expect.objectContaining({ id: 'user-1', email: 'courier@example.com' }),
    );
    expect(
      (result.user as unknown as { password?: string }).password,
    ).toBeUndefined();
  });

  it('accepts a pending reservation owned by the courier', async () => {
    courier.available = CourierAvailability.UNAVAILABLE;
    courier.reservedForOrderId = 'order-1';
    courier.reservationStatus = CourierAssignmentStatus.PENDING;
    courier.reservationExpiresAt = new Date(Date.now() + 60_000);

    const result = await service.acceptAssignment(
      'courier-1',
      'courier-1',
      'order-1',
    );

    expect(result).toEqual(
      expect.objectContaining({
        courierId: 'courier-1',
        orderId: 'order-1',
        reservationStatus: CourierAssignmentStatus.ACCEPTED,
      }),
    );
    expect(courier.reservationStatus).toBe(CourierAssignmentStatus.ACCEPTED);
    expect(courier.reservationExpiresAt).toBeNull();
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      'courier.assignment.accepted',
      expect.objectContaining({
        courierId: 'courier-1',
        orderId: 'order-1',
      }),
      'user',
    );
  });

  it('rejects an expired reservation when accepting', async () => {
    courier.available = CourierAvailability.UNAVAILABLE;
    courier.reservedForOrderId = 'order-1';
    courier.reservationStatus = CourierAssignmentStatus.PENDING;
    courier.reservationExpiresAt = new Date(Date.now() - 1000);

    await expect(
      service.acceptAssignment('courier-1', 'courier-1', 'order-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      'courier.assignment.expired',
      expect.objectContaining({
        courierId: 'courier-1',
        orderId: 'order-1',
      }),
      'user',
    );
  });

  it('rejects and releases a reservation for the courier', async () => {
    courier.available = CourierAvailability.UNAVAILABLE;
    courier.reservedForOrderId = 'order-1';
    courier.reservationStatus = CourierAssignmentStatus.PENDING;

    const result = await service.rejectAssignment(
      'courier-1',
      'courier-1',
      'order-1',
      'sem tempo',
    );

    expect(result).toEqual(
      expect.objectContaining({
        courierId: 'courier-1',
        orderId: 'order-1',
        released: true,
      }),
    );
    expect(courier.reservedForOrderId).toBeNull();
    expect(courier.available).toBe(CourierAvailability.AVAILABLE);
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      'courier.assignment.rejected',
      { courierId: 'courier-1', orderId: 'order-1', reason: 'sem tempo' },
      'user',
    );
  });

  it('does not let another courier accept the reservation', async () => {
    courier.reservedForOrderId = 'order-1';

    await expect(
      service.acceptAssignment('courier-1', 'courier-2', 'order-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('releases pending reservations that passed the expiration', async () => {
    const expired = {
      ...courier,
      available: CourierAvailability.UNAVAILABLE,
      reservedForOrderId: 'order-1',
      reservationStatus: CourierAssignmentStatus.PENDING,
      reservationExpiresAt: new Date(Date.now() - 1000),
    } as Courier;
    repository.find.mockResolvedValue([expired]);

    const released = await service.releaseExpiredReservations();

    expect(released).toBe(1);
    expect(expired.reservedForOrderId).toBeNull();
    expect(expired.available).toBe(CourierAvailability.AVAILABLE);
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      'courier.assignment.expired',
      expect.objectContaining({
        courierId: 'courier-1',
        orderId: 'order-1',
      }),
      'user',
    );
  });
});
