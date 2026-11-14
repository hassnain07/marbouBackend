/**
 * Jest e2e setup — sets safe default environment variables so the test suite
 * can boot the NestJS app without requiring a .env file (item 13).
 *
 * IMPORTANT: We load .env FIRST (via dotenv) so that any values already in
 * .env take precedence over the defaults here. This ensures the local dev DB
 * (marbou_db on port 5433) is used when running locally, while CI's injected
 * env vars are used in CI.
 */

// Load .env before setting any defaults so the real values win.
// dotenv skips keys that are already set in process.env (which CI provides).
require('dotenv').config();

const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '3001',
  DATABASE_URL: 'postgresql://marbou:marbou@localhost:5433/marbou_db?schema=public',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'test-access-secret-at-least-16-chars',
  JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-16-chars',
  ADMIN_JWT_SECRET: 'test-admin-secret-at-least-16-chars',
  ADMIN_TOTP_ENC_KEY: 'test-totp-enc-key-must-be-32-chars-xx',
  ADMIN_BOOTSTRAP_KEY: 'dev-bootstrap-key-change-me-min16',
  ADMIN_SEED_EMAIL: 'admin@marbou.test',
  ADMIN_SEED_PASSWORD: 'TestPass!2026',
  CORS_ORIGINS: 'http://localhost:3001',
  INTEGRATIONS_MODE: 'mock',
  DEV_EXPOSE_OTP: 'true',
  LOG_LEVEL: 'error', // suppress pino logs during tests
};

for (const [key, value] of Object.entries(defaults)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}
