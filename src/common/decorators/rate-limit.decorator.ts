import { SetMetadata } from '@nestjs/common';

/** Per-route rate-limit overrides. Keys combine route + identity (IP/account/device)
 *  so limits are enforced per IP, per account and per device (AUTH-17, NFR-SEC-05). */
export interface RateLimitOptions {
  /** Window length in seconds. */
  windowSeconds: number;
  /** Maximum calls allowed within the window. */
  max: number;
  /** Optional scope restriction (default: ip+device). */
  scope?: 'ip' | 'account' | 'device';
}

export const RATE_LIMIT_KEY = 'rateLimit';
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);
