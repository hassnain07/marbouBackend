import { SetMetadata } from '@nestjs/common';
import { IS_OPTIONAL_AUTH_KEY } from '../guards/user-jwt.guard';

/**
 * @OptionalUserAuth() — attaches user context if a valid token is present but never
 * rejects unauthenticated requests. Used on guest-capable routes (browse, search, etc.).
 */
export const OptionalUserAuth = () => SetMetadata(IS_OPTIONAL_AUTH_KEY, true);
