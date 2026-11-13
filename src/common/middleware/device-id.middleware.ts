import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { HEADERS } from '../../config/constants';

/**
 * Stashes the client device id (x-device-id), generating a per-request fallback
 * when absent. Used by rate limiting (per device), contact-reveal caps and view
 * counters (architecture §5.7, DET-13, LST-17).
 */
@Injectable()
export class DeviceIdMiddleware implements NestMiddleware {
  use(req: any, _res: any, next: () => void): void {
    const incoming = (req.headers?.[HEADERS.DEVICE_ID] as string) ?? undefined;
    req.deviceId = incoming && /^[A-Za-z0-9_.:-]{4,128}$/.test(incoming) ? incoming : `anon-${randomUUID()}`;
    next();
  }
}
