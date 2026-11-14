import type { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import {
  RemoteConfigKey,
  DEFAULT_APP_VERSIONS,
  DEFAULT_MAINTENANCE,
  DEFAULT_MEDIA_LIMITS,
} from '../../src/modules/platform/remote-config/remote-config.types';

/** Seed RemoteConfig defaults. Idempotent — create-only. */
export async function seedRemoteConfig(prisma: PrismaClient): Promise<void> {
  const entries = [
    { key: RemoteConfigKey.APP_VERSIONS, value: DEFAULT_APP_VERSIONS },
    { key: RemoteConfigKey.MAINTENANCE, value: DEFAULT_MAINTENANCE },
    { key: RemoteConfigKey.MEDIA_LIMITS, value: DEFAULT_MEDIA_LIMITS },
  ];
  for (const entry of entries) {
    await prisma.remoteConfig.upsert({
      where: { key: entry.key },
      create: {
        key: entry.key,
        value: entry.value as unknown as Prisma.InputJsonValue,
        version: 1,
        updatedBy: 'seed',
      },
      update: {}, // create-only
    });
  }
  console.log('  ✔ Seeded RemoteConfig (appVersions, maintenance, mediaLimits)');
}
