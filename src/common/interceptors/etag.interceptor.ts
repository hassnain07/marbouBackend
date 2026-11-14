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
 * ETagInterceptor — computes a strong ETag from the serialised response payload
 * and handles the HTTP cache negotiation (architecture §5.5, NFR-NET-04).
 *
 * When the request carries `If-None-Match` matching the computed ETag, the
 * interceptor short-circuits with a 304 Not Modified (empty body).
 *
 * Apply to any route whose payload is deterministic: `@UseInterceptors(ETagInterceptor)`.
 * Also sets `Cache-Control: no-cache` so clients always revalidate; they just
 * skip re-downloading when the content hasn't changed.
 *
 * Skips streaming / attachment responses.
 */
@Injectable()
export class ETagInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((payload) => {
        if (res.headersSent) return payload;

        // Compute ETag from the JSON representation of the payload.
        const body = JSON.stringify(payload);
        const etag = `"${sha256(body)}"`;

        res.setHeader('ETag', etag);
        res.setHeader('Cache-Control', 'no-cache');

        const ifNoneMatch = req.headers['if-none-match'];
        if (ifNoneMatch && ifNoneMatch === etag) {
          res.status(304).end();
          // Returning undefined signals to NestJS that the response is complete.
          return undefined;
        }

        return payload;
      }),
    );
  }
}
