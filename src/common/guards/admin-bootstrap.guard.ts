import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { configuration } from '../../config/configuration';
import { AppError } from '../errors/app-error';
import { ErrorCodes } from '../errors/error-codes';
import { HEADERS } from '../../config/constants';

export interface BootstrapAdmin {
  id: string;
  role: 'SUPER_ADMIN';
}

/**
 * AdminBootstrapGuard — TEMPORARY admin protection for Phase 1 (architecture
 * §1 task 6: "Temporary dev-only bootstrap-admin header/seed (replaced by real
 * admin auth in Phase 2)").
 *
 * Accepts an `x-admin-bootstrap-key` header matching env ADMIN_BOOTSTRAP_KEY and
 * stamps `req.admin = { id: 'bootstrap', role: 'SUPER_ADMIN' }`. Forbidden in
 * production (the real AdminJwtGuard + TOTP 2FA replaces this in Phase 2).
 *
 * TODO(phase-2): replace with AdminJwtGuard (TOTP-verified admin sessions).
 */
@Injectable()
export class AdminBootstrapGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    // Never available in production — real admin auth lands in Phase 2.
    if (configuration.NODE_ENV === 'production') {
      throw AppError.forbidden(ErrorCodes.FORBIDDEN, 'Admin bootstrap is disabled in production');
    }
    const req = context.switchToHttp().getRequest<any>();
    const provided = (req.headers?.[HEADERS.ADMIN_BOOTSTRAP_KEY] as string | undefined) ?? '';
    const expected = configuration.ADMIN_BOOTSTRAP_KEY;
    if (!provided || !expected || provided !== expected) {
      throw AppError.unauthorized(ErrorCodes.UNAUTHORIZED, 'Invalid admin bootstrap key');
    }
    req.admin = { id: 'bootstrap', role: 'SUPER_ADMIN' } satisfies BootstrapAdmin;
    return true;
  }
}
