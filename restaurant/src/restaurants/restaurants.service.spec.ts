import { Test, TestingModule } from '@nestjs/testing';
import { GeolocationService } from '@restaurant/geolocation';
import { DataSource } from 'typeorm';
import { RestaurantsService } from './restaurants.service';

describe('RestaurantsService', () => {
  let service: RestaurantsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RestaurantsService,
        { provide: DataSource, useValue: {} },
        { provide: GeolocationService, useValue: {} },
      ],
    }).compile();

    service = module.get<RestaurantsService>(RestaurantsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
