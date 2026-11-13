import { Injectable, type NestMiddleware } from '@nestjs/common';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, HEADERS, type Language } from '../../config/constants';

/**
 * Resolves the response language from Accept-Language (fallback: stored user
 * language later, then `ar`). Stashes it on the request for mappers/filters
 * (architecture §5.6, NFR-UX-04).
 */
@Injectable()
export class LocaleMiddleware implements NestMiddleware {
  use(req: any, _res: any, next: () => void): void {
    const raw = (req.headers?.[HEADERS.ACCEPT_LANGUAGE] as string) ?? '';
    const preferred = raw.split(',')[0]?.trim().toLowerCase().split('-')[0];
    const lang: Language = (SUPPORTED_LANGUAGES as readonly string[]).includes(preferred ?? '')
      ? (preferred as Language)
      : DEFAULT_LANGUAGE;
    req.locale = lang;
    next();
  }
}
