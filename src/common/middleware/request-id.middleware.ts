import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { HEADERS } from '../../config/constants';

/**
 * Assigns (or honours) a per-request id and echoes it back in the response
 * header so clients can correlate logs/support tickets (architecture §3 request
 * lifecycle; SYS-09 observability).
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void): void {
    const incoming = (req.headers?.[HEADERS.REQUEST_ID] as string) ?? undefined;
    const requestId = incoming && /^[A-Za-z0-9_-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    req.requestId = requestId;
    res.setHeader(HEADERS.REQUEST_ID, requestId);
    next();
  }
}
