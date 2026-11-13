import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaService — the single Prisma entry point for the whole app. Every module
 * owns its access through its own repository classes, which inject this service
 * (architecture §3 "Module rules"). Raw-SQL helpers (PostGIS, trigram, promoted
 * columns) live in `prisma/raw/` and call `prisma.$queryRaw`/`$executeRawUnsafe`
 * with parameterised queries only (§12 security checklist).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Prisma connected');
    } catch (err) {
      // Don't crash boot — health/ready reports DB as down. Later phases that
      // need the DB will surface a clear error (NFR-REL-04).
      this.logger.warn(`Prisma connect failed: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect().catch(() => undefined);
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
