import * as Sentry from '@sentry/node';
import { configuration } from '../../config/configuration';

/**
 * Initialise Sentry if SENTRY_DSN is set; otherwise no-op. Called once at
 * bootstrap (NFR-OBS-01). In production the DSN is required for error tracking;
 * in dev/test it is typically unset.
 */
export function initSentry(): void {
  const dsn = configuration.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: configuration.NODE_ENV,
    tracesSampleRate: configuration.NODE_ENV === 'production' ? 0.1 : 1.0,
    integrations: [],
  });
}

/** Capture an error to Sentry when configured; silent no-op otherwise. */
export function captureError(err: unknown): void {
  if (!configuration.SENTRY_DSN) return;
  Sentry.captureException(err);
}
