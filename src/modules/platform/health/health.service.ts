import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import { configuration } from '../../../config/configuration';

export interface HealthReport {
  status: 'ok' | 'degraded';
  uptime: number;
  db: boolean;
  redis: boolean;
  storage: boolean;
}

/**
 * HealthService — probes DB (Prisma), Redis and object storage. Each probe is
 * independent and returns a boolean so the ready endpoint can report a precise
 * degraded state (architecture §7.1, NFR-OBS-01). Storage is an HTTP probe to
 * the S3 endpoint until the real storage adapter lands in Phase 7.
 */
@Injectable()
export class HealthService {

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async check(): Promise<HealthReport> {
    const [db, redis, storage] = await Promise.all([
      this.prisma.isHealthy(),
      this.redis.isHealthy(),
      this.checkStorage(),
    ]);
    const ok = db && redis && storage;
    return { status: ok ? 'ok' : 'degraded', uptime: Math.round(process.uptime()), db, redis, storage };
  }

  async isReady(): Promise<boolean> {
    const report = await this.check();
    return report.status === 'ok';
  }

  private async checkStorage(): Promise<boolean> {
    const endpoint = configuration.S3_ENDPOINT;
    if (!endpoint) return false;
    try {
      const url = new URL(endpoint);
      const lib = url.protocol === 'https:' ? await import('node:https') : await import('node:http');
      return await new Promise<boolean>((resolve) => {
        const req = lib.request(
          { hostname: url.hostname, port: url.port, path: '/minio/health/live', method: 'GET', timeout: 1500 },
          (res) => {
            // Any HTTP response means the server is up (MinIO returns 200/403/404).
            res.destroy();
            resolve(res.statusCode != null);
          },
        );
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
          req.destroy();
          resolve(false);
        });
        req.end();
      });
    } catch {
      return false;
    }
  }
}
