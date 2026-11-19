/**
 * Customer-auth constants (AUTH-05, AUTH-06, Phase 3).
 * Hard-coded PRD values live here; threshold values from Appendix C live in DefaultsService.
 *
 * ONE canonical source for OTP parameters — imported by OtpService, seed, dev routes.
 */

/** OTP code length (AUTH-05: 6 digits). */
export const AUTH_OTP_DIGITS = 6;

/** OTP expiry in minutes (AUTH-05: 10 min). */
export const AUTH_OTP_EXPIRY_MINUTES = 10;

/** Max bad-attempt count before the code is dead (AUTH-05: 5). */
export const AUTH_OTP_MAX_ATTEMPTS = 5;

/** Resend cooldown in seconds (AUTH-05: 60 s). */
export const AUTH_OTP_RESEND_COOLDOWN_SECONDS = 60;

/** Access JWT TTL constant for reference (env JWT_ACCESS_TTL wins). */
export const AUTH_JWT_ACCESS_TTL_DEFAULT = '15m';

/** Password policy (open question — not specified in PRD; we choose min 8 with letter+digit, max 128). */
export const AUTH_PASSWORD_MIN_LENGTH = 8;
export const AUTH_PASSWORD_MAX_LENGTH = 128;
export const AUTH_PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).+$/;

/** Redis key prefix for the guard session cache. */
export const USER_SESSION_CACHE_PREFIX = 'user:session:';

/** Redis key prefix for lastActiveAt throttle (write at most every 5 min). */
export const USER_ACTIVE_THROTTLE_PREFIX = 'user:active:';

/** lastActiveAt update throttle in seconds. */
export const USER_ACTIVE_THROTTLE_SECONDS = 300;

/** Dev: plaintext OTP stored in Redis under this prefix when DEV_EXPOSE_OTP=true. */
export const DEV_OTP_REDIS_PREFIX = 'dev:otp:';
