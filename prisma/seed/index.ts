/**
 * Prisma seed runner — idempotent skeleton (Phase 0).
 * Run via:  npm run prisma:seed
 *
 * Each seeder is imported and run in phase order. Seeds that
 * already exist are skipped (upsert / createIfNotExists pattern).
 * Phase 1+ adds: flags.seed, defaults.seed, geography.seed,
 *                categories/*.seed, translations.seed, admin.seed,
 *                demo.seed (dev-only).
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('▶ Starting MARBOU seed runner…');

  // ── Phase 0: no rows to seed yet. ──────────────────────────────────────────
  // The seed file is here so `npm run prisma:seed` runs cleanly from a fresh
  // clone and can be verified in CI. Actual seeders are imported in later
  // phases and placed in prisma/seed/<phase>/<name>.seed.ts.

  console.log('✔ Seed complete (Phase 0 — nothing to seed yet)');
}

main()
  .catch((err) => {
    console.error('✖ Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
