import { Test, TestingModule } from '@nestjs/testing';
import { GeolocationService } from '@restaurant/geolocation';
import { RestaurantAddressService } from './restaurant-address.service';

describe('RestaurantAddressService', () => {
  let service: RestaurantAddressService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RestaurantAddressService,
        { provide: GeolocationService, useValue: {} },
      ],
    }).compile();

    service = module.get<RestaurantAddressService>(RestaurantAddressService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
