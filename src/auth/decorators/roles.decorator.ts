import { SetMetadata } from '@nestjs/common';
import { Role } from '../../database/entities';

export const ROLES_KEY = 'roles';

/** Require one of the given roles to access the route. Use after JwtAuthGuard. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
