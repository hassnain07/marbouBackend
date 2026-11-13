import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker, type JobsOptions, type Processor } from 'bullmq';
import type { RedisOptions } from 'ioredis';
import { configuration } from '../config/configuration';
import { QueueName } from './queue-names';
import { AppError } from '../common/errors/app-error';
import { ErrorCodes } from '../common/errors/error-codes';

type BullRedisConnection = RedisOptions & { maxRetriesPerRequest: null };

/**
 * QueuesService — BullMQ bootstrap (architecture §3 async tier, §8).
 * Parses the full REDIS_URL (auth, DB number, rediss:// TLS) into a BullMQ
 * ConnectionOptions. Provides `addJob()` for producers; processors are registered
 * in `onModuleInit`. When Redis is down, `addJob()` fails fast with 503 instead
 * of hanging on retries.
 */
@Injectable()
export class QueuesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueuesService.name);
  private readonly connection: BullRedisConnection;
  private readonly queues = new Map<string, Queue>();
  private readonly workers = new Map<string, Worker>();

  constructor() {
    this.connection = QueuesService.parseRedisUrl(configuration.REDIS_URL);
  }

  onModuleInit(): void {
    // Pre-create the echo queue; processor is registered by QueuesModule (item 11).
    this.getQueue(QueueName.ECHO);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([...this.workers.values()].map((w) => w.close()));
    await Promise.allSettled([...this.queues.values()].map((q) => q.close()));
  }

  getQueue(name: string): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, { connection: this.connection });
      this.queues.set(name, queue);
    }
    return queue;
  }

  registerProcessor(name: string, processor: Processor, concurrency = 1): Worker {
    const existing = this.workers.get(name);
    if (existing) return existing;
    const worker = new Worker(name, processor, {
      connection: this.connection,
      concurrency,
    });
    this.workers.set(name, worker);
    worker.on('failed', (job, err) =>
      this.logger.warn(`queue ${name} job ${job?.id} failed: ${err.message}`),
    );
    return worker;
  }

  /**
   * Enqueue a job. Wraps the BullMQ call in a 3-second timeout so callers
   * receive a prompt 503 when Redis is unavailable instead of hanging.
   */
  async addJob(name: string, data: unknown, opts: JobsOptions = {}): Promise<void> {
    const queue = this.getQueue(name);
    const addPromise = queue.add('default', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 200,
      ...opts,
    });
    // Race with a short timeout so a down Redis fails fast with 503.
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Queue add timeout — Redis may be down')), 3000),
    );
    try {
      await Promise.race([addPromise, timeout]);
    } catch (err) {
      const msg = (err as Error).message ?? '';
      throw new AppError(ErrorCodes.SERVICE_UNAVAILABLE, 503, { message: msg });
    }
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

  /**
   * Parse a full REDIS_URL into a BullMQ-compatible ioredis connection object.
   *   redis://[user:password@]host[:port][/db]
   *   rediss://...  (TLS)
   */
  static parseRedisUrl(url: string): BullRedisConnection {
    try {
      const u = new URL(url);
      const opts: BullRedisConnection = {
        host: u.hostname || 'localhost',
        port: Number(u.port) || 6379,
        maxRetriesPerRequest: null,
      };
      if (u.password) opts.password = decodeURIComponent(u.password);
      if (u.username && u.username !== 'default') opts.username = decodeURIComponent(u.username);
      const db = u.pathname.replace(/^\//, '');
      if (db && /^\d+$/.test(db)) (opts as any).db = Number(db);
      if (u.protocol === 'rediss:') (opts as any).tls = {};
      return opts;
    } catch {
      return { host: 'localhost', port: 6379, maxRetriesPerRequest: null };
    }
  }
}
