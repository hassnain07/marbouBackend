import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { type RedisOptions } from 'ioredis';
import { Queue, Worker, type JobsOptions, type Processor } from 'bullmq';
import { configuration } from '../config/configuration';
import { QueueName } from './queue-names';

/**
 * QueuesService — BullMQ bootstrap (architecture §3 async tier, §8). Provides
 * `getQueue()` for producers and `registerProcessor()` for consumers. BullMQ
 * requires `maxRetriesPerRequest: null` on its connection. A down Redis is
 * reported by health checks; workers simply retry (NFR-REL-04).
 */
@Injectable()
export class QueuesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueuesService.name);
  private readonly connection: RedisOptions & { connection?: never };
  private readonly queues = new Map<string, Queue>();
  private readonly workers = new Map<string, Worker>();

  constructor() {
    // BullMQ manages its own connections from these options; we do not share the
    // cache connection (which has maxRetriesPerRequest set).
    const { port, hostname } = this.parseUrl(configuration.REDIS_URL);
    this.connection = { host: hostname, port, maxRetriesPerRequest: null };
  }

  onModuleInit(): void {
    // Pre-create the echo queue and register its processor so the Phase 0 smoke
    // test (`POST /dev/jobs/run/echo`) can exercise the full BullMQ loop.
    this.getQueue(QueueName.ECHO);
    this.registerProcessor(QueueName.ECHO, async (job) => {
      this.logger.log(`echo job ${job.id}: ${JSON.stringify(job.data)}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.workers.values()].map((w) => w.close()));
    await Promise.all([...this.queues.values()].map((q) => q.close()));
  }

  getQueue(name: string): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, { connection: { ...this.connection } });
      this.queues.set(name, queue);
    }
    return queue;
  }

  registerProcessor(name: string, processor: Processor, concurrency = 1): Worker {
    const existing = this.workers.get(name);
    if (existing) return existing;
    const worker = new Worker(name, processor, { connection: { ...this.connection }, concurrency });
    this.workers.set(name, worker);
    worker.on('failed', (job, err) =>
      this.logger.warn(`queue ${name} job ${job?.id} failed: ${err.message}`),
    );
    return worker;
  }

  async addJob(name: string, data: unknown, opts: JobsOptions = {}): Promise<void> {
    await this.getQueue(name).add('default', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 200,
      ...opts,
    });
  }

  /** Queue depth per queue — used by the system-health endpoint (ADM-22). */
  async queueDepths(): Promise<Record<string, number>> {
    const depths: Record<string, number> = {};
    for (const [name, queue] of this.queues.entries()) {
      try {
        const counts = await queue.getJobCounts('waiting', 'active', 'delayed');
        depths[name] = counts.waiting + counts.active + counts.delayed;
      } catch {
        depths[name] = -1;
      }
    }
    return depths;
  }

  private parseUrl(url: string): { port: number; hostname: string } {
    try {
      const u = new URL(url);
      return { hostname: u.hostname, port: Number(u.port) || 6379 };
    } catch {
      return { hostname: 'localhost', port: 6379 };
    }
  }
}
