import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { UserAuthContext } from '../guards/user-jwt.guard';

/**
 * @CurrentUser() — extracts the authenticated user from req.user.
 * Only valid inside routes protected by @UserAuthenticated().
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserAuthContext => {
    const req = ctx.switchToHttp().getRequest();
    return req.user as UserAuthContext;
  },
);
