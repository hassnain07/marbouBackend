/** Global constants shared across modules. Thresholds/caps listed in Appendix C
 *  must NOT be hard-coded here — they live in the DB Defaults register (Phase 1). */

export const API_PREFIX = 'api/v1';
export const ADMIN_PREFIX = 'api/v1/admin';
export const SWAGGER_PATH = 'api/docs';

/** HTTP header names used across the request lifecycle. */
export const HEADERS = {
  REQUEST_ID: 'x-request-id',
  DEVICE_ID: 'x-device-id',
  IDEMPOTENCY_KEY: 'idempotency-key',
  ACCEPT_LANGUAGE: 'accept-language',
} as const;

/** Supported locales (§10.1). Arabic is the default/fallback. */
export const SUPPORTED_LANGUAGES = ['ar', 'en'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'ar';

/** Default cursor pagination bounds (architecture §5.3). */
export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

/** Idempotency cache TTL (architecture §5.4). */
export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
