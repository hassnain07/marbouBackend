/**
 * All Appendix C configurable defaults, keyed so the DefaultsService can seed
 * and type-check them. Keys follow dot-notation by domain. Every value comes
 * directly from PRD Appendix C — no invented numbers.
 *
 * Open questions (noted in docs/schema-decisions.md):
 *  - listing.renewal.windowDays: "30 days after expiry" mentioned in Appendix C
 *    but the exact grace period for renewal is not separately specified — using 30.
 *  - job.expiry.days: "configurable period" — Appendix C mentions deadlines but
 *    not a default days value; using 30 to match listing expiry.
 */

export interface DefaultEntry {
  value: unknown;
  type: 'number' | 'boolean' | 'string' | 'object';
  description: string;
}

/** All Appendix C defaults. Source: MARBOU_PRD_V3.md Appendix C. */
export const APPENDIX_C_DEFAULTS: Record<string, DefaultEntry> = {
  // ── Listings ──────────────────────────────────────────────────────────
  'listing.expiry.days': {
    value: 30,
    type: 'number',
    description: 'Listing expiry in days (per category). Appendix C.',
  },
  'listing.expiry.reminderDays': {
    value: [7, 1],
    type: 'object',
    description: 'Days before expiry to send reminders. Appendix C.',
  },
  'listing.renewal.windowDays': {
    value: 30,
    type: 'number',
    description: 'Days after expiry during which renewal is allowed. Appendix C.',
  },
  'listing.cap.individual': {
    value: 50,
    type: 'number',
    description: 'Max active listings per individual account. Appendix C.',
  },
  'listing.cap.business': {
    value: 500,
    type: 'number',
    description: 'Max active listings per business account. Appendix C.',
  },
  'listing.rate.perHour': {
    value: 5,
    type: 'number',
    description: 'Max listing creations per hour per user. Appendix C.',
  },
  'listing.rate.perDay': {
    value: 20,
    type: 'number',
    description: 'Max listing creations per day per user. Appendix C.',
  },
  'listing.photos.max': {
    value: 10,
    type: 'number',
    description: 'Max photos per listing. Appendix C.',
  },

  // ── Video ──────────────────────────────────────────────────────────────
  'media.video.maxDurationSeconds': {
    value: 30,
    type: 'number',
    description: 'Max video duration in seconds. Appendix C.',
  },
  'media.video.maxSizeMb': {
    value: 15,
    type: 'number',
    description: 'Max video file size in MB. Appendix C.',
  },
  'media.video.enabledGlobally': {
    value: true,
    type: 'boolean',
    description: 'Global video upload toggle. Appendix C.',
  },

  // ── Quality score weights (must sum to 100) ───────────────────────────
  'quality.weight.titleDescription': {
    value: 25,
    type: 'number',
    description: 'Quality score weight: title + description. Appendix C.',
  },
  'quality.weight.photos': {
    value: 25,
    type: 'number',
    description: 'Quality score weight: photos. Appendix C.',
  },
  'quality.weight.requiredAttributes': {
    value: 20,
    type: 'number',
    description: 'Quality score weight: required attributes. Appendix C.',
  },
  'quality.weight.optionalAttributes': {
    value: 10,
    type: 'number',
    description: 'Quality score weight: optional attributes. Appendix C.',
  },
  'quality.weight.location': {
    value: 10,
    type: 'number',
    description: 'Quality score weight: location. Appendix C.',
  },
  'quality.weight.video': {
    value: 5,
    type: 'number',
    description: 'Quality score weight: video. Appendix C.',
  },
  'quality.weight.price': {
    value: 5,
    type: 'number',
    description: 'Quality score weight: price. Appendix C.',
  },

  // ── Duplicate detection ───────────────────────────────────────────────
  'duplicate.textTrigramThreshold': {
    value: 0.85,
    type: 'number',
    description: 'Trigram similarity threshold for duplicate text detection. Appendix C.',
  },

  // ── View counter ──────────────────────────────────────────────────────
  'views.uniqueWindowHours': {
    value: 24,
    type: 'number',
    description: 'Hours per unique-viewer window (Appendix C: "per 24 hours").',
  },

  // ── Auto-hide and fraud score thresholds ─────────────────────────────
  'moderation.autoHide.reportCount': {
    value: 5,
    type: 'number',
    description:
      'Distinct reports within 24 h that trigger AUTO_HIDDEN. Appendix C.',
  },
  'moderation.autoHide.fraudScore': {
    value: 85,
    type: 'number',
    description: 'Fraud score threshold that triggers AUTO_HIDDEN. Appendix C.',
  },
  'fraud.score.alertThreshold': {
    value: 70,
    type: 'number',
    description: 'Fraud score at which a moderator alert is raised. Appendix C.',
  },
  'fraud.score.rateLimitThreshold': {
    value: 80,
    type: 'number',
    description:
      'Fraud score at which the account is automatically rate-limited. Appendix C.',
  },

  // ── Price insights ────────────────────────────────────────────────────
  'search.priceInsight.minComparables': {
    value: 8,
    type: 'number',
    description: 'Min comparable listings required for price insights. Appendix C.',
  },
  'search.priceInsight.comparableSoldWithinDays': {
    value: 90,
    type: 'number',
    description: 'Max age in days of a comparable sold listing. Appendix C.',
  },
  'search.priceInsight.belowMarketPercent': {
    value: 15,
    type: 'number',
    description: 'Percentage below median to label "Below market". Appendix C.',
  },
  'search.priceInsight.aboveMarketPercent': {
    value: 15,
    type: 'number',
    description: 'Percentage above median to label "Above market". Appendix C.',
  },

  // ── Exchange-rate staleness ───────────────────────────────────────────
  'currency.staleAlertHours': {
    value: 72,
    type: 'number',
    description:
      'Hours after last exchange-rate update before an alert is raised. Appendix C.',
  },
  'currency.suppressConversionDays': {
    value: 7,
    type: 'number',
    description:
      'Days after which converted indicators and cross-currency insights are suppressed. Appendix C.',
  },

  // ── Contact-reveal (DET-13) ───────────────────────────────────────────
  'contact.reveal.guestDailyMax': {
    value: 20,
    type: 'number',
    description: 'Max contact reveals per day per guest device+IP. Appendix C.',
  },

  // ── Auth lockout ──────────────────────────────────────────────────────
  'auth.lockout.maxAttempts': {
    value: 5,
    type: 'number',
    description: 'Failed attempts before lockout. Appendix C.',
  },
  'auth.lockout.delayMinutes': {
    value: [1, 5, 15, 60],
    type: 'object',
    description: 'Progressive lockout delay steps (minutes). Appendix C.',
  },

  // ── Messaging throttling ──────────────────────────────────────────────
  'messaging.throttle.perMinutePerUser': {
    value: 20,
    type: 'number',
    description: 'Max messages per minute per user. Appendix C.',
  },
  'messaging.throttle.perMinutePerRecipient': {
    value: 10,
    type: 'number',
    description: 'Max messages per minute to one recipient. Appendix C.',
  },
  'messaging.spam.sameTextRecipients': {
    value: 3,
    type: 'number',
    description:
      'Same text sent to N recipients in 10 min triggers spam flag. Appendix C.',
  },
  'messaging.spam.windowMinutes': {
    value: 10,
    type: 'number',
    description: 'Window in minutes for same-text-spam check. Appendix C.',
  },

  // ── Reviews ───────────────────────────────────────────────────────────
  'reviews.eligibility.minMessagesEach': {
    value: 2,
    type: 'number',
    description:
      'Min messages from each party in a chat thread for review eligibility. Appendix C.',
  },

  // ── Appointments ──────────────────────────────────────────────────────
  'appointment.confirmationWindowHours': {
    value: 72,
    type: 'number',
    description:
      'Hours user may confirm/dispute appointment completion before it auto-stands. Appendix C.',
  },

  // ── Jobs ──────────────────────────────────────────────────────────────
  'jobs.application.dailyLimit': {
    value: 20,
    type: 'number',
    description: 'Max job applications per day per candidate. Appendix C.',
  },

  // ── Account deletion ─────────────────────────────────────────────────
  'account.deletion.graceDays': {
    value: 30,
    type: 'number',
    description: 'Grace period in days before deletion is finalised. Appendix C.',
  },
  'account.export.maxDays': {
    value: 7,
    type: 'number',
    description:
      'Maximum days to deliver a data export (target < 24 h). Appendix C.',
  },

  // ── Registration drop-off (OD-01 trigger) ────────────────────────────
  'auth.otp.dropOffTriggerPercent': {
    value: 30,
    type: 'number',
    description:
      'If >30 % of registrations fail OTP over a 2-week window, escalate to SMS/WhatsApp OTP. Appendix C.',
  },
};
