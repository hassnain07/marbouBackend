import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import { PAGINATION_MARKER, type SuccessEnvelope } from '../envelope';
import { getRequestId } from '../request-context';

/**
 * ResponseEnvelopeInterceptor — wraps every successful response in the standard
 * envelope (architecture §5.2):
 *   { success: true, data, meta: { requestId, ...pagination } }
 * A controller may return either a plain payload (→ data) or a `paginated(...)`
 * helper result (→ data + pagination meta). Streaming/binary responses bypass.
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<SuccessEnvelope> | Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const requestId = getRequestId(req) ?? '';
    const path: string = req?.url ?? '';

    // Swagger docs (UI + JSON) must return raw OpenAPI, not the envelope.
    if (path.startsWith('/api/docs')) {
      return next.handle();
    }

    // Let file/stream responses through untouched.
    const res = context.switchToHttp().getResponse();
    if (typeof res?.getHeader === 'function') {
      const disposition = res.getHeader('content-disposition');
      if (typeof disposition === 'string' && disposition.includes('attachment')) {
        return next.handle();
      }
    }

    return next.handle().pipe(
      map((payload) => {
        if (
          payload &&
          typeof payload === 'object' &&
          PAGINATION_MARKER in payload &&
          Array.isArray(payload.items)
        ) {
          const { items, __pagination } = payload as {
            items: unknown[];
            __pagination: Record<string, unknown>;
          };
          return {
            success: true,
            data: items,
            meta: { requestId, ...__pagination },
          } satisfies SuccessEnvelope;
        }
        return {
          success: true,
          data: payload,
          meta: { requestId },
        } satisfies SuccessEnvelope;
      }),
    );
  }
}
