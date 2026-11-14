import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import { AuditService } from '../audit/audit.service';
import { AuditActorType } from '../audit/audit.constants';
import { APPENDIX_C_DEFAULTS } from './defaults.constants';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCodes } from '../../../common/errors/error-codes';

const CACHE_TTL = 300; // 5 min cache; changed values invalidated immediately
const cacheKey = (k: string) => `platform:default:${k}`;

@Injectable()
export class DefaultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Type-safe accessor for Appendix C values.
   * Usage: defaults.get('listing.rate.perHour') → 5
   * Returns the DB-persisted value if present, the seed default otherwise.
   */
  async get<T = unknown>(key: string): Promise<T> {
    return this.redis.cacheAside<T>(cacheKey(key), CACHE_TTL, async () => {
      const row = await this.prisma.defaultSetting.findUnique({ where: { key } });
      if (row) return row.value as T;
      const def = APPENDIX_C_DEFAULTS[key];
      return (def?.value ?? null) as T;
    });
  }

  async findAll() {
    return this.prisma.defaultSetting.findMany({ orderBy: { key: 'asc' } });
  }

  async patch(key: string, newValue: unknown, actorId: string) {
    const def = APPENDIX_C_DEFAULTS[key];
    const existing = await this.prisma.defaultSetting.findUnique({ where: { key } });
    if (!existing && !def) {
      throw AppError.notFound(ErrorCodes.NOT_FOUND, `Default '${key}' not found`);
    }
    const expectedType = def?.type ?? existing?.type;
    if (expectedType && typeof newValue !== expectedType && expectedType !== 'object') {
      throw AppError.unprocessable(ErrorCodes.DEFAULTS_INVALID_TYPE, [
        {
          field: 'value',
          issue: `Expected type '${expectedType}' but got '${typeof newValue}'`,
        },
      ]);
    }
    const before = existing?.value ?? def?.value ?? null;
    const updated = await this.prisma.defaultSetting.upsert({
      where: { key },
      create: {
        key,
        value: newValue as Prisma.InputJsonValue,
        type: (expectedType ?? 'string') as string,
        description: def?.description,
        updatedBy: actorId,
      },
      update: {
        value: newValue as Prisma.InputJsonValue,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorType: AuditActorType.ADMIN,
      actorId,
      action: 'default.patch',
      entity: 'DefaultSetting',
      entityId: key,
      before,
      after: newValue,
    });
    await this.redis.cacheInvalidate(cacheKey(key));
    return updated;
  }

  /** Seed all Appendix C defaults idempotently (create-only, never overwrite). */
  async seedDefaults(): Promise<void> {
    for (const [key, entry] of Object.entries(APPENDIX_C_DEFAULTS)) {
      await this.prisma.defaultSetting.upsert({
        where: { key },
        create: {
          key,
          value: entry.value as Prisma.InputJsonValue,
          type: entry.type,
          description: entry.description,
          updatedBy: 'seed',
        },
        update: {}, // never overwrite on reseed
      });
    }
  }
}
