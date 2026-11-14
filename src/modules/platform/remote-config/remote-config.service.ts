import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import { AuditService } from '../audit/audit.service';
import { AuditActorType } from '../audit/audit.constants';
import {
  RemoteConfigKey,
  DEFAULT_APP_VERSIONS,
  DEFAULT_MAINTENANCE,
  DEFAULT_MEDIA_LIMITS,
  type AppVersionConfig,
  type MaintenanceConfig,
  type MediaLimitsConfig,
} from './remote-config.types';

const CACHE_TTL = 60; // seconds
const cacheKey = (k: string) => `platform:rc:${k}`;

@Injectable()
export class RemoteConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  // ── Generic get/set ─────────────────────────────────────────────────────

  private async getRaw<T>(key: RemoteConfigKey, defaultValue: T): Promise<T> {
    return this.redis.cacheAside<T>(cacheKey(key), CACHE_TTL, async () => {
      const row = await this.prisma.remoteConfig.findUnique({ where: { key } });
      return row ? (row.value as T) : defaultValue;
    });
  }

  private async setRaw<T>(
    key: RemoteConfigKey,
    value: T,
    actorId: string,
    entity: string,
  ): Promise<T> {
    const existing = await this.prisma.remoteConfig.findUnique({ where: { key } });
    const before = existing?.value ?? null;
    await this.prisma.remoteConfig.upsert({
      where: { key },
      create: {
        key,
        value: value as unknown as Prisma.InputJsonValue,
        version: 1,
        updatedBy: actorId,
      },
      update: {
        value: value as unknown as Prisma.InputJsonValue,
        version: { increment: 1 },
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorType: AuditActorType.ADMIN,
      actorId,
      action: `remoteConfig.set.${key}`,
      entity,
      entityId: key,
      before,
      after: value,
    });
    await this.redis.cacheInvalidate(cacheKey(key));
    return value;
  }

  // ── Typed accessors ──────────────────────────────────────────────────────

  async getAppVersions(): Promise<AppVersionConfig> {
    return this.getRaw(RemoteConfigKey.APP_VERSIONS, DEFAULT_APP_VERSIONS);
  }
  async setAppVersions(v: AppVersionConfig, actorId: string): Promise<AppVersionConfig> {
    return this.setRaw(RemoteConfigKey.APP_VERSIONS, v, actorId, 'AppVersionConfig');
  }

  async getMaintenance(): Promise<MaintenanceConfig> {
    return this.getRaw(RemoteConfigKey.MAINTENANCE, DEFAULT_MAINTENANCE);
  }
  async setMaintenance(v: MaintenanceConfig, actorId: string): Promise<MaintenanceConfig> {
    return this.setRaw(RemoteConfigKey.MAINTENANCE, v, actorId, 'MaintenanceConfig');
  }

  async getMediaLimits(): Promise<MediaLimitsConfig> {
    return this.getRaw(RemoteConfigKey.MEDIA_LIMITS, DEFAULT_MEDIA_LIMITS);
  }
  async setMediaLimits(v: MediaLimitsConfig, actorId: string): Promise<MediaLimitsConfig> {
    return this.setRaw(RemoteConfigKey.MEDIA_LIMITS, v, actorId, 'MediaLimitsConfig');
  }

  /** Seed defaults idempotently (never overwrites if already present). */
  async seedDefaults(): Promise<void> {
    for (const [key, value] of [
      [RemoteConfigKey.APP_VERSIONS, DEFAULT_APP_VERSIONS],
      [RemoteConfigKey.MAINTENANCE, DEFAULT_MAINTENANCE],
      [RemoteConfigKey.MEDIA_LIMITS, DEFAULT_MEDIA_LIMITS],
    ] as const) {
      await this.prisma.remoteConfig.upsert({
        where: { key },
        create: { key, value: value as unknown as Prisma.InputJsonValue, version: 1, updatedBy: 'seed' },
        update: {},
      });
    }
  }
}
