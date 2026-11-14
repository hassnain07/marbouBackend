import { FeatureFlagsService } from './feature-flags.service';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCodes } from '../../../common/errors/error-codes';

function makeFlag(key: string, enabled: boolean): any {
  return { key, enabled, config: null, countryOverrides: null, description: null, updatedBy: 'seed', updatedAt: new Date() };
}

function buildService(flags: any[] = []) {
  const store = new Map<string, any>(flags.map((f) => [f.key, f]));
  const history: any[] = [];

  const mockRepo: any = {
    findAll: jest.fn(() => Promise.resolve([...store.values()])),
    findByKey: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    update: jest.fn(async (key: string, patch: any) => {
      const f = { ...store.get(key), ...patch };
      store.set(key, f);
      return f;
    }),
    appendHistory: jest.fn(async (d: any) => { history.push(d); }),
    getHistory: jest.fn((key: string) => history.filter((h) => h.flagKey === key)),
  };
  const mockRedis: any = {
    client: { status: 'connecting' }, // offline → cache disabled
    cacheAside: jest.fn((_k: string, _ttl: number, loader: () => Promise<any>) => loader()),
    cacheInvalidate: jest.fn(),
  };
  const mockAudit: any = { record: jest.fn() };

  const svc = new FeatureFlagsService(mockRepo, mockRedis, mockAudit);
  return { svc, store, history, mockAudit };
}

describe('FeatureFlagsService', () => {
  it('isEnabled returns false for unknown key', async () => {
    const { svc } = buildService();
    expect(await svc.isEnabled('unknown.key')).toBe(false);
  });

  it('isEnabled returns stored value', async () => {
    const { svc } = buildService([makeFlag('otp.email', true)]);
    expect(await svc.isEnabled('otp.email')).toBe(true);
  });

  it('respects per-country override', async () => {
    const flag = { ...makeFlag('otp.email', true), countryOverrides: { SD: { enabled: false } } };
    const { svc } = buildService([flag]);
    expect(await svc.isEnabled('otp.email', 'SD')).toBe(false);
    expect(await svc.isEnabled('otp.email', 'EG')).toBe(true); // falls back to flag.enabled
  });

  it('patch writes history and audit entry', async () => {
    // Provide all 3 OTP flags so the last-channel guard passes (otp.sms+whatsapp disabled)
    const { svc, history, mockAudit } = buildService([
      makeFlag('otp.email', true),
      makeFlag('otp.sms', true), // second channel enabled — allows disabling email
      makeFlag('otp.whatsapp', false),
    ]);
    await svc.patch('otp.email', { enabled: false }, 'admin-1');
    expect(history).toHaveLength(1);
    expect(mockAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'flag.patch',
        entity: 'FeatureFlag',
        entityId: 'otp.email',
        before: expect.objectContaining({ enabled: true }),
        after: expect.objectContaining({ enabled: false }),
      }),
    );
  });

  it('refuses to disable the last enabled OTP channel (AUTH-15)', async () => {
    const { svc } = buildService([
      makeFlag('otp.email', true),
      makeFlag('otp.sms', false),
      makeFlag('otp.whatsapp', false),
    ]);
    await expect(svc.patch('otp.email', { enabled: false }, 'admin')).rejects.toMatchObject({
      code: ErrorCodes.AUTH_OTP_LAST_CHANNEL,
    });
  });

  it('allows disabling an OTP channel when another is enabled', async () => {
    const { svc } = buildService([
      makeFlag('otp.email', true),
      makeFlag('otp.sms', true),
      makeFlag('otp.whatsapp', false),
    ]);
    await expect(svc.patch('otp.email', { enabled: false }, 'admin')).resolves.toBeDefined();
  });

  it('throws NOT_FOUND when patching unknown key', async () => {
    const { svc } = buildService([]);
    await expect(svc.patch('nonexistent', { enabled: true }, 'admin')).rejects.toBeInstanceOf(AppError);
  });
});
