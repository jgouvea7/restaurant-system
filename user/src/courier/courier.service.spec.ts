import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ElastiCacheService, EventPublisherService } from '@restaurant/aws';
import { CourierService } from './courier.service';
import {
  Courier,
  CourierAvailability,
  VehicleType,
} from './entities/courier.entity';

describe('CourierService', () => {
  let service: CourierService;
  let repository: {
    findOne: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
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
  } as Courier;

  beforeEach(() => {
    repository = {
      findOne: jest.fn().mockResolvedValue(courier),
      save: jest.fn().mockImplementation((value) => Promise.resolve(value)),
      find: jest.fn().mockResolvedValue([
        { courierId: 'courier-1', vehicleType: VehicleType.MOTO },
      ]),
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
    const result = await service.updateLocation('courier-1', -23.5, -46.6);

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
      service.updateLocation('courier-1', 120, -46.6),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns a service unavailable error when Redis fails', async () => {
    elastiCacheService.addLocation.mockRejectedValue(
      new Error('connection refused'),
    );

    await expect(
      service.updateLocation('courier-1', -23.5, -46.6),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('sets availability in the database and Redis', async () => {
    const result = await service.setCourierAvailability('courier-1', false);

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
});
