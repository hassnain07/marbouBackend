/**
 * Admin account lockout configuration (A3, Appendix C interpretation).
 *
 * Progressive lockout delays based on consecutive failed login attempts
 * (password failures + TOTP failures counted together).
 *
 * Interpretation: Appendix C lists "1/5/15/60" minutes. We map these to
 * failure counts as: 5 failures → 1 min, 6 → 5 min, 7 → 15 min, 8+ → 60 min.
 *
 * This is logged as an open question in docs/schema-decisions.md (A3).
 */

export interface LockoutConfig {
  /** Failure count that triggers this lockout duration */
  failureThreshold: number;
  /** Lockout duration in minutes */
  durationMinutes: number;
}

export const LOCKOUT_PROGRESSION: LockoutConfig[] = [
  { failureThreshold: 5, durationMinutes: 1 },
  { failureThreshold: 6, durationMinutes: 5 },
  { failureThreshold: 7, durationMinutes: 15 },
  { failureThreshold: 8, durationMinutes: 60 },
];

/**
 * Get the lockout duration in minutes for a given failure count.
 * Returns 0 if no lockout should be applied.
 */
export function getLockoutDuration(failureCount: number): number {
  // Find the highest threshold that the failure count meets or exceeds
  for (let i = LOCKOUT_PROGRESSION.length - 1; i >= 0; i--) {
    if (failureCount >= LOCKOUT_PROGRESSION[i].failureThreshold) {
      return LOCKOUT_PROGRESSION[i].durationMinutes;
    }
  }
  return 0; // No lockout
}

/**
 * Calculate the lockedUntil timestamp for a given failure count.
 * Returns null if no lockout should be applied.
 */
export function calculateLockedUntil(failureCount: number): Date | null {
  const durationMinutes = getLockoutDuration(failureCount);
  if (durationMinutes === 0) {
    return null;
  }
  const now = new Date();
  return new Date(now.getTime() + durationMinutes * 60 * 1000);
}
