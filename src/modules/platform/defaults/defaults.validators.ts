import { AppError } from '../../../common/errors/app-error';
import { ErrorCodes } from '../../../common/errors/error-codes';
import type { DefaultEntry } from './defaults.constants';

/** Keys for the seven quality-score weights whose sum must equal 100. */
const QUALITY_WEIGHT_KEYS = new Set([
  'quality.weight.titleDescription',
  'quality.weight.photos',
  'quality.weight.requiredAttributes',
  'quality.weight.optionalAttributes',
  'quality.weight.location',
  'quality.weight.video',
  'quality.weight.price',
]);

/**
 * Validate a proposed default value against per-key range rules.
 * Throws AppError.unprocessable with a details[] array on failure.
 */
export function validateDefaultValue(
  key: string,
  value: unknown,
  def: DefaultEntry | undefined,
  allCurrentValues: Map<string, unknown>,
): void {
  // ── Type check ───────────────────────────────────────────────────────────
  const expectedType = def?.type;
  if (expectedType && expectedType !== 'object' && typeof value !== expectedType) {
    throw AppError.unprocessable(ErrorCodes.DEFAULTS_INVALID_TYPE, [
      {
        field: 'value',
        issue: `Expected type '${expectedType}' but received '${typeof value}'`,
      },
    ]);
  }

  // ── Non-negative integer keys ─────────────────────────────────────────────
  const nonNegInt = new Set([
    'listing.expiry.days',
    'listing.renewal.windowDays',
    'listing.cap.individual',
    'listing.cap.business',
    'listing.rate.perHour',
    'listing.rate.perDay',
    'listing.photos.max',
    'media.video.maxDurationSeconds',
    'media.video.maxSizeM',
    'media.video.maxSizeMb',
    'moderation.autoHide.reportCount',
    'views.uniqueWindowHours',
    'auth.lockout.maxAttempts',
    'messaging.throttle.perMinutePerUser',
    'messaging.throttle.perMinutePerRecipient',
    'messaging.spam.sameTextRecipients',
    'messaging.spam.windowMinutes',
    'reviews.eligibility.minMessagesEach',
    'appointment.confirmationWindowHours',
    'jobs.application.dailyLimit',
    'account.deletion.graceDays',
    'account.export.maxDays',
    'currency.staleAlertHours',
    'currency.suppressConversionDays',
    'contact.reveal.guestDailyMax',
    'search.priceInsight.minComparables',
    'search.priceInsight.comparableSoldWithinDays',
    'account.export.targetHours',
  ]);
  if (nonNegInt.has(key)) {
    if (!Number.isInteger(value) || (value as number) < 0) {
      throw AppError.unprocessable(ErrorCodes.DEFAULTS_VALUE_OUT_OF_RANGE, [
        { field: 'value', issue: `'${key}' must be a non-negative integer` },
      ]);
    }
  }

  // ── Trigram threshold: 0 < v ≤ 1 ─────────────────────────────────────────
  if (key === 'duplicate.textTrigramThreshold') {
    if (typeof value !== 'number' || value <= 0 || value > 1) {
      throw AppError.unprocessable(ErrorCodes.DEFAULTS_VALUE_OUT_OF_RANGE, [
        { field: 'value', issue: 'Trigram threshold must be a number in range (0, 1]' },
      ]);
    }
  }

  // ── Percentage labels: 0 < v < 100 ───────────────────────────────────────
  if (key === 'search.priceInsight.belowMarketPercent' || key === 'search.priceInsight.aboveMarketPercent') {
    if (typeof value !== 'number' || value <= 0 || value >= 100) {
      throw AppError.unprocessable(ErrorCodes.DEFAULTS_VALUE_OUT_OF_RANGE, [
        { field: 'value', issue: `'${key}' must be a number in range (0, 100)` },
      ]);
    }
  }

  // ── Fraud score thresholds: 0-100, alert < rateLimit < autoHide ──────────
  const fraudThresholds = [
    'fraud.score.alertThreshold',
    'fraud.score.rateLimitThreshold',
    'moderation.autoHide.fraudScore',
  ];
  if (fraudThresholds.includes(key)) {
    if (typeof value !== 'number' || value < 0 || value > 100) {
      throw AppError.unprocessable(ErrorCodes.DEFAULTS_VALUE_OUT_OF_RANGE, [
        { field: 'value', issue: `Fraud/score threshold must be 0–100` },
      ]);
    }
    // Ordering: alertThreshold < rateLimitThreshold < autoHide.fraudScore
    const getV = (k: string): number => {
      if (k === key) return value as number;
      return (allCurrentValues.get(k) as number | undefined) ?? 0;
    };
    const alert = getV('fraud.score.alertThreshold');
    const rl = getV('fraud.score.rateLimitThreshold');
    const hide = getV('moderation.autoHide.fraudScore');
    if (!(alert < rl && rl < hide)) {
      throw AppError.unprocessable(ErrorCodes.DEFAULTS_VALUE_OUT_OF_RANGE, [
        {
          field: 'value',
          issue: `Fraud thresholds must satisfy alert(${alert}) < rateLimit(${rl}) < autoHide(${hide})`,
        },
      ]);
    }
  }

  // ── Array of positive numbers (reminder days, lockout steps) ─────────────
  if (key === 'listing.expiry.reminderDays' || key === 'auth.lockout.delayMinutes') {
    if (
      !Array.isArray(value) ||
      value.length === 0 ||
      !value.every((v) => typeof v === 'number' && v > 0)
    ) {
      throw AppError.unprocessable(ErrorCodes.DEFAULTS_VALUE_OUT_OF_RANGE, [
        { field: 'value', issue: `'${key}' must be a non-empty array of positive numbers` },
      ]);
    }
  }

  // ── Quality weight: 0-100 per weight, all seven must sum to 100 ──────────
  if (QUALITY_WEIGHT_KEYS.has(key)) {
    if (typeof value !== 'number' || value < 0 || value > 100) {
      throw AppError.unprocessable(ErrorCodes.DEFAULTS_VALUE_OUT_OF_RANGE, [
        { field: 'value', issue: 'Quality weight must be 0–100' },
      ]);
    }
    // Check sum across all seven weights.
    let sum = 0;
    for (const wKey of QUALITY_WEIGHT_KEYS) {
      sum += wKey === key ? (value as number) : ((allCurrentValues.get(wKey) as number | undefined) ?? 0);
    }
    if (sum !== 100) {
      throw AppError.unprocessable(ErrorCodes.DEFAULTS_VALUE_OUT_OF_RANGE, [
        {
          field: 'value',
          issue: `Quality-score weights must sum to 100 (current sum with this change: ${sum})`,
        },
      ]);
    }
  }

  // ── Drop-off trigger: 0-100 percentage ───────────────────────────────────
  if (key === 'auth.otp.dropOffTriggerPercent') {
    if (typeof value !== 'number' || value < 0 || value > 100) {
      throw AppError.unprocessable(ErrorCodes.DEFAULTS_VALUE_OUT_OF_RANGE, [
        { field: 'value', issue: 'Drop-off trigger percentage must be 0–100' },
      ]);
    }
  }
}
