import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { userStatus } from './entities/user.entity';

describe('UsersService', () => {
  let service: UsersService;
  let repository: { findOne: jest.Mock };

  beforeEach(async () => {
    repository = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: DataSource,
          useValue: { getRepository: jest.fn().mockReturnValue(repository) },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('authenticates an active user and returns profile ids and roles', async () => {
    repository.findOne.mockResolvedValue({
      id: 'user-1',
      email: 'owner@example.com',
      firstName: 'Owner',
      lastName: 'One',
      password: await bcrypt.hash('secret', 4),
      status: userStatus.ACTIVE,
      owner: { id: 'owner-1' },
      courier: null,
      costumer: null,
    });

    const result = await service.authenticate({
      email: 'OWNER@example.com',
      password: 'secret',
    });

    expect(result).toEqual(
      expect.objectContaining({
        userId: 'user-1',
        email: 'owner@example.com',
        roles: ['owner'],
        ownerId: 'owner-1',
        courierId: null,
        costumerId: null,
      }),
    );
  });

  it('rejects an invalid password', async () => {
    repository.findOne.mockResolvedValue({
      id: 'user-1',
      email: 'owner@example.com',
      password: await bcrypt.hash('secret', 4),
      status: userStatus.ACTIVE,
      owner: { id: 'owner-1' },
    });

    await expect(
      service.authenticate({
        email: 'owner@example.com',
        password: 'wrong',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an inactive user', async () => {
    repository.findOne.mockResolvedValue({
      id: 'user-1',
      email: 'owner@example.com',
      password: await bcrypt.hash('secret', 4),
      status: userStatus.DESACTIVE,
      owner: { id: 'owner-1' },
    });

    await expect(
      service.authenticate({
        email: 'owner@example.com',
        password: 'secret',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
