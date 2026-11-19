import { hash, verify, type HashOptions } from 'argon2';

/**
 * Shared Argon2id parameters used by admin auth (Phase 2) and customer auth
 * (Phase 3). Moving to src/common/security/ so both modules import from one place.
 *
 * argon2id = type 2 in the argon2 package.
 */
export const ARGON2_PARAMS: HashOptions = {
  type: 2 as const, // argon2id
  memoryCost: 65536, // 64 MB
  timeCost: 3,
  parallelism: 4,
};

/**
 * Precomputed dummy hash for timing attack protection.
 * Unknown-email login verifies against this so response time is indistinguishable
 * from a wrong-password attempt on a real account.
 * The original password is intentionally not documented.
 */
export const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$6cMJlS2FDo2D+u1wAdQP9Q$iKtzpCP37pI/A2F6/snbXtM225OPlLzlsGT4VB6uEbg';

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_PARAMS);
}

export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, password);
  } catch {
    return false;
  }
}
