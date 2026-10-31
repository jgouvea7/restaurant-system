import { Test, TestingModule } from '@nestjs/testing';
import { RestaurantAddressController } from './restaurant-address.controller';
import { RestaurantAddressService } from './restaurant-address.service';

describe('RestaurantAddressController', () => {
  let controller: RestaurantAddressController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RestaurantAddressController],
      providers: [RestaurantAddressService],
    }).compile();

    controller = module.get<RestaurantAddressController>(RestaurantAddressController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
