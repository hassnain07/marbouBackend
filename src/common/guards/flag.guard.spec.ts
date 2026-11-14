import { FlagGuard } from './flag.guard';
import { ErrorCodes } from '../errors/error-codes';

function makeGuard(isEnabled: boolean | ((key: string) => Promise<boolean>)) {
  const mockSvc = {
    isEnabled: jest.fn(
      typeof isEnabled === 'function' ? isEnabled : () => Promise.resolve(isEnabled),
    ) as jest.Mock<Promise<boolean>, [string]>,
  };
  const mockModuleRef = {
    get: jest.fn(() => mockSvc),
  } as any;
  const mockReflector = {
    get: jest.fn(),
  } as any;
  const guard = new FlagGuard(mockReflector, mockModuleRef);
  return { guard, mockReflector, mockSvc };
}

function makeCtx(flagKey?: string): any {
  return {
    getHandler: () => ({ name: 'testHandler' }),
    getClass: () => class C {},
    switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => ({}) }),
    _flagKey: flagKey,
  };
}

describe('FlagGuard', () => {
  it('passes through when no @RequiresFlag decoration', async () => {
    const { guard, mockReflector } = makeGuard(false);
    mockReflector.get.mockReturnValue(undefined);
    const ctx = makeCtx();
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('allows when flag is ON', async () => {
    const { guard, mockReflector } = makeGuard(true);
    mockReflector.get.mockReturnValue('ENABLE_MONETIZATION');
    const ctx = makeCtx('ENABLE_MONETIZATION');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('throws FEATURE_DISABLED when flag is OFF', async () => {
    const { guard, mockReflector } = makeGuard(false);
    mockReflector.get.mockReturnValue('ENABLE_MONETIZATION');
    const ctx = makeCtx('ENABLE_MONETIZATION');
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      code: ErrorCodes.FEATURE_DISABLED,
      status: 404,
    });
  });

  it('calls isEnabled with the correct flag key', async () => {
    const { guard, mockReflector, mockSvc } = makeGuard(true);
    mockReflector.get.mockReturnValue('media.video_uploads');
    const ctx = makeCtx('media.video_uploads');
    await guard.canActivate(ctx);
    expect(mockSvc.isEnabled).toHaveBeenCalledWith('media.video_uploads');
  });
});
