import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RATE_LIMIT_KEY, type RateLimitOptions } from '../decorators/rate-limit.decorator';
import { RedisService } from '../../redis/redis.service';
import { AppError } from '../errors/app-error';
import { ErrorCodes } from '../errors/error-codes';
import { getDeviceId } from '../request-context';
import { configuration } from '../../config/configuration';

/**
 * RateLimitGuard — Redis fixed-window counter per [controller:handler:scope].
 *
 * Key composition (AUTH-17, NFR-SEC-05):
 *   rl:{controllerClass}:{handlerName}:{ip}[:{deviceId}][:{userId}]
 *
 * The @RateLimit `scope` option restricts the key to a single dimension:
 *   'ip'      → rl:ctrl:handler:ip
 *   'account' → rl:ctrl:handler:ip:u:{userId}  (falls back to ip when no user)
 *   'device'  → rl:ctrl:handler:ip:{deviceId}  (falls back to ip when no device)
 *   default   → rl:ctrl:handler:ip[:{deviceId}][:{userId}]
 *
 * Degrades open (allow) when Redis is unavailable (NFR-REL-04).
 * Sends Retry-After and X-RateLimit-* headers only when a request is blocked (429).
 * X-RateLimit-Limit and X-RateLimit-Remaining are added on successful requests.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // If Redis is not ready, degrade open — health check reports it.
    if (this.redis.client.status !== 'ready') {
      return true;
    }

    const options = this.reflector.get<RateLimitOptions | undefined>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    );

    const windowSeconds = options?.windowSeconds ?? 60;
    const max = options?.max ?? configuration.RATE_LIMIT_DEFAULT_PER_MINUTE;
    const scope = options?.scope;

    const req = context.switchToHttp().getRequest<any>();
    const ip = this.resolveIp(req);
    const deviceId = getDeviceId(req); // undefined when header absent
    const account = (req.user as { id?: string } | undefined)?.id;

    // Build the controller:handler prefix.
    const ctrlName = context.getClass().name;
    const handlerName = context.getHandler().name;
    const prefix = `rl:${ctrlName}:${handlerName}`;

    // Build the identity suffix based on scope.
    let key: string;
    if (scope === 'ip') {
      key = `${prefix}:${ip}`;
    } else if (scope === 'account') {
      key = account ? `${prefix}:${ip}:u:${account}` : `${prefix}:${ip}`;
    } else if (scope === 'device') {
      key = deviceId ? `${prefix}:${ip}:d:${deviceId}` : `${prefix}:${ip}`;
    } else {
      // Default: IP + optional device + optional account
      const parts = [prefix, ip];
      if (deviceId) parts.push(`d:${deviceId}`);
      if (account) parts.push(`u:${account}`);
      key = parts.join(':');
    }

    try {
      const result = await this.redis.rateLimit(key, windowSeconds, max);
      const res = context.switchToHttp().getResponse<any>();

      if (!result.allowed) {
        // Set Retry-After on the 429 response BEFORE throwing.
        res.setHeader('Retry-After', String(result.retryAfter));
        res.setHeader('X-RateLimit-Limit', String(max));
        res.setHeader('X-RateLimit-Remaining', '0');
        throw AppError.rateLimited(ErrorCodes.RATE_LIMITED);
      }

      // Informational rate-limit headers on successful requests (no Retry-After).
      res.setHeader('X-RateLimit-Limit', String(max));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - result.count)));
      return true;
    } catch (err) {
      if (err instanceof AppError) throw err;
      // Redis error (e.g., timeout) → degrade open and log.
      this.logger.warn(`Rate-limit check skipped (Redis error): ${(err as Error).message}`);
      return true;
    }
  }

  private resolveIp(req: any): string {
    const fwd = (req.headers?.['x-forwarded-for'] as string | undefined) ?? '';
    const direct = fwd.split(',')[0]?.trim() ?? '';
    if (direct && /^[A-Za-z0-9.:[\]]{1,64}$/.test(direct)) return direct;
    return String(req.ip ?? 'unknown');
  }
}
