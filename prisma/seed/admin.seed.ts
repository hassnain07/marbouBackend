/**
 * Admin seed — idempotent.
 *
 * Production (NODE_ENV=production):
 *   Creates exactly one SUPER_ADMIN from ADMIN_SEED_EMAIL/ADMIN_SEED_PASSWORD
 *   with TOTP NOT yet enrolled (forced enrollment at first login).
 *
 * Development/test (NODE_ENV != production):
 *   Creates five additional dev-only accounts with KNOWN, DETERMINISTIC TOTP
 *   secrets already enrolled so Postman/e2e tests can log in automatically.
 *   The prod super-admin is also created (or skipped if present).
 */
import type { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';

// Use require() to avoid a top-level import of dev-only code in production builds.
const IS_PROD = process.env.NODE_ENV === 'production';

async function argon2(pw: string): Promise<string> {
  return hash(pw, { memoryCost: 65536, timeCost: 3, parallelism: 1 });
}

export async function seedAdmin(prisma: PrismaClient): Promise<void> {
  const email = process.env.ADMIN_SEED_EMAIL ?? 'admin@marbou.test';
  const password = process.env.ADMIN_SEED_PASSWORD ?? 'ChangeMe!2026#';

  // ── Production / initial super admin ─────────────────────────────────────
  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (!existing) {
    const passwordHash = await argon2(password);
    await prisma.adminUser.create({
      data: {
        email,
        passwordHash,
        fullName: 'Super Admin',
        role: 'SUPER_ADMIN',
        totpSecret: null, // must enroll TOTP at first login
        totpEnabledAt: null,
        isActive: true,
      },
    });
    console.log(`  ✔ Created Super Admin ${email} (TOTP enrollment required at first login)`);
  } else {
    console.log(`  ✔ Super Admin ${email} already exists (skipping)`);
  }

  if (IS_PROD) return;

  // ── Dev-only accounts — NEVER create in production ───────────────────────
  // Dynamic import avoids bundling dev secrets in production.
  const { DEV_TOTP_SECRETS } = await import(
    '../../src/modules/admin-auth/dev-totp-secrets'
  );
  const { aesEncrypt } = await import('../../src/common/utils/aes');

  const devAccounts: Array<{
    key: keyof typeof DEV_TOTP_SECRETS;
    email: string;
    fullName: string;
    role: 'SUPER_ADMIN' | 'CONTENT_MODERATOR' | 'SUPPORT_AGENT' | 'FINANCIAL_AUDITOR';
  }> = [
    { key: 'superadmin', email: 'sa@dev.marbou.test', fullName: 'Dev SA', role: 'SUPER_ADMIN' },
    { key: 'moderator', email: 'mod@dev.marbou.test', fullName: 'Dev MOD', role: 'CONTENT_MODERATOR' },
    { key: 'support', email: 'sup@dev.marbou.test', fullName: 'Dev SUP', role: 'SUPPORT_AGENT' },
    { key: 'finance', email: 'fin@dev.marbou.test', fullName: 'Dev FIN', role: 'FINANCIAL_AUDITOR' },
    { key: 'locktest', email: 'lock@dev.marbou.test', fullName: 'Lock Test', role: 'SUPPORT_AGENT' },
  ];

  for (const acc of devAccounts) {
    const existing = await prisma.adminUser.findUnique({ where: { email: acc.email } });
    if (existing) {
      console.log(`  ✔ Dev admin ${acc.email} already exists (skipping)`);
      continue;
    }
    const passwordHash = await argon2(process.env.ADMIN_SEED_PASSWORD ?? 'ChangeMe!2026#');
    const secret = DEV_TOTP_SECRETS[acc.key];
    const encryptedSecret = aesEncrypt(secret);
    await prisma.adminUser.create({
      data: {
        email: acc.email,
        passwordHash,
        fullName: acc.fullName,
        role: acc.role,
        totpSecret: encryptedSecret,
        totpEnabledAt: new Date(), // already enrolled with the known test secret
        isActive: true,
      },
    });
    console.log(`  ✔ Created dev admin ${acc.email} (${acc.role}, TOTP pre-enrolled)`);
  }
}
