import { paginationQuerySchema, encodeCursor, decodeCursor } from './pagination.dto';

describe('cursor pagination', () => {
  it('applies defaults when limit/cursor omitted', () => {
    const parsed = paginationQuerySchema.parse({});
    expect(parsed.limit).toBe(20);
    expect(parsed.cursor).toBeUndefined();
  });

  it('clamps the limit to the maximum', () => {
    const parsed = paginationQuerySchema.parse({ limit: 9999 });
    expect(parsed.limit).toBe(100);
  });

  it('clamps the limit to the minimum of 1', () => {
    const parsed = paginationQuerySchema.parse({ limit: 0 });
    expect(parsed.limit).toBe(1);
  });

  it('round-trips a cursor payload through encode/decode', () => {
    const payload = { id: 'abc-123', createdAt: '2026-01-01T00:00:00.000Z' };
    const encoded = encodeCursor(payload);
    expect(typeof encoded).toBe('string');
    expect(decodeCursor(encoded)).toEqual(payload);
  });

  it('returns null for an empty or malformed cursor', () => {
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor('')).toBeNull();
    expect(decodeCursor('!!!not-base64url!!!')).toBeNull();
  });
});
