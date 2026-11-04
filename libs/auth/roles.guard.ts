import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthRole, AuthenticatedUser } from './auth.types';
import { ROLES_METADATA_KEY } from './roles.decorator';

interface AuthenticatedRequest {
  user?: AuthenticatedUser;
}

@Injectable()
export class RolesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const roles = (Reflect.getMetadata(
      ROLES_METADATA_KEY,
      context.getHandler(),
    ) ?? Reflect.getMetadata(ROLES_METADATA_KEY, context.getClass())) as
      | AuthRole[]
      | undefined;

    if (!roles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user?.roles.some((role) => roles.includes(role))) {
      throw new ForbiddenException('Permissao insuficiente');
    }

    return true;
  }
}
