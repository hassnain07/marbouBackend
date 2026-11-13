import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type JobMeta = Prisma.InputJsonObject | undefined;
type JobStatus = 'SUCCESS' | 'FAILED';

/**
 * JobRunService — records every background-job run (SYS-15, SYS-03). Each run is
 *  a JobRun row with name/status/startedAt/finishedAt/processed/errors/meta. The
 *  retention engine (Phase 23) also logs each purge run here. Writes degrade to a
 *  log entry when the DB is unavailable so workers never crash on observability.
 */
@Injectable()
export class JobRunService {
  private readonly logger = new Logger(JobRunService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Create a RUNNING JobRun row and return its id (or null if the DB is down). */
  async start(name: string, meta: JobMeta = undefined): Promise<string | null> {
    try {
      const run = await this.prisma.jobRun.create({
        data: { name, status: 'RUNNING', startedAt: new Date(), meta },
      });
      return run.id;
    } catch (err) {
      this.logger.warn(`JobRun.start (${name}) failed: ${(err as Error).message}`);
      return null;
    }
  }

  /** Mark a JobRun row finished with counts and an optional meta blob. */
  async finish(
    id: string | null,
    status: JobStatus,
    stats: { processed?: number; errors?: number; meta?: JobMeta } = {},
  ): Promise<void> {
    if (!id) return;
    try {
      await this.prisma.jobRun.update({
        where: { id },
        data: {
          status,
          finishedAt: new Date(),
          processed: stats.processed ?? 0,
          errors: stats.errors ?? 0,
          meta: stats.meta,
        },
      });
    } catch (err) {
      this.logger.warn(`JobRun.finish (${id}) failed: ${(err as Error).message}`);
    }
  }

  /** Convenience: run an async unit of work with automatic start/finish. */
  async run<T>(
    name: string,
    work: (mark: (stats: { processed?: number; errors?: number }) => void) => Promise<T>,
  ): Promise<T> {
    const id = await this.start(name);
    let processed = 0;
    let errors = 0;
    const mark = (s: { processed?: number; errors?: number }) => {
      processed = s.processed ?? processed;
      errors = s.errors ?? errors;
    };
    try {
      const result = await work(mark);
      await this.finish(id, 'SUCCESS', { processed, errors });
      return result;
    } catch (err) {
      await this.finish(id, 'FAILED', { processed, errors });
      throw err;
    }
  }
}
