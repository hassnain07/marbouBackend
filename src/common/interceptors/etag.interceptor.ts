import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import { sha256 } from '../../common/utils/crypto';
import type { Request, Response } from 'express';

/**
 * ETagInterceptor — computes a strong ETag from the serialised payload and
 * handles HTTP cache negotiation (architecture §5.5, NFR-NET-04).
 *
 * When If-None-Match matches the computed ETag:
 *  1. We set res.statusCode = 304 on the Express response object.
 *  2. We return a special ETAG_304 sentinel so the ResponseEnvelopeInterceptor
 *     (which runs at a higher priority, i.e. wraps this one) knows to skip
 *     wrapping and let Express finish the empty 304 response.
 *
 * The sentinel approach avoids calling res.end() inside a map() operator, which
 * causes ERR_HTTP_HEADERS_SENT when NestJS also tries to serialise the return
 * value. Instead we signal 304 via the sentinel; the envelope interceptor detects
 * it and passes through, and NestJS serialises null which produces an empty 304.
 */

/** Sentinel value returned from ETagInterceptor to signal a 304. */
export const ETAG_304_SENTINEL = Symbol('ETAG_304');

@Injectable()
export class ETagInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((payload) => {
        if (res.headersSent) return payload;

        const body = JSON.stringify(payload);
        const etag = `"${sha256(body)}"`;

        res.setHeader('ETag', etag);
        res.setHeader('Cache-Control', 'no-cache');

        const ifNoneMatch = req.headers['if-none-match'];
        if (ifNoneMatch && ifNoneMatch === etag) {
          // Set 304 on the native response; return the sentinel so the
          // ResponseEnvelopeInterceptor knows to end the response without wrapping.
          res.status(304);
          return ETAG_304_SENTINEL;
        }

        return payload;
      }),
    );
  }
}
