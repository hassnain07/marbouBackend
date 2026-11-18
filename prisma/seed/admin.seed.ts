/**
 * Admin seed — idempotent.
 *
 * Production/staging (NODE_ENV != development|test):
 *   Creates exactly one SUPER_ADMIN from ADMIN_SEED_EMAIL/ADMIN_SEED_PASSWORD
 *   with TOTP NOT yet enrolled (forced enrollment at first login).
 *   Dev accounts are NEVER created.
 *
 * Development/test only:
 *   Also creates five dev accounts with deterministic TOTP secrets already
 *   enrolled so Postman/e2e tests can log in automatically.
 *
 * Uses the shared hashPassword() helper (argon2-params.ts) so all admin
 * password hashes are created with identical Argon2id parameters (item 5).
 */
import type { PrismaClient } from '@prisma/client';

const IS_DEV_OR_TEST = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';

export async function seedAdmin(prisma: PrismaClient): Promise<void> {
  // Dynamic import of shared helper keeps the seed free of circular compile-time deps
  const { hashPassword } = await import('../../src/modules/admin-auth/argon2-params');

  const email = (process.env.ADMIN_SEED_EMAIL ?? 'admin@marbou.test').trim().toLowerCase();
  const password = process.env.ADMIN_SEED_PASSWORD ?? 'ChangeMe!2026#';

  // ── Super Admin (all environments) ───────────────────────────────────────
  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (!existing) {
    const passwordHash = await hashPassword(password);
    await prisma.adminUser.create({
      data: {
        email,
        passwordHash,
        fullName: 'Super Admin',
        role: 'SUPER_ADMIN',
        totpSecret: null,
        totpEnabledAt: null,
        isActive: true,
      },
    });
    console.log(`  ✔ Created Super Admin ${email} (TOTP enrollment required at first login)`);
  } else {
    console.log(`  ✔ Super Admin ${email} already exists (skipping)`);
  }

  if (!IS_DEV_OR_TEST) return;

  // ── Dev-only accounts — NEVER created in staging/production ──────────────
  const { DEV_TOTP_SECRETS } = await import('../../src/modules/admin-auth/dev-totp-secrets');
  const { aesEncrypt } = await import('../../src/common/utils/aes');

  const devAccounts: Array<{
    key: keyof typeof DEV_TOTP_SECRETS;
    email: string;
    fullName: string;
    role: 'SUPER_ADMIN' | 'CONTENT_MODERATOR' | 'SUPPORT_AGENT' | 'FINANCIAL_AUDITOR';
  }> = [
    { key: 'superadmin', email: 'sa@dev.marbou.test',   fullName: 'Dev SA',        role: 'SUPER_ADMIN' },
    { key: 'moderator',  email: 'mod@dev.marbou.test',  fullName: 'Dev MOD',       role: 'CONTENT_MODERATOR' },
    { key: 'support',    email: 'sup@dev.marbou.test',  fullName: 'Dev SUP',       role: 'SUPPORT_AGENT' },
    { key: 'finance',    email: 'fin@dev.marbou.test',  fullName: 'Dev FIN',       role: 'FINANCIAL_AUDITOR' },
    { key: 'locktest',   email: 'lock@dev.marbou.test', fullName: 'Lock Test',     role: 'SUPPORT_AGENT' },
  ];

  for (const acc of devAccounts) {
    const alreadyExists = await prisma.adminUser.findUnique({ where: { email: acc.email } });
    if (alreadyExists) {
      console.log(`  ✔ Dev admin ${acc.email} already exists (skipping)`);
      continue;
    }
    const passwordHash = await hashPassword(password);
    const encryptedSecret = aesEncrypt(DEV_TOTP_SECRETS[acc.key]);
    await prisma.adminUser.create({
      data: {
        email: acc.email,
        passwordHash,
        fullName: acc.fullName,
        role: acc.role,
        totpSecret: encryptedSecret,
        totpEnabledAt: new Date(),
        isActive: true,
      },
    });
    console.log(`  ✔ Created dev admin ${acc.email} (${acc.role}, TOTP pre-enrolled)`);
  }
}
