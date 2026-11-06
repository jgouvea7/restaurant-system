import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RestaurantAccessService } from './restaurant-access.service';

describe('RestaurantAccessService', () => {
  let service: RestaurantAccessService;
  let repository: {
    findOne: jest.Mock;
    count: jest.Mock;
    find: jest.Mock;
  };

  beforeEach(() => {
    repository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'restaurant-1',
        ownerUserId: 'owner-1',
      }),
      count: jest.fn().mockResolvedValue(1),
      find: jest.fn().mockResolvedValue([{ id: 'restaurant-1' }]),
    };

    const dataSource = {
      getRepository: jest.fn().mockReturnValue(repository),
    } as unknown as DataSource;

    service = new RestaurantAccessService(dataSource);
  });

  it('returns the restaurant for its owner', async () => {
    await expect(
      service.findByOwnerOrFail('restaurant-1', 'owner-1'),
    ).resolves.toEqual(expect.objectContaining({ id: 'restaurant-1' }));
  });

  it('rejects an owner without link', async () => {
    await expect(
      service.findByOwnerOrFail('restaurant-1', null),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a restaurant from another owner', async () => {
    await expect(
      service.findByOwnerOrFail('restaurant-1', 'owner-2'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an unknown restaurant', async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(
      service.findByOwnerOrFail('restaurant-1', 'owner-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reports ownership as a boolean', async () => {
    await expect(
      service.isOwnedBy('restaurant-1', 'owner-1'),
    ).resolves.toBe(true);

    repository.count.mockResolvedValue(0);

    await expect(
      service.isOwnedBy('restaurant-1', 'owner-2'),
    ).resolves.toBe(false);
    await expect(service.isOwnedBy('restaurant-1', null)).resolves.toBe(false);
  });

  it('lists restaurant ids for an owner', async () => {
    await expect(service.listIdsByOwner('owner-1')).resolves.toEqual([
      'restaurant-1',
    ]);
    await expect(service.listIdsByOwner(null)).resolves.toEqual([]);
  });
});
