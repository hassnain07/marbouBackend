import { envSchema } from './env.schema';

const base = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://user:pass@localhost/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'access-secret-at-least-16-chars-long',
  JWT_REFRESH_SECRET: 'refresh-secret-at-least-16-chars-long',
  ADMIN_JWT_SECRET: 'admin-secret-at-least-16-chars-long',
  ADMIN_TOTP_ENC_KEY: 'totp-key-must-be-at-least-32-characters',
  ADMIN_BOOTSTRAP_KEY: 'test-bootstrap-key-min',
};

describe('envSchema', () => {
  it('parses valid development env', () => {
    const result = envSchema.parse(base);
    expect(result.NODE_ENV).toBe('development');
    expect(result.PORT).toBe(3000); // default
    expect(Array.isArray(result.CORS_ORIGINS)).toBe(true);
  });

  it('applies default LOG_LEVEL = info', () => {
    const result = envSchema.parse(base);
    expect(result.LOG_LEVEL).toBe('info');
  });

  it('rejects when DATABASE_URL is missing', () => {
    const { DATABASE_URL: _, ...rest } = base;
    const result = envSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects when JWT_ACCESS_SECRET is too short', () => {
    const result = envSchema.safeParse({ ...base, JWT_ACCESS_SECRET: 'short' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('JWT_ACCESS_SECRET');
    }
  });

  it('rejects INTEGRATIONS_MODE=mock in production', () => {
    const result = envSchema.safeParse({
      ...base,
      NODE_ENV: 'production',
      INTEGRATIONS_MODE: 'mock',
    });
    expect(result.success).toBe(false);
  });

  it('rejects DEV_EXPOSE_OTP=true in production', () => {
    const result = envSchema.safeParse({
      ...base,
      NODE_ENV: 'production',
      INTEGRATIONS_MODE: 'live',
      DEV_EXPOSE_OTP: 'true',
    });
    expect(result.success).toBe(false);
  });

  it('allows INTEGRATIONS_MODE=live in production', () => {
    const result = envSchema.safeParse({
      ...base,
      NODE_ENV: 'production',
      INTEGRATIONS_MODE: 'live',
      DEV_EXPOSE_OTP: 'false',
    });
    expect(result.success).toBe(true);
  });

  it('requires ADMIN_BOOTSTRAP_KEY of at least 16 chars', () => {
    const result = envSchema.safeParse({ ...base, ADMIN_BOOTSTRAP_KEY: 'short' });
    expect(result.success).toBe(false);
  });

  it('splits CORS_ORIGINS on comma', () => {
    const result = envSchema.parse({
      ...base,
      CORS_ORIGINS: 'http://a.com,http://b.com',
    });
    expect(result.CORS_ORIGINS).toEqual(['http://a.com', 'http://b.com']);
  });

  it('coerces MAPS_DAILY_CAP to a number', () => {
    const result = envSchema.parse({ ...base, MAPS_DAILY_CAP: '500' });
    expect(result.MAPS_DAILY_CAP).toBe(500);
  });
});
