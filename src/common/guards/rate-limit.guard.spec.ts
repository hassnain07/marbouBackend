import { RateLimitGuard } from './rate-limit.guard';
import { AppError } from '../errors/app-error';
import { ErrorCodes } from '../errors/error-codes';

/** Minimal mock for the dependencies. */
function buildGuard(redisReady = true, rateLimitResult = { count: 1, allowed: true, retryAfter: 60 }) {
  const mockRedis = {
    client: { status: redisReady ? 'ready' : 'connecting' },
    rateLimit: jest.fn().mockResolvedValue(rateLimitResult),
  } as any;

  const mockReflector = {
    get: jest.fn().mockReturnValue(undefined), // no @RateLimit decoration
  } as any;

  const guard = new RateLimitGuard(mockReflector, mockRedis);
  return { guard, mockRedis, mockReflector };
}

function makeContext(overrides: { ip?: string; deviceId?: string; userId?: string } = {}): any {
  const headers: Record<string, string> = {};
  if (overrides.ip) headers['x-forwarded-for'] = overrides.ip;
  const req: any = { headers, ip: overrides.ip ?? '127.0.0.1' };
  if (overrides.deviceId) req.deviceId = overrides.deviceId;
  if (overrides.userId) req.user = { id: overrides.userId };
  const resHeaders: Record<string, string> = {};
  const res = { setHeader: (k: string, v: string) => { resHeaders[k] = v; }, _h: resHeaders };
  const Class = class TestCtrl {};
  const handler = function testHandler() {};
  return {
    getClass: () => Class,
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    _res: res,
    _req: req,
  };
}

describe('RateLimitGuard', () => {
  it('returns true (allow) when Redis is not ready', async () => {
    const { guard } = buildGuard(false);
    const ctx = makeContext();
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('returns true when within the rate limit', async () => {
    const { guard } = buildGuard(true, { count: 3, allowed: true, retryAfter: 60 });
    const ctx = makeContext({ ip: '10.0.0.1' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('throws RATE_LIMITED when count exceeds max', async () => {
    const { guard } = buildGuard(true, { count: 11, allowed: false, retryAfter: 45 });
    const ctx = makeContext({ ip: '10.0.0.1' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(AppError);
    try {
      await guard.canActivate(ctx);
    } catch (err) {
      expect((err as AppError).code).toBe(ErrorCodes.RATE_LIMITED);
      expect(ctx._res._h['Retry-After']).toBe('45');
    }
  });

  it('sets X-RateLimit headers on successful request', async () => {
    const { guard } = buildGuard(true, { count: 2, allowed: true, retryAfter: 60 });
    const ctx = makeContext({ ip: '10.0.0.2' });
    await guard.canActivate(ctx);
    expect(ctx._res._h['X-RateLimit-Limit']).toBeDefined();
    expect(ctx._res._h['X-RateLimit-Remaining']).toBeDefined();
    // Retry-After must NOT be set on a successful request.
    expect(ctx._res._h['Retry-After']).toBeUndefined();
  });

  it('degrades open (allow) when Redis throws', async () => {
    const mockRedis = {
      client: { status: 'ready' },
      rateLimit: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    } as any;
    const mockReflector = { get: jest.fn().mockReturnValue(undefined) } as any;
    const guard = new RateLimitGuard(mockReflector, mockRedis);
    const ctx = makeContext({ ip: '10.0.0.3' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('includes deviceId in key when present', async () => {
    const { guard, mockRedis } = buildGuard(true, { count: 1, allowed: true, retryAfter: 60 });
    const ctx = makeContext({ ip: '10.0.0.4', deviceId: 'my-device' });
    await guard.canActivate(ctx);
    const keyArg: string = mockRedis.rateLimit.mock.calls[0][0];
    expect(keyArg).toContain('d:my-device');
  });

  it('omits deviceId from key when absent', async () => {
    const { guard, mockRedis } = buildGuard(true, { count: 1, allowed: true, retryAfter: 60 });
    const ctx = makeContext({ ip: '10.0.0.5' });
    await guard.canActivate(ctx);
    const keyArg: string = mockRedis.rateLimit.mock.calls[0][0];
    expect(keyArg).not.toContain('d:');
  });
});
