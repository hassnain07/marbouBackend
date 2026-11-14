import type { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';

/**
 * Seed the first SUPER_ADMIN AdminUser. Idempotent — skips if the email is
 * already present. Password is Argon2id-hashed. No TOTP logic (Phase 2).
 * Credentials come from env: ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD.
 */
export async function seedAdmin(prisma: PrismaClient): Promise<void> {
  const email = process.env.ADMIN_SEED_EMAIL ?? 'admin@marbou.test';
  const password = process.env.ADMIN_SEED_PASSWORD ?? 'ChangeMe!2026';

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) {
    console.log(`  ✔ AdminUser ${email} already exists (skipping)`);
    return;
  }

  const passwordHash = await hash(password, {
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });

  await prisma.adminUser.create({
    data: {
      email,
      passwordHash,
      fullName: 'Super Admin',
      role: 'SUPER_ADMIN',
      totpSecret: 'PLACEHOLDER_PHASE2_TOTP', // replaced by real TOTP in Phase 2
      isActive: true,
    },
  });
  console.log(`  ✔ Seeded AdminUser ${email} (SUPER_ADMIN)`);
}
