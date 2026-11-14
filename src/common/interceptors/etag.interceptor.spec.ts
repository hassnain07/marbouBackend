import { of } from 'rxjs';
import { lastValueFrom } from 'rxjs';
import { ETagInterceptor, ETAG_304_SENTINEL } from './etag.interceptor';
import { sha256 } from '../utils/crypto';

function makeCtx(ifNoneMatch?: string) {
  const headers: Record<string, string | undefined> = {};
  if (ifNoneMatch) headers['if-none-match'] = ifNoneMatch;

  const resHeaders: Record<string, string> = {};
  let statusCode = 200;
  const res = {
    setHeader: (k: string, v: string) => { resHeaders[k] = v; },
    status: (code: number) => { statusCode = code; return res; },
    end: jest.fn(),
    get headersSent() { return false; },
    _h: resHeaders,
    get _status() { return statusCode; },
  };
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
      getResponse: () => res,
    }),
    getClass: () => class C {},
    getHandler: () => (() => {}),
    _res: res,
  } as any;
}

describe('ETagInterceptor', () => {
  const interceptor = new ETagInterceptor();
  const payload = { success: true, data: { foo: 'bar' }, meta: { requestId: 'x' } };

  it('sets ETag and Cache-Control on new request', async () => {
    const ctx = makeCtx();
    const result = await lastValueFrom(interceptor.intercept(ctx, { handle: () => of(payload) }));
    expect(ctx._res._h['ETag']).toMatch(/^"[0-9a-f]{64}"$/);
    expect(ctx._res._h['Cache-Control']).toBe('no-cache');
    expect(result).toEqual(payload);
  });

  it('sets status 304 and returns the ETAG_304 sentinel when If-None-Match matches', async () => {
    const body = JSON.stringify(payload);
    const etag = `"${sha256(body)}"`;
    const ctx = makeCtx(etag);
    const result = await lastValueFrom(interceptor.intercept(ctx, { handle: () => of(payload) }));
    expect(ctx._res._status).toBe(304);
    // The ETag interceptor returns the sentinel; the ResponseEnvelopeInterceptor
    // is responsible for calling res.end() when it sees this sentinel.
    expect(result).toBe(ETAG_304_SENTINEL);
  });

  it('returns 200 when If-None-Match does not match', async () => {
    const ctx = makeCtx('"stale-etag"');
    const result = await lastValueFrom(interceptor.intercept(ctx, { handle: () => of(payload) }));
    expect(result).toEqual(payload);
    expect(ctx._res._status).toBe(200);
  });
});
