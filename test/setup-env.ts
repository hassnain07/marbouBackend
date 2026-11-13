/**
 * Jest e2e setup — sets safe default environment variables so the test suite
 * can boot the NestJS app without requiring a .env file (item 13).
 * These values are overridden by any .env file that is present.
 */
const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '3001',
  DATABASE_URL: 'postgresql://marbou:marbou@localhost:5432/marbou_test?schema=public',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'test-access-secret-at-least-16-chars',
  JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-16-chars',
  ADMIN_JWT_SECRET: 'test-admin-secret-at-least-16-chars',
  ADMIN_TOTP_ENC_KEY: 'test-totp-enc-key-must-be-32-chars-xx',
  CORS_ORIGINS: 'http://localhost:3001',
  INTEGRATIONS_MODE: 'mock',
  DEV_EXPOSE_OTP: 'true',
  LOG_LEVEL: 'error', // suppress logs during tests
};

for (const [key, value] of Object.entries(defaults)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}
