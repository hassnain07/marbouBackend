import { SetMetadata } from '@nestjs/common';

/**
 * Marker decorator for routes that require admin authentication but NO specific permission.
 *
 * Used ONLY by:
 * - GET /admin/auth/me
 * - POST /admin/auth/logout
 *
 * All other admin routes MUST use @AdminPermission (deny-by-default, A2).
 *
 * The AdminJwtGuard checks for either @AdminAuthenticated OR @AdminPermission metadata.
 * Routes with neither are rejected with 403.
 */
export const ADMIN_AUTHENTICATED_KEY = 'admin:authenticated';

export const AdminAuthenticated = () => SetMetadata(ADMIN_AUTHENTICATED_KEY, true);
