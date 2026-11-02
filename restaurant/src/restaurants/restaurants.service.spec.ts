import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GeolocationService } from '@restaurant/geolocation';
import {
  ElastiCacheService,
  EventPublisherService,
} from '@restaurant/aws';
import { DataSource } from 'typeorm';
import { RestaurantsService } from './restaurants.service';

describe('RestaurantsService', () => {
  let service: RestaurantsService;
  let repository: { find: jest.Mock; findOne: jest.Mock; delete: jest.Mock };
  let elastiCacheService: {
    findNearby: jest.Mock;
    addLocation: jest.Mock;
    removeLocation: jest.Mock;
  };

  beforeEach(async () => {
    repository = {
      find: jest.fn().mockResolvedValue([
        { id: 'restaurant-1', name: 'Restaurante' },
      ]),
      findOne: jest.fn().mockResolvedValue({
        id: 'restaurant-1',
        name: 'Restaurante',
      }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const dataSource = {
      getRepository: jest.fn().mockReturnValue(repository),
    } as unknown as DataSource;

    elastiCacheService = {
      findNearby: jest
        .fn()
        .mockResolvedValue([{ member: 'restaurant-1', distanceKm: 2.4 }]),
      addLocation: jest.fn().mockResolvedValue(1),
      removeLocation: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RestaurantsService,
        { provide: DataSource, useValue: dataSource },
        { provide: GeolocationService, useValue: {} },
        {
          provide: ElastiCacheService,
          useValue: elastiCacheService,
        },
        {
          provide: EventPublisherService,
          useValue: { publish: jest.fn().mockResolvedValue('event-id') },
        },
      ],
    }).compile();

    service = module.get<RestaurantsService>(RestaurantsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns nearby restaurants with distance', async () => {
    const result = await service.findNearby({
      latitude: -23.5,
      longitude: -46.6,
    });

    expect(elastiCacheService.findNearby).toHaveBeenCalledWith(
      'restaurants:geo',
      {
        latitude: -23.5,
        longitude: -46.6,
        radiusKm: 5,
        limit: 20,
      },
    );
    expect(result).toEqual([
      { id: 'restaurant-1', name: 'Restaurante', distanceKm: 2.4 },
    ]);
  });

  it('rejects an invalid latitude', async () => {
    await expect(
      service.findNearby({ latitude: 91, longitude: -46.6 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('removes the restaurant from Redis when deleting', async () => {
    await service.remove('restaurant-1');

    expect(repository.delete).toHaveBeenCalledWith('restaurant-1');
    expect(elastiCacheService.removeLocation).toHaveBeenCalledWith(
      'restaurants:geo',
      'restaurant-1',
    );
  });
});
