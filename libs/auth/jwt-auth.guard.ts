import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import jwt from 'jsonwebtoken';
import {
  AUTH_JWT,
  AuthRole,
  AuthTokenPayload,
  AuthenticatedUser,
  getAccessTokenSecret,
} from './auth.types';

interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthenticatedUser;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    const value = Array.isArray(header) ? header[0] : header;

    if (!value?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token de acesso ausente');
    }

    const token = value.slice('Bearer '.length).trim();

    if (!token) {
      throw new UnauthorizedException('Token de acesso ausente');
    }

    try {
      const payload = jwt.verify(token, getAccessTokenSecret(), {
        algorithms: [AUTH_JWT.algorithm],
        issuer: AUTH_JWT.issuer,
        audience: AUTH_JWT.audience,
      }) as AuthTokenPayload;

      if (payload.type !== 'access' || !payload.sub) {
        throw new UnauthorizedException('Token de acesso invalido');
      }

      request.user = {
        userId: payload.sub,
        email: payload.email,
        roles: payload.roles ?? [],
        ownerId: payload.ownerId ?? null,
        courierId: payload.courierId ?? null,
        costumerId: payload.costumerId ?? null,
      };

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Token de acesso invalido ou expirado');
    }
  }
}

export function hasAnyRole(
  user: AuthenticatedUser | undefined,
  roles: AuthRole[],
): boolean {
  return Boolean(user?.roles.some((role) => roles.includes(role)));
}
