import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import IORedis, { type Redis } from 'ioredis';
import { configuration } from '../config/configuration';

/**
 * RedisService — single connection (cache, rate-limit counters, pub/sub) plus a
 * dedicated duplicate for Socket.io adapter / pubsub consumers (architecture §3,
 * §5.5). The client connects lazily; a down Redis is reported by health checks
 * rather than crashing the app, so the API still boots (NFR-REL-04).
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;
  /** Separate connection reserved for pub/sub & the Socket.io adapter. */
  readonly pubsub: Redis;

  constructor() {
    const url = configuration.REDIS_URL;
    this.client = new IORedis(url, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
      // Keep pino logs clean; connection errors surface in health checks.
    });
    this.pubsub = this.client.duplicate();
    // Attach error listeners immediately so unhandled connection errors never
    // crash the process before onModuleInit runs.
    this.client.on('error', (err) => this.logger.warn(`Redis client error: ${err.message}`));
    this.pubsub.on('error', (err) => this.logger.warn(`Redis pubsub error: ${err.message}`));
  }

  onModuleInit(): void {
    // Listeners already attached in the constructor; nothing to do here.
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => undefined);
    await this.pubsub.quit().catch(() => undefined);
  }

  /** True when the client can reach Redis. */
  async isHealthy(): Promise<boolean> {
    try {
      const pong = await this.client.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }

  // ── Cache-aside helpers (§5.5) ──

  async cacheGet<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async cacheDel(key: string): Promise<void> {
    await this.client.del(key);
  }

  /** Read-through cache: return cached value or compute, store and return it. */
  async cacheAside<T>(
    key: string,
    ttlSeconds: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.cacheGet<T>(key);
    if (cached !== null) return cached;
    const fresh = await loader();
    await this.cacheSet(key, fresh, ttlSeconds).catch((err) =>
      this.logger.warn(`cacheSet failed for ${key}: ${err.message}`),
    );
    return fresh;
  }

  /** Invalidate a set of cache keys (used by admin writes, §5.5). */
  async cacheInvalidate(...keys: string[]): Promise<void> {
    if (keys.length) await this.client.del(...keys);
  }

  // ── Rate-limit counters (AUTH-17, NFR-SEC-05) ──

  /**
   * Sliding-ish fixed-window counter. INCR + EXPIRE gives an atomic count for the
   * window. Returns the current count, whether the call is allowed, and seconds
   * until the window resets (Retry-After).
   */
  async rateLimit(
    key: string,
    windowSeconds: number,
    max: number,
  ): Promise<{ count: number; allowed: boolean; retryAfter: number }> {
    const count = await this.client.incr(key);
    if (count === 1) {
      await this.client.expire(key, windowSeconds);
    }
    const ttl = await this.client.ttl(key);
    const retryAfter = ttl > 0 ? ttl : windowSeconds;
    return { count, allowed: count <= max, retryAfter };
  }
}
