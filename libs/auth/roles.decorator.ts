import { SetMetadata } from '@nestjs/common';
import { AuthRole } from './auth.types';

export const ROLES_METADATA_KEY = 'auth:roles';

export const Roles = (...roles: AuthRole[]) =>
  SetMetadata(ROLES_METADATA_KEY, roles);
