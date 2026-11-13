import { z } from 'zod';
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '../../config/constants';

/** Cursor pagination query shape (architecture §5.3): `?limit=20&cursor=<opaque>`.
 *  The limit is clamped to [1, MAX_PAGE_LIMIT] so benign over-limit requests are
 *  honoured (capped) rather than rejected. Totals are only returned where cheap. */
export const paginationQuerySchema = z.object({
  limit: z
    .preprocess((v) => {
      const n = Number(v);
      if (Number.isNaN(n)) return v; // let zod report the type error
      return Math.min(Math.max(Math.trunc(n), 1), MAX_PAGE_LIMIT);
    }, z.number().int().min(1).max(MAX_PAGE_LIMIT))
    .default(DEFAULT_PAGE_LIMIT),
  cursor: z.string().optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Encode a cursor payload to an opaque base64url string. */
export function encodeCursor(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/** Decode an opaque cursor back to its payload (or null if invalid/empty). */
export function decodeCursor(cursor?: string): Record<string, unknown> | null {
  if (!cursor) return null;
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Metadata block returned in the success envelope. */
export interface ResponseMeta {
  requestId?: string;
  limit?: number;
  nextCursor?: string | null;
  total?: number;
}
