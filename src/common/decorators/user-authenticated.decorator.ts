import { applyDecorators, UseGuards } from '@nestjs/common';
import { UserJwtGuard } from '../guards/user-jwt.guard';

/**
 * @UserAuthenticated() — applied to routes that require a valid, active customer account.
 * Reject with 401 if no token; 403 if suspended/deactivated.
 */
export const UserAuthenticated = () => applyDecorators(UseGuards(UserJwtGuard));
