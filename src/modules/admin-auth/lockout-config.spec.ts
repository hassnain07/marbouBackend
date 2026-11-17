import { getLockoutDuration, calculateLockedUntil, LOCKOUT_PROGRESSION } from './lockout-config';

describe('Lockout Configuration', () => {
  describe('LOCKOUT_PROGRESSION', () => {
    it('defines the correct progression per Appendix C', () => {
      expect(LOCKOUT_PROGRESSION).toEqual([
        { failureThreshold: 5, durationMinutes: 1 },
        { failureThreshold: 6, durationMinutes: 5 },
        { failureThreshold: 7, durationMinutes: 15 },
        { failureThreshold: 8, durationMinutes: 60 },
      ]);
    });
  });

  describe('getLockoutDuration', () => {
    it('returns 0 for failure counts below threshold', () => {
      expect(getLockoutDuration(0)).toBe(0);
      expect(getLockoutDuration(1)).toBe(0);
      expect(getLockoutDuration(4)).toBe(0);
    });

    it('returns 1 minute at 5 failures', () => {
      expect(getLockoutDuration(5)).toBe(1);
    });

    it('returns 5 minutes at 6 failures', () => {
      expect(getLockoutDuration(6)).toBe(5);
    });

    it('returns 15 minutes at 7 failures', () => {
      expect(getLockoutDuration(7)).toBe(15);
    });

    it('returns 60 minutes at 8+ failures', () => {
      expect(getLockoutDuration(8)).toBe(60);
      expect(getLockoutDuration(9)).toBe(60);
      expect(getLockoutDuration(100)).toBe(60);
    });
  });

  describe('calculateLockedUntil', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-11-17T12:00:00Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns null for failure counts below threshold', () => {
      expect(calculateLockedUntil(0)).toBeNull();
      expect(calculateLockedUntil(4)).toBeNull();
    });

    it('returns timestamp 1 minute in the future at 5 failures', () => {
      const result = calculateLockedUntil(5);
      expect(result).toEqual(new Date('2026-11-17T12:01:00Z'));
    });

    it('returns timestamp 5 minutes in the future at 6 failures', () => {
      const result = calculateLockedUntil(6);
      expect(result).toEqual(new Date('2026-11-17T12:05:00Z'));
    });

    it('returns timestamp 15 minutes in the future at 7 failures', () => {
      const result = calculateLockedUntil(7);
      expect(result).toEqual(new Date('2026-11-17T12:15:00Z'));
    });

    it('returns timestamp 60 minutes in the future at 8+ failures', () => {
      const result = calculateLockedUntil(8);
      expect(result).toEqual(new Date('2026-11-17T13:00:00Z'));

      const result100 = calculateLockedUntil(100);
      expect(result100).toEqual(new Date('2026-11-17T13:00:00Z'));
    });
  });
});
