import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AdminAuthContext } from '../guards/admin-jwt.guard';

/**
 * @CurrentAdmin() param decorator — extracts req.admin stamped by AdminJwtGuard.
 * Use with @UseGuards(AdminJwtGuard) or @AdminPermission(...).
 */
export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AdminAuthContext => {
    const req = ctx.switchToHttp().getRequest();
    return req.admin;
  },
);
