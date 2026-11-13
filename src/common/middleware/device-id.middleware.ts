import { Injectable, type NestMiddleware } from '@nestjs/common';
import { HEADERS } from '../../config/constants';

/**
 * DeviceIdMiddleware — stashes a valid x-device-id header value on the request.
 * When no (or an invalid) header is sent, req.deviceId is left undefined; the
 * RateLimitGuard then keys by IP only.  We must NOT invent a random id per
 * request: a new UUID each time defeats per-device rate-limiting and
 * contact-reveal caps (DET-13, LST-17, NFR-SEC-05).
 */
@Injectable()
export class DeviceIdMiddleware implements NestMiddleware {
  use(req: any, _res: any, next: () => void): void {
    const incoming = (req.headers?.[HEADERS.DEVICE_ID] as string | undefined) ?? '';
    if (incoming && /^[A-Za-z0-9_.:-]{4,128}$/.test(incoming)) {
      req.deviceId = incoming;
    }
    // If absent/invalid, req.deviceId stays undefined — guards key by IP only.
    next();
  }
}
