import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService, type HealthReport } from './health.service';
import { Public } from '../../../common/decorators/public.decorator';
import { RateLimit } from '../../../common/decorators/rate-limit.decorator';

@Controller('health')
@Public()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Liveness probe — process is up. */
  @Get()
  @RateLimit({ windowSeconds: 60, max: 600 })
  async liveness(): Promise<{ status: string; uptime: number }> {
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }

  /** Readiness probe — all dependencies healthy, else 503 with the report. */
  @Get('ready')
  @RateLimit({ windowSeconds: 60, max: 600 })
  async readiness(@Res() res: Response): Promise<HealthReport> {
    const report = await this.health.check();
    if (report.status !== 'ok') res.status(503);
    return report;
  }
}
