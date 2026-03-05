import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Use on routes that do not require authentication (e.g. login, health). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
