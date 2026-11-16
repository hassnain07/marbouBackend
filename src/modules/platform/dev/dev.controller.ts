import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { DevOnlyGuard } from '../../../common/guards/dev-only.guard';
import { RateLimit } from '../../../common/decorators/rate-limit.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { RequiresFlag } from '../../../common/decorators/requires-flag.decorator';
import { zodPipe } from '../../../common/pipes/zod-validation.pipe';
import { QueuesService } from '../../../queues/queues.service';
import { QueueName } from '../../../queues/queue-names';
import { PrismaService } from '../../../prisma/prisma.service';
import { aesDecrypt } from '../../../common/utils/aes';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCodes } from '../../../common/errors/error-codes';

/** Dev helper routes — never available in production (architecture §13). */
@Controller('dev')
@UseGuards(DevOnlyGuard)
@Public()
export class DevController {
  constructor(
    private readonly queues: QueuesService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Dev flag-test route: requires ENABLE_MONETIZATION flag to be ON.
   * Used in e2e tests to verify FlagGuard works end-to-end.
   */
  @Get('flag-test')
  @RequiresFlag('ENABLE_MONETIZATION')
  flagTest(): { flagEnabled: true } {
    return { flagEnabled: true };
  }

  /** Echoes a validated body. Invalid body → 422 with details[]. */
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

  /** Enqueue a smoke job on the BullMQ echo queue. */
  @Post('jobs/run/echo')
  @RateLimit({ windowSeconds: 60, max: 30 })
  async runEcho(
    @Body(zodPipe(z.object({ text: z.string().optional() }).optional()))
    body?: { text?: string },
  ): Promise<{ enqueued: true }> {
    await this.queues.addJob(QueueName.ECHO, { text: body?.text ?? 'smoke' });
    return { enqueued: true };
  }

  /** Return the latest JobRun rows for a given job name. */
  @Get('jobs/runs')
  async jobRuns(@Query('name') name?: string, @Query('limit') limit?: string): Promise<{ runs: unknown[] }> {
    const jobName = name ?? QueueName.ECHO;
    const take = Math.min(Number(limit ?? 10) || 10, 50);
    const runs = await this.prisma.jobRun.findMany({
      where: { name: jobName },
      orderBy: { startedAt: 'desc' },
      take,
    });
    return { runs };
  }

  /**
   * Dev-only: return the current valid TOTP code for an admin email.
   * Used by Postman/e2e to log in dev accounts automatically.
   * GET /dev/admin/totp?email=sa@dev.marbou.test
   */
  @Get('admin/totp')
  async getAdminTotp(@Query('email') email?: string): Promise<{ code: string; email: string }> {
    if (!email) {
      throw AppError.badRequest(ErrorCodes.VALIDATION_FAILED, [{ field: 'email', issue: 'email is required' }]);
    }
    const admin = await this.prisma.adminUser.findUnique({ where: { email } });
    if (!admin || !admin.totpSecret) {
      throw AppError.notFound(ErrorCodes.NOT_FOUND, `Admin or TOTP secret not found for ${email}`);
    }
    const secret = aesDecrypt(admin.totpSecret);
    // Import HOTP to avoid circular deps at module level
    const { hotp, currentTotpStep } = await import('../../../common/utils/totp');
    const code = hotp(secret, currentTotpStep());
    return { code, email };
  }

  /**
   * Dev-only: unlock an admin account (clear lockout and failed-attempt counter).
   * POST /dev/admin/unlock {email}
   */
  @Post('admin/unlock')
  async unlockAdmin(
    @Body(zodPipe(z.object({ email: z.string().email() }))) body: { email: string },
  ): Promise<{ unlocked: true }> {
    const admin = await this.prisma.adminUser.findUnique({ where: { email: body.email } });
    if (!admin) {
      throw AppError.notFound(ErrorCodes.NOT_FOUND, `Admin not found: ${body.email}`);
    }
    await this.prisma.adminUser.update({
      where: { email: body.email },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
    return { unlocked: true };
  }
}
