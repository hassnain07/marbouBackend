import { validateDefaultValue } from './defaults.validators';
import { APPENDIX_C_DEFAULTS } from './defaults.constants';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCodes } from '../../../common/errors/error-codes';

function makeAll(overrides: Record<string, unknown> = {}): Map<string, unknown> {
  const m = new Map<string, unknown>();
  for (const [k, e] of Object.entries(APPENDIX_C_DEFAULTS)) {
    m.set(k, e.value);
  }
  for (const [k, v] of Object.entries(overrides)) {
    m.set(k, v);
  }
  return m;
}

describe('validateDefaultValue', () => {
  // Type checks
  it('rejects string for a number key', () => {
    expect(() => validateDefaultValue('listing.photos.max', 'ten', APPENDIX_C_DEFAULTS['listing.photos.max'], makeAll())).toThrow(AppError);
  });

  it('allows a valid non-negative integer', () => {
    expect(() => validateDefaultValue('listing.photos.max', 15, APPENDIX_C_DEFAULTS['listing.photos.max'], makeAll())).not.toThrow();
  });

  it('rejects a negative integer', () => {
    expect(() => validateDefaultValue('listing.cap.individual', -1, APPENDIX_C_DEFAULTS['listing.cap.individual'], makeAll())).toThrow(AppError);
  });

  // Trigram threshold
  it('rejects trigram threshold > 1', () => {
    expect(() => validateDefaultValue('duplicate.textTrigramThreshold', 1.5, APPENDIX_C_DEFAULTS['duplicate.textTrigramThreshold'], makeAll())).toThrow(AppError);
  });

  it('allows trigram threshold = 0.85', () => {
    expect(() => validateDefaultValue('duplicate.textTrigramThreshold', 0.85, APPENDIX_C_DEFAULTS['duplicate.textTrigramThreshold'], makeAll())).not.toThrow();
  });

  // Fraud thresholds ordering
  it('rejects when alert >= rateLimit', () => {
    expect(() =>
      validateDefaultValue(
        'fraud.score.alertThreshold',
        80, // alert = 80, rateLimit = 80 → not strictly less
        APPENDIX_C_DEFAULTS['fraud.score.alertThreshold'],
        makeAll({ 'fraud.score.rateLimitThreshold': 80, 'moderation.autoHide.fraudScore': 85 }),
      ),
    ).toThrow(AppError);
  });

  it('allows valid fraud thresholds: 70 < 80 < 85', () => {
    expect(() =>
      validateDefaultValue(
        'fraud.score.alertThreshold',
        70,
        APPENDIX_C_DEFAULTS['fraud.score.alertThreshold'],
        makeAll({ 'fraud.score.rateLimitThreshold': 80, 'moderation.autoHide.fraudScore': 85 }),
      ),
    ).not.toThrow();
  });

  // Reminder days array
  it('rejects empty array for reminderDays', () => {
    expect(() => validateDefaultValue('listing.expiry.reminderDays', [], APPENDIX_C_DEFAULTS['listing.expiry.reminderDays'], makeAll())).toThrow(AppError);
  });

  it('rejects array with zero in reminderDays', () => {
    expect(() => validateDefaultValue('listing.expiry.reminderDays', [0, 7], APPENDIX_C_DEFAULTS['listing.expiry.reminderDays'], makeAll())).toThrow(AppError);
  });

  it('allows valid reminderDays', () => {
    expect(() => validateDefaultValue('listing.expiry.reminderDays', [7, 1], APPENDIX_C_DEFAULTS['listing.expiry.reminderDays'], makeAll())).not.toThrow();
  });

  // Quality weights sum
  it('rejects quality weight change that breaks sum != 100', () => {
    // Current weights sum to 100; adding 1 extra to titleDescription breaks it
    expect(() =>
      validateDefaultValue(
        'quality.weight.titleDescription',
        26, // was 25, would make sum 101
        APPENDIX_C_DEFAULTS['quality.weight.titleDescription'],
        makeAll(),
      ),
    ).toThrow(AppError);
    try {
      validateDefaultValue('quality.weight.titleDescription', 26, APPENDIX_C_DEFAULTS['quality.weight.titleDescription'], makeAll());
    } catch (e) {
      expect((e as AppError).code).toBe(ErrorCodes.DEFAULTS_VALUE_OUT_OF_RANGE);
      expect((e as AppError).details[0].issue).toMatch(/sum/i);
    }
  });

  it('allows quality weight change that keeps sum = 100', () => {
    // Reduce photos from 25 to 24, increase titleDescription from 25 to 26
    expect(() =>
      validateDefaultValue(
        'quality.weight.titleDescription',
        26,
        APPENDIX_C_DEFAULTS['quality.weight.titleDescription'],
        makeAll({ 'quality.weight.photos': 24 }),
      ),
    ).not.toThrow();
  });

  // Export target hours
  it('rejects negative export target hours', () => {
    expect(() => validateDefaultValue('account.export.targetHours', -1, APPENDIX_C_DEFAULTS['account.export.targetHours'], makeAll())).toThrow(AppError);
  });

  it('allows account.export.targetHours = 24', () => {
    expect(() => validateDefaultValue('account.export.targetHours', 24, APPENDIX_C_DEFAULTS['account.export.targetHours'], makeAll())).not.toThrow();
  });
});
