import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import { AdminRole } from '@prisma/client';
import { AdminTokenService } from '../utils/admin-jwt';
import { ADMIN_PERMISSION_KEY } from '../decorators/admin-permission.decorator';
import { can, type AdminPermissionKey } from '../rbac/admin-permissions';
import { AppError } from '../errors/app-error';
import { ErrorCodes } from '../errors/error-codes';

export interface AdminAuthContext {
  id: string;
  role: AdminRole;
  sessionId: string;
}

const SESSION_CACHE_TTL = 30; // seconds — short, so revocation lands fast
const cacheKey = (sid: string) => `admin:session:${sid}`;

/**
 * AdminJwtGuard — authenticates admin requests with a real admin JWT and enforces
 * RBAC via the permission map (architecture §5.7, §5.8, AUTH-20, ADM-17).
 *
 * On EVERY request it verifies:
 *  1. The Bearer token is a valid admin-audience JWT.
 *  2. The session (sid) exists, is not revoked, and has not expired.
 *  3. The admin is still active.
 * These checks are cached in Redis for ≤30s and the cache is invalidated on
 * revoke/deactivate, so a revoked session or deactivated admin fails IMMEDIATELY
 * (no 15-minute grace).
 *
 * Then enforces @AdminPermission(key): the admin's role must be permitted.
 *
 * Resolves RedisService + PrismaService via ModuleRef to keep common/ decoupled.
 */
@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly moduleRef: ModuleRef,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<any>();
    const auth = req.headers?.authorization as string | undefined;
    if (!auth || !auth.startsWith('Bearer ')) {
      throw AppError.unauthorized(ErrorCodes.UNAUTHORIZED, 'Missing admin token');
    }
    const token = auth.slice(7);
    const claims = AdminTokenService.verifyAccessToken(token);
    if (!claims) {
      throw AppError.unauthorized(ErrorCodes.UNAUTHORIZED, 'Invalid admin token');
    }

    // Resolve RedisService and PrismaService lazily.
    const { RedisService } = await import('../../redis/redis.service');
    const { PrismaService } = await import('../../prisma/prisma.service');
    const redis = this.moduleRef.get(RedisService, { strict: false });
    const prisma = this.moduleRef.get(PrismaService, { strict: false });

    // Validate the session + admin in one cache-aside lookup.
    const sessionValid = await redis.cacheAside<boolean>(
      cacheKey(claims.sid),
      SESSION_CACHE_TTL,
      async () => {
        const session = await prisma.adminSession.findUnique({
          where: { id: claims.sid },
        });
        if (!session) return false;
        if (session.revokedAt) return false;
        if (session.expiresAt.getTime() < Date.now()) return false;
        const admin = await prisma.adminUser.findUnique({
          where: { id: claims.sub },
          select: { isActive: true },
        });
        return admin?.isActive === true;
      },
    );
    if (!sessionValid) {
      throw AppError.unauthorized(ErrorCodes.ADM_SESSION_REVOKED, 'Session revoked or expired');
    }

    // IP allow-list check (ADM-18).
    const ip = resolveIp(req);
    const admin = await prisma.adminUser.findUnique({
      where: { id: claims.sub },
      select: { ipAllowList: true },
    });
    if (admin && admin.ipAllowList.length > 0 && !admin.ipAllowList.includes(ip)) {
      throw AppError.forbidden(ErrorCodes.ADM_IP_NOT_ALLOWED, 'IP not in allow-list');
    }

    // Stamp the admin context on the request for controllers/audit.
    req.admin = {
      id: claims.sub,
      role: claims.role as AdminRole,
      sessionId: claims.sid,
    } satisfies AdminAuthContext;

    // RBAC permission check.
    const perm = this.reflector.get<AdminPermissionKey | undefined>(
      ADMIN_PERMISSION_KEY,
      context.getHandler(),
    );
    if (perm && !can(claims.role as AdminRole, perm)) {
      throw AppError.forbidden(ErrorCodes.FORBIDDEN, 'Role not permitted for this action');
    }
    return true;
  }
}

/** Resolve the client IP (same logic as RateLimitGuard). */
function resolveIp(req: any): string {
  const fwd = (req.headers?.['x-forwarded-for'] as string | undefined) ?? '';
  const direct = fwd.split(',')[0]?.trim() ?? '';
  if (direct && /^[A-Za-z0-9.:[\]]{1,64}$/.test(direct)) return direct;
  return String(req.ip ?? 'unknown');
}

/** Invalidate the session cache — called by logout/revoke/deactivate. */
export function invalidateSessionCache(redis: { cacheInvalidate: (...k: string[]) => Promise<void> }, sessionId: string): Promise<void> {
  return redis.cacheInvalidate(cacheKey(sessionId));
}
