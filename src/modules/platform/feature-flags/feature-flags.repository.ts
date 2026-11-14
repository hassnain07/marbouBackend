import { Injectable } from '@nestjs/common';
import type { Prisma, FeatureFlag } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class FeatureFlagsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<FeatureFlag[]> {
    return this.prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
  }

  async findByKey(key: string): Promise<FeatureFlag | null> {
    return this.prisma.featureFlag.findUnique({ where: { key } });
  }

  async upsert(data: {
    key: string;
    enabled: boolean;
    config?: unknown;
    countryOverrides?: unknown;
    description?: string;
    updatedBy: string;
  }): Promise<FeatureFlag> {
    const val: Prisma.FeatureFlagUpdateInput = {
      enabled: data.enabled,
      config: (data.config ?? null) as Prisma.InputJsonValue,
      countryOverrides: (data.countryOverrides ?? null) as Prisma.InputJsonValue,
      description: data.description,
      updatedBy: data.updatedBy,
    };
    return this.prisma.featureFlag.upsert({
      where: { key: data.key },
      create: { key: data.key, ...val } as Prisma.FeatureFlagCreateInput,
      update: val,
    });
  }

  async update(
    key: string,
    patch: { enabled?: boolean; config?: unknown; countryOverrides?: unknown; updatedBy: string },
  ): Promise<FeatureFlag> {
    return this.prisma.featureFlag.update({
      where: { key },
      data: {
        ...(patch.enabled !== undefined && { enabled: patch.enabled }),
        ...(patch.config !== undefined && { config: patch.config as Prisma.InputJsonValue }),
        ...(patch.countryOverrides !== undefined && {
          countryOverrides: patch.countryOverrides as Prisma.InputJsonValue,
        }),
        updatedBy: patch.updatedBy,
      },
    });
  }

  async appendHistory(data: {
    flagKey: string;
    enabled: boolean;
    config?: unknown;
    changedBy: string;
  }) {
    return this.prisma.featureFlagHistory.create({
      data: {
        flagKey: data.flagKey,
        enabled: data.enabled,
        config: (data.config ?? null) as Prisma.InputJsonValue,
        changedBy: data.changedBy,
      },
    });
  }

  async getHistory(key: string) {
    return this.prisma.featureFlagHistory.findMany({
      where: { flagKey: key },
      orderBy: { changedAt: 'desc' },
    });
  }
}
