import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { DevOnlyGuard } from '../../../common/guards/dev-only.guard';
import { RateLimit } from '../../../common/decorators/rate-limit.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { zodPipe } from '../../../common/pipes/zod-validation.pipe';
import { QueuesService } from '../../../queues/queues.service';
import { QueueName } from '../../../queues/queue-names';

/** Dev helper routes — never available in production (architecture §13). */
@Controller('dev')
@UseGuards(DevOnlyGuard)
@Public()
export class DevController {
  constructor(private readonly queues: QueuesService) {}

  /** Echoes a validated body. Invalid body → 422 with details[] (Postman P00). */
  @Post('echo')
  echo(@Body(zodPipe(z.object({ message: z.string().min(1) }))) body: { message: string }): {
    echo: string;
  } {
    return { echo: body.message };
  }

  /** Trivial rate-limit target — the 6th call in a minute returns 429. */
  @Get('rate-test')
  @RateLimit({ windowSeconds: 60, max: 5 })
  rateTest(): { ok: boolean } {
    return { ok: true };
  }

  /** Enqueue a smoke job on the BullMQ echo queue. */
  @Post('jobs/run/echo')
  @RateLimit({ windowSeconds: 60, max: 30 })
  async runEcho(@Body(zodPipe(z.object({ text: z.string().optional() }).optional())) body?: {
    text?: string;
  }): Promise<{ enqueued: true }> {
    await this.queues.addJob(QueueName.ECHO, { text: body?.text ?? 'smoke' });
    return { enqueued: true };
  }
}
