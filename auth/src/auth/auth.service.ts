import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import {
  AUTH_JWT,
  AuthenticatedUser,
  getAccessTokenSecret,
} from '@restaurant/geolocation';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthSession } from './entities/auth-session.entity';

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: AuthenticatedUser;
}

@Injectable()
export class AuthService {
  constructor(private readonly dataSource: DataSource) {}

  async login(loginDto: LoginDto): Promise<TokenResponse> {
    const email = loginDto.email?.trim().toLowerCase();

    if (!email || !loginDto.password) {
      throw new BadRequestException('email e password sao obrigatorios');
    }

    const user = await this.validateCredentials(email, loginDto.password);

    if (user.roles.length === 0) {
      throw new ForbiddenException('Usuario sem perfil de acesso');
    }

    return this.createSession(user);
  }

  async refresh(refreshTokenDto: RefreshTokenDto): Promise<TokenResponse> {
    const token = refreshTokenDto.refreshToken?.trim();

    if (!token) {
      throw new BadRequestException('refreshToken e obrigatorio');
    }

    const repository = this.dataSource.getRepository(AuthSession);
    const session = await repository.findOne({
      where: { refreshTokenHash: this.hashToken(token) },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException('Refresh token invalido ou expirado');
    }

    const user: AuthenticatedUser = {
      userId: session.userId,
      email: session.email,
      roles: session.roles,
      ownerId: session.ownerId,
      courierId: session.courierId,
      costumerId: session.costumerId,
    };

    const rotated = this.buildTokens(user);
    session.refreshTokenHash = this.hashToken(rotated.response.refreshToken);
    session.expiresAt = rotated.refreshExpiresAt;

    await repository.save(session);

    return rotated.response;
  }

  async logout(refreshTokenDto: RefreshTokenDto) {
    const token = refreshTokenDto.refreshToken?.trim();

    if (!token) {
      throw new BadRequestException('refreshToken e obrigatorio');
    }

    const repository = this.dataSource.getRepository(AuthSession);
    const session = await repository.findOne({
      where: { refreshTokenHash: this.hashToken(token) },
    });

    if (session && !session.revokedAt) {
      session.revokedAt = new Date();
      await repository.save(session);
    }

    return { revoked: true };
  }

  private async createSession(
    user: AuthenticatedUser,
  ): Promise<TokenResponse> {
    const { response, refreshTokenHash, refreshExpiresAt } =
      this.buildTokens(user);

    const repository = this.dataSource.getRepository(AuthSession);
    const session = repository.create({
      userId: user.userId,
      email: user.email,
      roles: user.roles,
      ownerId: user.ownerId,
      courierId: user.courierId,
      costumerId: user.costumerId,
      refreshTokenHash,
      expiresAt: refreshExpiresAt,
      revokedAt: null,
    });

    await repository.save(session);

    return response;
  }

  private buildTokens(user: AuthenticatedUser): {
    response: TokenResponse;
    refreshTokenHash: string;
    refreshExpiresAt: Date;
  } {
    const accessTtl = this.readTtl('ACCESS_TOKEN_TTL_SECONDS', 900);
    const refreshTtl = this.readTtl('REFRESH_TOKEN_TTL_SECONDS', 604800);
    const accessToken = jwt.sign(
      {
        email: user.email,
        roles: user.roles,
        ownerId: user.ownerId,
        courierId: user.courierId,
        costumerId: user.costumerId,
        type: 'access',
      },
      getAccessTokenSecret(),
      {
        subject: user.userId,
        expiresIn: accessTtl,
        algorithm: AUTH_JWT.algorithm,
        issuer: AUTH_JWT.issuer,
        audience: AUTH_JWT.audience,
      },
    );
    const refreshToken = randomBytes(48).toString('base64url');

    return {
      response: {
        accessToken,
        refreshToken,
        tokenType: 'Bearer',
        expiresIn: accessTtl,
        user,
      },
      refreshTokenHash: this.hashToken(refreshToken),
      refreshExpiresAt: new Date(Date.now() + refreshTtl * 1000),
    };
  }

  private async validateCredentials(
    email: string,
    password: string,
  ): Promise<AuthenticatedUser> {
    const baseUrl = (
      process.env.USER_SERVICE_URL ?? 'http://floci:8080'
    ).replace(/\/$/, '');

    let response: Response;

    try {
      response = await fetch(`${baseUrl}/users/authenticate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new ServiceUnavailableException(
        'Nao foi possivel consultar o servico de usuarios',
      );
    }

    if (response.status === 401) {
      throw new UnauthorizedException('Credenciais invalidas');
    }

    if (!response.ok) {
      throw new InternalServerErrorException(
        `Erro ao validar credenciais: ${response.status}`,
      );
    }

    const user = (await response.json()) as AuthenticatedUser;

    if (
      !user.userId ||
      !user.email ||
      !Array.isArray(user.roles) ||
      user.roles.length === 0
    ) {
      throw new InternalServerErrorException(
        'Resposta invalida do servico de usuarios',
      );
    }

    return user;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private readTtl(envName: string, fallback: number): number {
    const value = Number(process.env[envName] ?? fallback);
    return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
  }
}
