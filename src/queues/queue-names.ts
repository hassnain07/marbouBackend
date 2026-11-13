/** BullMQ queue names (architecture §8). One queue per job family; processors are
 *  idempotent, retry with backoff, and dead-letter after max attempts (SYS-03). */
export const QueueName = {
  ECHO: 'echo', // Phase 0 smoke processor
  SCAN: 'scan', // keyword/blacklist/dup-image/dup-text/classifier scan (Phase 13)
  SEARCH_INDEX: 'search-index', // refresh normalized text / promoted columns (Phase 9)
  EXPIRY: 'expiry', // expire listings/jobs; 7d & 1d reminders (Phase 8)
  NOTIFICATIONS: 'notifications', // push/email/in-app dispatch (Phase 12)
  MEDIA: 'media', // image processing, thumbs, pHash, EXIF strip, cleanup (Phase 7)
  VIDEO: 'video', // ffmpeg transcode + poster (Phase 7)
  EXPORTS: 'exports', // user data export, CSV exports, reports (Phase 14/22)
  METRICS: 'metrics', // BusinessMetricDaily rollups, analytics aggregates (Phase 18/22)
  RATES: 'rates', // exchange-rate staleness check/alerts (Phase 5)
  MAPS: 'maps', // daily cap reset, billing alert evaluation (Phase 5)
  LIFECYCLE: 'lifecycle', // appointment reminders, sub/promo expiry, deletion grace (Phase 15/20)
  RETENTION: 'retention', // Appendix D purge engine (Phase 23)
  BROADCAST: 'broadcast', // scheduled admin broadcasts (Phase 12)
} as const;

export type QueueNameValue = (typeof QueueName)[keyof typeof QueueName];
