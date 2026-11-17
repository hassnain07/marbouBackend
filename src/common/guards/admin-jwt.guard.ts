import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AdminRole } from '@prisma/client';
import * as jwt from 'jsonwebtoken';
import { loadEnv } from '../../config/configuration';
import { ADMIN_PERMISSION_KEY } from '../decorators/admin-permission.decorator';
import { ADMIN_AUTHENTICATED_KEY } from '../decorators/admin-authenticated.decorator';
import { can, type AdminPermissionKey } from '../rbac/admin-permissions';
import { AppError } from '../errors/app-error';
import { ErrorCodes } from '../errors/error-codes';
import { getClientIp } from '../utils/client-ip';

export interface AdminAuthContext {
  id: string;
  role: AdminRole;
  sessionId: string;
}

interface AdminJwtPayload {
  sub: string; // adminId
  role: AdminRole;
  sid: string; // sessionId
  aud: string;
  iss: string;
  iat: number;
  exp: number;
}

interface CachedSessionData {
  valid: boolean;
  role?: AdminRole;
  ipAllowList?: string[];
}

const SESSION_CACHE_TTL = 30; // seconds — short, so revocation lands fast (A1)
const cacheKey = (sid: string) => `admin:session:${sid}`;

/**
 * AdminJwtGuard — authenticates admin requests with a real admin JWT and enforces
 * RBAC via the permission map (architecture §5.7, §5.8, AUTH-20, ADM-17).
 *
 * On EVERY request it verifies:
 *  1. The Bearer token is a valid admin-audience JWT with strict validation (A8).
 *  2. The session (sid) exists, is not revoked, and has not expired.
 *  3. The admin is still active.
 *  4. The client IP is in the admin's allow-list (if set).
 *  5. The route has @AdminPermission OR @AdminAuthenticated (deny-by-default, A2).
 *
 * Session validity is cached in Redis for ≤30s with immediate invalidation on
 * revoke/deactivate (A1), so a revoked session or deactivated admin fails
 * immediately (no 15-minute grace from JWT exp).
 *
 * Uses getClientIp() respecting TRUSTED_PROXY_HOPS (A6).
 * Uses DB role from cache, not JWT claim (A2).
 * All Prisma access is in the repository layer (A11) — this guard calls the repo.
 *
 * Resolves RedisService + AdminAuthRepository via ModuleRef to keep common/ decoupled.
 */
@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly moduleRef: ModuleRef,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { admin?: AdminAuthContext }>();

    // A2: Deny-by-default — route MUST have @AdminPermission OR @AdminAuthenticated.
    const hasPermission = this.reflector.getAllAndOverride<AdminPermissionKey | undefined>(
      ADMIN_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    const hasAuthenticated = this.reflector.getAllAndOverride<boolean | undefined>(
      ADMIN_AUTHENTICATED_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!hasPermission && !hasAuthenticated) {
      throw AppError.forbidden(
        ErrorCodes.FORBIDDEN,
        'Route requires @AdminPermission or @AdminAuthenticated',
      );
    }

    // Extract and verify JWT token (A8: strict validation)
    const auth = req.headers?.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      throw AppError.unauthorized(ErrorCodes.UNAUTHORIZED, 'Missing admin token');
    }

    const token = auth.slice(7);
    const claims = this.verifyToken(token);

    // Resolve RedisService and AdminAuthRepository lazily
    const { RedisService } = await import('../../redis/redis.service');
    const { AdminAuthRepository } = await import('../../modules/admin-auth/admin-auth.repository');
    const redis = this.moduleRef.get(RedisService, { strict: false });
    const adminRepo = this.moduleRef.get(AdminAuthRepository, { strict: false });

    // Validate the session + admin with cache-aside (A1: cached, invalidated on revoke)
    const sessionData = await redis.cacheAside<CachedSessionData>(
      cacheKey(claims.sid),
      SESSION_CACHE_TTL,
      async () => {
        const result = await adminRepo.validateSessionAndAdmin(claims.sid, claims.sub);
        if (!result) {
          return { valid: false };
        }
        return {
          valid: true,
          role: result.role,
          ipAllowList: result.ipAllowList,
        };
      },
    );

    if (!sessionData.valid) {
      throw AppError.unauthorized(
        ErrorCodes.ADM_SESSION_REVOKED,
        'Session revoked or admin inactive',
      );
    }

    // A6: IP allow-list check using getClientIp
    const env = loadEnv();
    const clientIp = getClientIp(req, env.TRUSTED_PROXY_HOPS);

    if (sessionData.ipAllowList && sessionData.ipAllowList.length > 0) {
      if (!sessionData.ipAllowList.includes(clientIp)) {
        throw AppError.forbidden(ErrorCodes.ADM_IP_NOT_ALLOWED, 'IP not in allow-list');
      }
    }

    // Stamp the admin context on the request for controllers/audit
    // A2: Use DB role from cache, not JWT claim
    req.admin = {
      id: claims.sub,
      role: sessionData.role!,
      sessionId: claims.sid,
    } satisfies AdminAuthContext;

    // RBAC permission check (only if @AdminPermission is present)
    if (hasPermission && !can(sessionData.role!, hasPermission)) {
      throw AppError.forbidden(
        ErrorCodes.FORBIDDEN,
        'Role not permitted for this action',
      );
    }

    return true;
  }

  /**
   * Verify admin JWT token with strict validation (A8).
   * Enforces: HS256 algorithm, correct issuer, correct audience.
   */
  private verifyToken(token: string): AdminJwtPayload {
    try {
      const env = loadEnv();
      const payload = jwt.verify(token, env.ADMIN_JWT_SECRET, {
        algorithms: ['HS256'],
        issuer: 'marbou',
        audience: 'marbou-admin',
      }) as AdminJwtPayload;

      return payload;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw AppError.unauthorized(ErrorCodes.UNAUTHORIZED, 'Admin token expired');
      }
      if (err instanceof jwt.JsonWebTokenError) {
        throw AppError.unauthorized(ErrorCodes.UNAUTHORIZED, 'Invalid admin token');
      }
      throw AppError.unauthorized(ErrorCodes.UNAUTHORIZED, 'Token verification failed');
    }
  }
}

/**
 * Invalidate the session cache — called by logout/revoke/deactivate (A1).
 * Pass an array of session IDs to invalidate multiple at once.
 */
export async function invalidateSessionCache(
  redis: { cacheInvalidate: (...keys: string[]) => Promise<void> },
  ...sessionIds: string[]
): Promise<void> {
  const keys = sessionIds.map((sid) => cacheKey(sid));
  await redis.cacheInvalidate(...keys);
}
