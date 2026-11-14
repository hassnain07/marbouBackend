import type { PrismaClient } from '@prisma/client';
import { APPENDIX_C_DEFAULTS } from '../../src/modules/platform/defaults/defaults.constants';
import type { Prisma } from '@prisma/client';

/**
 * Seed all Appendix C configurable defaults. Idempotent — create-only (upsert
 * with empty update), so admin changes are never overwritten by re-seeding.
 */
export async function seedDefaults(prisma: PrismaClient): Promise<void> {
  let count = 0;
  for (const [key, entry] of Object.entries(APPENDIX_C_DEFAULTS)) {
    await prisma.defaultSetting.upsert({
      where: { key },
      create: {
        key,
        value: entry.value as Prisma.InputJsonValue,
        type: entry.type,
        description: entry.description,
        updatedBy: 'seed',
      },
      update: {}, // never overwrite on re-seed
    });
    count++;
  }
  console.log(`  ✔ Seeded ${count} Appendix C default settings`);
}
