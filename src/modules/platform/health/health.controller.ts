import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService, type HealthReport } from './health.service';
import { Public } from '../../../common/decorators/public.decorator';
import { RateLimit } from '../../../common/decorators/rate-limit.decorator';

@Controller('health')
@Public()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Liveness probe — the process is up. Always returns 200. */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RateLimit({ windowSeconds: 60, max: 600 })
  async liveness(): Promise<{ status: string; uptime: number }> {
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }

  /**
   * Readiness probe — 200 when all dependencies are healthy, 503 when any are down.
   * Uses `passthrough: true` so NestJS serialises the return value through the
   * ResponseEnvelopeInterceptor while still allowing us to set a custom status code
   * (see https://docs.nestjs.com/controllers#library-specific-approach item note).
   */
  @Get('ready')
  @RateLimit({ windowSeconds: 60, max: 600 })
  async readiness(@Res({ passthrough: true }) res: Response): Promise<HealthReport> {
    const report = await this.health.check();
    if (report.status !== 'ok') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return report;
  }
}
