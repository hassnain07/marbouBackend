import { envSchema } from './env.schema';

const base = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://user:pass@localhost/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'access-secret-at-least-16-chars-long',
  JWT_REFRESH_SECRET: 'refresh-secret-at-least-16-chars-long',
  ADMIN_JWT_SECRET: 'admin-jwt-secret-at-least-32-chars-long-required',
  ADMIN_TOTP_ENC_KEY: 'totp-key-must-be-at-least-32-characters',
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
      ADMIN_JWT_SECRET: 'secure-production-jwt-secret-min-32-chars',
      ADMIN_TOTP_ENC_KEY: 'secure-production-totp-key-min-32-chars',
      ADMIN_SEED_PASSWORD: 'secure-prod-seed-password',
    });
    expect(result.success).toBe(true);
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

  describe('Phase 2 security validations', () => {
    it('rejects ADMIN_JWT_SECRET shorter than 32 chars', () => {
      const result = envSchema.safeParse({
        ...base,
        ADMIN_JWT_SECRET: 'short-secret-16-chars',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join('.'));
        expect(paths).toContain('ADMIN_JWT_SECRET');
      }
    });

    it('rejects default/insecure ADMIN_JWT_SECRET in staging', () => {
      const result = envSchema.safeParse({
        ...base,
        NODE_ENV: 'staging',
        ADMIN_JWT_SECRET: 'change-me-in-staging-and-production-32-chars',
      });
      expect(result.success).toBe(false);
    });

    it('rejects default/insecure ADMIN_JWT_SECRET in production', () => {
      const result = envSchema.safeParse({
        ...base,
        NODE_ENV: 'production',
        INTEGRATIONS_MODE: 'live',
        DEV_EXPOSE_OTP: 'false',
        ADMIN_JWT_SECRET: 'change-me-in-staging-and-production-32-chars',
      });
      expect(result.success).toBe(false);
    });

    it('rejects default/insecure ADMIN_TOTP_ENC_KEY in staging', () => {
      const result = envSchema.safeParse({
        ...base,
        NODE_ENV: 'staging',
        ADMIN_TOTP_ENC_KEY: 'change-me-in-staging-and-production-32-chars',
      });
      expect(result.success).toBe(false);
    });

    it('rejects default/insecure ADMIN_TOTP_ENC_KEY in production', () => {
      const result = envSchema.safeParse({
        ...base,
        NODE_ENV: 'production',
        INTEGRATIONS_MODE: 'live',
        DEV_EXPOSE_OTP: 'false',
        ADMIN_TOTP_ENC_KEY: 'change-me-in-staging-and-production-32-chars',
      });
      expect(result.success).toBe(false);
    });

    it('defaults TRUSTED_PROXY_HOPS to 0', () => {
      const result = envSchema.parse(base);
      expect(result.TRUSTED_PROXY_HOPS).toBe(0);
    });

    it('coerces TRUSTED_PROXY_HOPS to number', () => {
      const result = envSchema.parse({
        ...base,
        TRUSTED_PROXY_HOPS: '2',
      });
      expect(result.TRUSTED_PROXY_HOPS).toBe(2);
    });

    it('rejects INTEGRATIONS_MODE=mock in staging (A10)', () => {
      const result = envSchema.safeParse({
        ...base,
        NODE_ENV: 'staging',
        INTEGRATIONS_MODE: 'mock',
        ADMIN_JWT_SECRET: 'secure-staging-jwt-secret-at-least-32-chars-long',
        ADMIN_TOTP_ENC_KEY: 'secure-staging-totp-key-at-least-32-characters',
        ADMIN_SEED_PASSWORD: 'secure-staging-seed-password',
      });
      expect(result.success).toBe(false);
    });

    it('rejects DEV_EXPOSE_OTP=true in staging (A10)', () => {
      const result = envSchema.safeParse({
        ...base,
        NODE_ENV: 'staging',
        INTEGRATIONS_MODE: 'live',
        DEV_EXPOSE_OTP: 'true',
        ADMIN_JWT_SECRET: 'secure-staging-jwt-secret-at-least-32-chars-long',
        ADMIN_TOTP_ENC_KEY: 'secure-staging-totp-key-at-least-32-characters',
        ADMIN_SEED_PASSWORD: 'secure-staging-seed-password',
      });
      expect(result.success).toBe(false);
    });

    it('accepts secure secrets in staging', () => {
      const result = envSchema.safeParse({
        ...base,
        NODE_ENV: 'staging',
        INTEGRATIONS_MODE: 'live',
        DEV_EXPOSE_OTP: 'false',
        ADMIN_JWT_SECRET: 'secure-staging-jwt-secret-at-least-32-chars-long',
        ADMIN_TOTP_ENC_KEY: 'secure-staging-totp-key-at-least-32-characters',
        ADMIN_SEED_PASSWORD: 'secure-staging-seed-password',
      });
      expect(result.success).toBe(true);
    });

    it('accepts secure secrets in production', () => {
      const result = envSchema.safeParse({
        ...base,
        NODE_ENV: 'production',
        INTEGRATIONS_MODE: 'live',
        DEV_EXPOSE_OTP: 'false',
        ADMIN_JWT_SECRET: 'secure-production-jwt-secret-at-least-32-chars',
        ADMIN_TOTP_ENC_KEY: 'secure-production-totp-key-at-least-32-chars',
        ADMIN_SEED_PASSWORD: 'secure-production-seed-password',
      });
      expect(result.success).toBe(true);
    });
  });
});
