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
 * RateLimitGuard — Redis-backed fixed-window counters keyed by IP (and account/
 * device when auth is present). Reads the `@RateLimit` decorator for per-route
 * overrides; falls back to the env-configured default (§5.7, AUTH-17, NFR-SEC-05).
 * Responds with RATE_LIMITED (429) and Retry-After when the limit is exceeded.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.get<RateLimitOptions>(RATE_LIMIT_KEY, context.getHandler());
    const req = context.switchToHttp().getRequest<any>();

    // If Redis isn't connected, degrade open rather than stalling every request
    // on retry backoff (NFR-REL-04). Health checks still report Redis as down.
    if (this.redis.client.status !== 'ready') {
      return true;
    }

    const windowSeconds = options?.windowSeconds ?? 60;
    const max = options?.max ?? configuration.RATE_LIMIT_DEFAULT_PER_MINUTE;

    const ip = this.resolveIp(req);
    const device = getDeviceId(req) ?? 'anon';
    const account = (req.user as { id?: string } | undefined)?.id;

    const parts = ['rl', context.getHandler().name, ip, device];
    if (account) parts.push(`u:${account}`);
    const key = parts.join(':');

    try {
      const result = await this.redis.rateLimit(key, windowSeconds, max);
      if (!result.allowed) {
        throw AppError.rateLimited(
          ErrorCodes.RATE_LIMITED,
        );
      }
      // Stamp the response headers so clients can back off intelligently.
      const res = context.switchToHttp().getResponse();
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - result.count));
      res.setHeader('Retry-After', String(result.retryAfter));
      return true;
    } catch (err) {
      if (err instanceof AppError) throw err;
      // Redis unavailable → degrade open (don't block all traffic on a cache
      // failure, NFR-REL-04) but log it so ops sees the outage.
      this.logger.warn(`Rate-limit check skipped (Redis unavailable): ${(err as Error).message}`);
      return true;
    }
  }

  private resolveIp(req: any): string {
    const fwd = (req.headers?.['x-forwarded-for'] as string) ?? '';
    const direct = fwd.split(',')[0]?.trim();
    if (direct && /^[A-Za-z0-9.:]{1,64}$/.test(direct)) return direct;
    return String(req.ip ?? 'unknown');
  }
}
