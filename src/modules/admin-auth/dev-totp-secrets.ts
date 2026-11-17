/**
 * Deterministic TOTP secrets for dev/test seeded admin accounts.
 * NEVER available in production — these are loaded only by dev seeds.
 * Each secret is a base32-encoded string valid for RFC 6238 TOTP.
 *
 * These are stored ENCRYPTED in the DB via aesEncrypt() in the seed.
 */
export const DEV_TOTP_SECRETS = {
  superadmin: 'JBSWY3DPEHPK3PXP', // RFC 6238 reference test secret (base32 of "Hello!") — fixed for reproducible tests
  moderator: 'MFRA2RCHKRFA===='.replace(/=+$/, ''),
  support: 'NBSWY3DPEBLW64TMMQ======'.replace(/=+$/, ''),
  finance: 'IFAUCRKBKBCF6QKB',
  locktest: 'KRUGS4ZANFXHA4DF',
} as const satisfies Record<string, string>;

export type DevAdminKey = keyof typeof DEV_TOTP_SECRETS;
