import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { DevOnlyGuard } from '../../../common/guards/dev-only.guard';
import { RateLimit } from '../../../common/decorators/rate-limit.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { zodPipe } from '../../../common/pipes/zod-validation.pipe';
import { QueuesService } from '../../../queues/queues.service';
import { QueueName } from '../../../queues/queue-names';
import { PrismaService } from '../../../prisma/prisma.service';

/** Dev helper routes — never available in production (architecture §13). */
@Controller('dev')
@UseGuards(DevOnlyGuard)
@Public()
export class DevController {
  constructor(
    private readonly queues: QueuesService,
    private readonly prisma: PrismaService,
  ) {}

  /** Echoes a validated body. Invalid body → 422 with details[] (Postman P00). */
  @Post('echo')
  echo(
    @Body(zodPipe(z.object({ message: z.string().min(1) })))
    body: { message: string },
  ): { echo: string } {
    return { echo: body.message };
  }

  /** Trivial rate-limit target — 5 calls/min allowed, 6th returns 429. */
  @Get('rate-test')
  @RateLimit({ windowSeconds: 60, max: 5 })
  rateTest(): { ok: boolean } {
    return { ok: true };
  }

  /**
   * Enqueue a smoke job on the BullMQ echo queue. The echo processor (registered
   * in QueuesModule.onModuleInit) writes a JobRun row via JobRunService.
   * Returns 503 when Redis is down.
   */
  @Post('jobs/run/echo')
  @RateLimit({ windowSeconds: 60, max: 30 })
  async runEcho(
    @Body(zodPipe(z.object({ text: z.string().optional() }).optional()))
    body?: { text?: string },
  ): Promise<{ enqueued: true }> {
    await this.queues.addJob(QueueName.ECHO, { text: body?.text ?? 'smoke' });
    return { enqueued: true };
  }

  /**
   * Return the latest JobRun rows for a given job name (default: echo).
   * Verifiable in Postman to confirm the echo processor executed.
   */
  @Get('jobs/runs')
  async jobRuns(
    @Query('name') name?: string,
    @Query('limit') limit?: string,
  ): Promise<{ runs: unknown[] }> {
    const jobName = name ?? QueueName.ECHO;
    const take = Math.min(Number(limit ?? 10) || 10, 50);
    const runs = await this.prisma.jobRun.findMany({
      where: { name: jobName },
      orderBy: { startedAt: 'desc' },
      take,
    });
    return { runs };
  }
}
