import { isProduction } from '../config/env';

export const AUTH_ROLES = {
  OWNER: 'owner',
  COURIER: 'courier',
  COSTUMER: 'costumer',
} as const;

export type AuthRole = (typeof AUTH_ROLES)[keyof typeof AUTH_ROLES];

export interface AuthTokenPayload {
  sub: string;
  email: string;
  roles: AuthRole[];
  ownerId: string | null;
  courierId: string | null;
  costumerId: string | null;
  type: 'access';
  iss?: string;
  aud?: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedUser {
  userId: string;
  email: string;
  roles: AuthRole[];
  ownerId: string | null;
  courierId: string | null;
  costumerId: string | null;
}

export const AUTH_JWT = {
  issuer: 'restaurant-auth',
  audience: 'restaurant-services',
  algorithm: 'HS256' as const,
  secretEnv: 'JWT_ACCESS_TOKEN_SECRET',
  localDevelopmentSecret: 'restaurant-dev-access-secret-change-me',
} as const;

export function getAccessTokenSecret(): string {
  const value = process.env[AUTH_JWT.secretEnv]?.trim();

  if (value) {
    return value;
  }

  if (isProduction()) {
    throw new Error(
      `${AUTH_JWT.secretEnv} e obrigatorio em producao; defina um segredo forte e exclusivo por ambiente`,
    );
  }

  return AUTH_JWT.localDevelopmentSecret;
}

export function assertAuthConfiguration(): void {
  getAccessTokenSecret();
}
