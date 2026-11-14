/**
 * MARBOU seed runner — idempotent, upsert-based.
 * Run: npm run prisma:seed  (or npx prisma db seed)
 *
 * Phase 0: skeleton
 * Phase 1: admin user, feature flags, remote config defaults, Appendix C defaults
 */
import 'dotenv/config'; // load .env before any imports that read process.env
import { PrismaClient } from '@prisma/client';
import { seedAdmin } from './admin.seed';
import { seedFlags } from './flags.seed';
import { seedDefaults } from './defaults.seed';
import { seedRemoteConfig } from './remote-config.seed';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('▶ Starting MARBOU seed runner…');

  await seedAdmin(prisma);
  await seedRemoteConfig(prisma);
  await seedFlags(prisma);
  await seedDefaults(prisma);

  console.log('✔ Seed complete');
}

main()
  .catch((err) => {
    console.error('✖ Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
