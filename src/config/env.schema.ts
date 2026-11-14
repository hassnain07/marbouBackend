import { z } from 'zod';

/**
 * Zod-validated environment. Parsed once at bootstrap; invalid or missing
 * required values fail fast with a clear message (NFR-SEC-08, NFR-MNT-01).
 * Mirrors `.env.example`. Keep this and `.env.example` in sync.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),

    JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 chars'),
    JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL: z.string().default('30d'),

    ADMIN_JWT_SECRET: z.string().min(16, 'ADMIN_JWT_SECRET must be at least 16 chars'),
    ADMIN_JWT_ACCESS_TTL: z.string().default('15m'),
    ADMIN_JWT_REFRESH_TTL: z.string().default('12h'),
    ADMIN_TOTP_ENC_KEY: z.string().min(32, 'ADMIN_TOTP_ENC_KEY must be at least 32 chars'),

    // Phase 1: temporary admin bootstrap (replaced by real 2FA admin auth in Phase 2).
    ADMIN_BOOTSTRAP_KEY: z
      .string()
      .min(16, 'ADMIN_BOOTSTRAP_KEY must be at least 16 chars (temporary dev admin access)'),
    ADMIN_SEED_EMAIL: z.string().email().default('admin@marbou.test'),
    ADMIN_SEED_PASSWORD: z.string().min(8, 'ADMIN_SEED_PASSWORD must be at least 8 chars').default('ChangeMe!2026'),

    S3_ENDPOINT: z.string().default('http://localhost:9000'),
    S3_REGION: z.string().default('us-east-1'),
    S3_PUBLIC_BUCKET: z.string().default('marbou-public'),
    S3_PRIVATE_BUCKET: z.string().default('marbou-private'),
    S3_ACCESS_KEY: z.string().optional(),
    S3_SECRET_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: z
      .string()
      .default('true')
      .transform((v) => v === 'true'),
    CDN_BASE_URL: z.string().default('http://localhost:9000'),

    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().optional(),

    FCM_CREDENTIALS_JSON: z.string().optional(),

    GOOGLE_CLIENT_IDS: z.string().optional(),
    FACEBOOK_APP_ID: z.string().optional(),
    FACEBOOK_APP_SECRET: z.string().optional(),
    APPLE_CLIENT_ID: z.string().optional(),
    APPLE_TEAM_ID: z.string().optional(),
    APPLE_KEY_ID: z.string().optional(),
    APPLE_PRIVATE_KEY_PATH: z.string().optional(),

    GOOGLE_MAPS_SERVER_KEY: z.string().optional(),
    MAPS_DAILY_CAP: z.coerce.number().int().positive().default(250),
    MAPS_PER_USER_DAILY: z.coerce.number().int().positive().default(50),
    MAPS_PER_IP_DAILY: z.coerce.number().int().positive().default(100),

    SMS_PROVIDER_A_DSN: z.string().optional(),
    SMS_PROVIDER_B_DSN: z.string().optional(),
    WHATSAPP_API_URL: z.string().optional(),
    WHATSAPP_TOKEN: z.string().optional(),
    CLASSIFIER_ENDPOINT: z.string().optional(),
    CLASSIFIER_TOKEN: z.string().optional(),

    SENTRY_DSN: z.string().optional(),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    INTEGRATIONS_MODE: z.enum(['mock', 'live']).default('mock'),

    RATE_LIMIT_AUTH_PER_MINUTE: z.coerce.number().int().positive().default(10),
    RATE_LIMIT_DEFAULT_PER_MINUTE: z.coerce.number().int().positive().default(60),

    DEV_EXPOSE_OTP: z
      .string()
      .default('false')
      .transform((v) => v === 'true'),
  })
  .superRefine((env, ctx) => {
    // Mock adapters must never load in production (integration matrix §10).
    if (env.NODE_ENV === 'production' && env.INTEGRATIONS_MODE === 'mock') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'INTEGRATIONS_MODE=mock is not allowed in production',
        path: ['INTEGRATIONS_MODE'],
      });
    }
    if (env.NODE_ENV === 'production' && env.DEV_EXPOSE_OTP) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'DEV_EXPOSE_OTP must be false in production',
        path: ['DEV_EXPOSE_OTP'],
      });
    }
  });

export type Env = z.infer<typeof envSchema>;
export { envSchema };
