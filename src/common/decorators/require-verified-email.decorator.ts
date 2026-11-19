import { SetMetadata, UseGuards, applyDecorators } from '@nestjs/common';
import { IS_REQUIRE_EMAIL_KEY, UserJwtGuard } from '../guards/user-jwt.guard';
import type { UserAuthContext } from '../guards/user-jwt.guard';
import { AppError } from '../errors/app-error';
import { ErrorCodes } from '../errors/error-codes';

/**
 * @RequireVerifiedEmail() — route must have an authenticated user with a verified email.
 * Returns 403 EMAIL_VERIFICATION_REQUIRED for browse-only accounts.
 * Applied after @UserAuthenticated() (or the guard already attached by the route).
 */
export const RequireVerifiedEmail = () =>
  applyDecorators(
    UseGuards(UserJwtGuard),
    SetMetadata(IS_REQUIRE_EMAIL_KEY, true),
  );

/**
 * Guard interceptor helper: call in routes that use @RequireVerifiedEmail().
 * We check the value that @UserAuthenticated already set on req.user.
 */
export function assertEmailVerified(user: UserAuthContext): void {
  if (!user.emailVerified) {
    throw AppError.forbidden(ErrorCodes.EMAIL_VERIFICATION_REQUIRED);
  }
}
