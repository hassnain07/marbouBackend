import { hash, verify, type HashOptions } from 'argon2';

/**
 * Shared Argon2id parameters for admin password hashing (A7).
 *
 * Used by:
 * - Seed (creating initial admin accounts)
 * - POST /admin/admin-users (creating new admins)
 * - Login service (verifying passwords AND generating a dummy hash for timing attack protection)
 *
 * Centralizing these ensures the dummy hash matches real hash timing.
 *
 * argon2id = type 2 in the argon2 package (argon2id constant exported as 2).
 */
export const ARGON2_PARAMS: HashOptions = {
  type: 2 as const, // argon2id
  memoryCost: 65536, // 64 MB
  timeCost: 3,
  parallelism: 4,
};

/**
 * Precomputed dummy hash for timing attack protection (A7).
 *
 * When an unknown email attempts login, we verify against this hash instead of
 * immediately returning 401. This makes unknown-email and wrong-password timing
 * indistinguishable. The original password used to generate this hash is
 * intentionally not documented here — the value exists purely for constant-time
 * verification and must never be used to authenticate anyone.
 */
export const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$6cMJlS2FDo2D+u1wAdQP9Q$iKtzpCP37pI/A2F6/snbXtM225OPlLzlsGT4VB6uEbg';

/**
 * Hash a password with the standard admin parameters.
 */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_PARAMS);
}

/**
 * Verify a password against a hash.
 */
export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, password);
  } catch {
    return false;
  }
}
