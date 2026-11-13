import type { Language } from '../config/constants';

/** Accessors for per-request values attached by the middleware layer. The
 *  request object is typed loosely here; guards/interceptors read via these
 *  helpers so there is a single source of truth for the field names. */

export function getRequestId(req: any): string | undefined {
  return req?.requestId as string | undefined;
}

export function getDeviceId(req: any): string | undefined {
  return req?.deviceId as string | undefined;
}

export function getLocale(req: any): Language {
  return (req?.locale as Language) ?? 'ar';
}
