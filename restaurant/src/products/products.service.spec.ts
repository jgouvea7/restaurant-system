import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ProductsService } from './products.service';
import { RestaurantAccessService } from '../restaurants/restaurant-access.service';

describe('ProductsService', () => {
  let service: ProductsService;
  let repository: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };
  let restaurantRepository: { findOne: jest.Mock };
  let restaurantAccess: { findByOwnerOrFail: jest.Mock };

  beforeEach(() => {
    repository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({
        id: 'product-1',
        name: 'Pizza',
        price: '10.00',
      }),
      create: jest.fn().mockImplementation((value) => value),
      save: jest.fn().mockImplementation((value) => Promise.resolve(value)),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    restaurantRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'restaurant-1' }),
    };

    const dataSource = {
      getRepository: jest.fn((entity) =>
        entity.name === 'Restaurant' ? restaurantRepository : repository,
      ),
    } as unknown as DataSource;

    restaurantAccess = {
      findByOwnerOrFail: jest.fn().mockResolvedValue({
        id: 'restaurant-1',
      }),
    };

    service = new ProductsService(
      dataSource,
      restaurantAccess as unknown as RestaurantAccessService,
    );
  });

  it('creates a product with a normalized price', async () => {
    const result = await service.create({
      name: 'Pizza',
      price: 10,
      restaurantId: 'restaurant-1',
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Pizza',
        price: '10.00',
        isAvailable: true,
        isActive: true,
      }),
    );
    expect(result).toEqual(expect.objectContaining({ price: '10.00' }));
  });

  it('rejects an invalid price', async () => {
    await expect(
      service.create({
        name: 'Pizza',
        price: -1,
        restaurantId: 'restaurant-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a product from an unknown restaurant', async () => {
    restaurantRepository.findOne.mockResolvedValue(null);

    await expect(
      service.create({
        name: 'Pizza',
        price: 10,
        restaurantId: 'unknown',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the removed product', async () => {
    const result = await service.remove('product-1');

    expect(repository.delete).toHaveBeenCalledWith('product-1');
    expect(result).toEqual(expect.objectContaining({ id: 'product-1' }));
  });

  it('checks restaurant ownership before creating', async () => {
    await service.createForOwner(
      {
        name: 'Pizza',
        price: 10,
        restaurantId: 'restaurant-1',
      },
      'owner-1',
    );

    expect(restaurantAccess.findByOwnerOrFail).toHaveBeenCalledWith(
      'restaurant-1',
      'owner-1',
    );
  });
});
