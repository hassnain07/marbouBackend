import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ModuleRef } from '@nestjs/core';
import { UserTokenService } from '../utils/user-jwt';
import { RedisService } from '../../redis/redis.service';
import { AppError } from '../errors/app-error';
import { ErrorCodes } from '../errors/error-codes';
import {
  USER_SESSION_CACHE_PREFIX,
  USER_ACTIVE_THROTTLE_PREFIX,
  USER_ACTIVE_THROTTLE_SECONDS,
} from '../../modules/auth/auth.constants';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

export const IS_OPTIONAL_AUTH_KEY = 'optionalAuth';
export const IS_REQUIRE_EMAIL_KEY = 'requireEmail';

export interface UserAuthContext {
  id: string;
  sessionId: string;
  status: string;
  statusReason: string | null;
  emailVerified: boolean;
}

/** Cache shape stored in Redis per session. */
interface CachedUserSession {
  valid: boolean;
  status?: string;
  statusReason?: string | null;
  emailVerified?: boolean;
}

const SESSION_CACHE_TTL = 30; // seconds

const cacheKey = (sid: string) => `${USER_SESSION_CACHE_PREFIX}${sid}`;

/** Invalidate one or more user session cache entries. */
export async function invalidateUserSessionCache(
  redis: { cacheInvalidate: (...keys: string[]) => Promise<void> },
  ...sessionIds: string[]
): Promise<void> {
  if (!sessionIds.length) return;
  const keys = sessionIds.map(cacheKey);
  await redis.cacheInvalidate(...keys);
}

/**
 * UserJwtGuard — deny-by-default guard for all customer routes.
 *
 * Routes decorated with @Public() skip authentication entirely.
 * Routes decorated with @OptionalUserAuth() attach user if token is valid but never reject.
 * All other routes require a valid user JWT (aud=marbou-user).
 *
 * Session cache (30 s TTL, explicitly invalidated on revoke/suspend/etc.) holds
 * {valid, status, statusReason, emailVerified} so the guard makes at most one DB
 * lookup on a miss.
 */
@Injectable()
export class UserJwtGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const isOptional = this.reflector.getAllAndOverride<boolean>(IS_OPTIONAL_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const req = context.switchToHttp().getRequest() as Request & { user?: UserAuthContext; ip?: string; headers: Record<string, string | string[] | undefined> };
    const authHeader = req.headers['authorization'];
    const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      if (isOptional) return true;
      throw AppError.unauthorized(ErrorCodes.UNAUTHORIZED);
    }

    const claims = UserTokenService.verifyAccessToken(token);
    if (!claims || !claims.sub || !claims.sid) {
      if (isOptional) return true;
      throw AppError.unauthorized(ErrorCodes.UNAUTHORIZED);
    }

    // Session cache lookup
    const cached = await this.redis.cacheAside<CachedUserSession>(
      cacheKey(claims.sid),
      SESSION_CACHE_TTL,
      async () => {
        // Lazy-import to avoid circular dep
        const { AuthRepository } = await import('../../modules/auth/auth.repository');
        const repo = this.moduleRef.get(AuthRepository, { strict: false });
        const result = await repo.validateSessionUser(claims.sid, claims.sub);
        if (!result) return { valid: false };
        return { valid: true, ...result };
      },
    );

    if (!cached.valid) {
      if (isOptional) return true;
      throw AppError.unauthorized(ErrorCodes.UNAUTHORIZED);
    }

    // Status check — suspended / deactivated accounts get 403 immediately
    if (cached.status && cached.status !== 'ACTIVE') {
      throw new AppError(ErrorCodes.ACCOUNT_SUSPENDED, 403, {
        message: cached.statusReason ?? 'Account suspended',
        details: cached.statusReason ? [{ issue: cached.statusReason }] : [],
      });
    }

    // Attach user context to request
    req.user = {
      id: claims.sub,
      sessionId: claims.sid,
      status: cached.status ?? 'ACTIVE',
      statusReason: cached.statusReason ?? null,
      emailVerified: cached.emailVerified ?? false,
    } satisfies UserAuthContext;

    // Throttled lastActiveAt update (at most every 5 min)
    this.updateLastActive(claims.sid).catch(() => {});

    return true;
  }

  private async updateLastActive(sessionId: string): Promise<void> {
    const throttleKey = `${USER_ACTIVE_THROTTLE_PREFIX}${sessionId}`;
    const existing = await this.redis.client.get(throttleKey);
    if (existing) return; // updated recently
    await this.redis.client.set(throttleKey, '1', 'EX', USER_ACTIVE_THROTTLE_SECONDS);
    // Lazy-import to avoid circular dep
    const { AuthRepository } = await import('../../modules/auth/auth.repository');
    const repo = this.moduleRef.get(AuthRepository, { strict: false });
    await repo.touchSessionLastActive(sessionId).catch(() => {});
  }
}
