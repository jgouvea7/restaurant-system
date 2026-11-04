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
  defaultSecret: 'restaurant-dev-access-secret-change-me',
} as const;

export function getAccessTokenSecret(): string {
  return process.env[AUTH_JWT.secretEnv] ?? AUTH_JWT.defaultSecret;
}
