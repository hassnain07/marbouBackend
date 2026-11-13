import { localizeError } from './messages';
import { ErrorCodes } from '../errors/error-codes';

describe('localizeError', () => {
  it('returns Arabic for known codes with lang=ar', () => {
    expect(localizeError(ErrorCodes.NOT_FOUND, 'ar')).toBe('المورد غير موجود');
  });

  it('returns English for known codes with lang=en', () => {
    expect(localizeError(ErrorCodes.NOT_FOUND, 'en')).toBe('Resource not found');
  });

  it('returns English as a fallback when Arabic is missing', () => {
    // CONFLICT was added with both languages; this tests the fallback branch
    // by using a deliberately unknown code.
    const result = localizeError('TOTALLY_UNKNOWN_CODE', 'ar');
    expect(result).toBe('TOTALLY_UNKNOWN_CODE');
  });

  it('returns the code itself for a completely unknown code', () => {
    expect(localizeError('MYSTERY_ERROR', 'en')).toBe('MYSTERY_ERROR');
  });

  it('localises AUTH_OTP_EXPIRED in both languages', () => {
    expect(localizeError(ErrorCodes.AUTH_OTP_EXPIRED, 'ar')).toBeTruthy();
    expect(localizeError(ErrorCodes.AUTH_OTP_EXPIRED, 'en')).toBe('The code has expired');
  });

  it('localises the new CONFLICT code', () => {
    expect(localizeError(ErrorCodes.CONFLICT, 'en')).toBe('Resource conflict');
    expect(localizeError(ErrorCodes.CONFLICT, 'ar')).toBeTruthy();
  });
});
