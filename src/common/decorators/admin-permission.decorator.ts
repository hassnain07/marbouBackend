import { SetMetadata } from '@nestjs/common';
import type { AdminPermissionKey } from '../rbac/admin-permissions';

export const ADMIN_PERMISSION_KEY = 'adminPermission';

/**
 * @AdminPermission('config.flags.write') — the AdminJwtGuard verifies the
 * bearer token, checks the session is live + admin active, and enforces that
 * the admin's role is permitted for this key (architecture §5.8). Returns 401
 * for missing/invalid token and 403 for a valid token with the wrong role.
 */
export const AdminPermission = (key: AdminPermissionKey) =>
  SetMetadata(ADMIN_PERMISSION_KEY, key);
