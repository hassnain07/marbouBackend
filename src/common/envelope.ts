/** Helpers for controllers to return data with the right envelope semantics.
 *  The ResponseEnvelopeInterceptor unwraps these into { success, data, meta }. */

/** A cursor-paginated payload: `items` become `data`, the rest become `meta`. */
export interface PaginatedResult<T> {
  items: T[];
  __pagination: {
    nextCursor?: string | null;
    limit?: number;
    total?: number;
  };
}

/** Build a cursor-paginated result. The interceptor unwraps it. */
export function paginated<T>(
  items: T[],
  opts: { nextCursor?: string | null; limit?: number; total?: number } = {},
): PaginatedResult<T> {
  return {
    items,
    __pagination: {
      nextCursor: opts.nextCursor ?? null,
      limit: opts.limit,
      total: opts.total,
    },
  };
}

/** Marker used by the interceptor to detect a paginated payload. */
export const PAGINATION_MARKER = '__pagination';

/** Success envelope shape returned to clients. */
export interface SuccessEnvelope<T = unknown> {
  success: true;
  data: T;
  meta: { requestId: string; [k: string]: unknown };
}

/** Error envelope shape returned to clients. */
export interface ErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: { field?: string; issue: string }[];
    traceId?: string;
  };
}
