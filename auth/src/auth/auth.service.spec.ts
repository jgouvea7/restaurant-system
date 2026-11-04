import { UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import jwt from 'jsonwebtoken';
import { AuthService } from './auth.service';
import { AuthSession } from './entities/auth-session.entity';

describe('AuthService', () => {
  let service: AuthService;
  let repository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let session: AuthSession;

  const user = {
    userId: 'user-1',
    email: 'owner@example.com',
    firstName: 'Owner',
    lastName: 'One',
    roles: ['owner'],
    ownerId: 'owner-1',
    courierId: null,
    costumerId: null,
  };

  beforeEach(() => {
    session = {
      id: 'session-1',
      userId: user.userId,
      email: user.email,
      roles: ['owner'],
      ownerId: user.ownerId,
      courierId: null,
      costumerId: null,
      refreshTokenHash: 'hash',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    repository = {
      findOne: jest.fn().mockResolvedValue(session),
      create: jest.fn().mockImplementation((value) => ({ ...value })),
      save: jest.fn().mockImplementation((value) => Promise.resolve(value)),
    };

    const dataSource = {
      getRepository: jest.fn().mockReturnValue(repository),
    } as unknown as DataSource;

    service = new AuthService(dataSource);

    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      status: 200,
      ok: true,
      json: jest.fn().mockResolvedValue(user),
    } as unknown as Response);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs in and stores a hashed refresh token', async () => {
    const result = await service.login({
      email: 'OWNER@example.com',
      password: 'secret',
    });

    const payload = jwt.decode(result.accessToken) as {
      sub: string;
      roles: string[];
    };

    expect(payload.sub).toBe('user-1');
    expect(payload.roles).toEqual(['owner']);
    expect(result.refreshToken).toHaveLength(64);
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        refreshTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it('rejects invalid credentials from the user service', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      status: 401,
      ok: false,
    } as Response);

    await expect(
      service.login({ email: 'owner@example.com', password: 'wrong' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rotates the refresh token', async () => {
    const login = await service.login({
      email: 'owner@example.com',
      password: 'secret',
    });

    const refreshed = await service.refresh({
      refreshToken: login.refreshToken,
    });

    expect(refreshed.refreshToken).not.toBe(login.refreshToken);
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        refreshTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it('revokes a refresh token on logout', async () => {
    session.expiresAt = new Date(Date.now() + 60_000);

    const result = await service.logout({ refreshToken: 'token' });

    expect(result.revoked).toBe(true);
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ revokedAt: expect.any(Date) }),
    );
  });
});
