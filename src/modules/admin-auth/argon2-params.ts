/**
 * Re-export from the shared location so existing admin-auth imports continue to work.
 * @see src/common/security/argon2-params.ts
 */
export { ARGON2_PARAMS, DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from '../../common/security/argon2-params';
