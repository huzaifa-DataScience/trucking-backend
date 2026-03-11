import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { RequestUser } from '../strategies/jwt.strategy';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredPermissions?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as RequestUser | undefined;
    if (!user) {
      throw new ForbiddenException('Not authenticated');
    }
    const userPerms = user.permissions ?? [];
    const hasOne = requiredPermissions.some((p) => userPerms.includes(p));
    if (!hasOne) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
