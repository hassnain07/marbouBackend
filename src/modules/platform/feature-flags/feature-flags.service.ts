import { Injectable, Logger } from '@nestjs/common';
import type { FeatureFlag } from '@prisma/client';
import { RedisService } from '../../../redis/redis.service';
import { AuditService } from '../audit/audit.service';
import { AuditActorType } from '../audit/audit.constants';
import { FeatureFlagsRepository } from './feature-flags.repository';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCodes } from '../../../common/errors/error-codes';

/** Redis TTL for flag cache — 60 s max propagation (SYS-01, ADM-09). */
const FLAG_CACHE_TTL = 60;
const CACHE_KEY_ALL = 'platform:flags:all';
const cacheKey = (k: string) => `platform:flag:${k}`;

/** OTP channel flag keys — the last enabled one cannot be turned OFF (AUTH-15). */
const OTP_FLAG_KEYS = ['otp.email', 'otp.sms', 'otp.whatsapp'] as const;

@Injectable()
export class FeatureFlagsService {
  private readonly logger = new Logger(FeatureFlagsService.name);

  constructor(
    private readonly repo: FeatureFlagsRepository,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  // ── Read ────────────────────────────────────────────────────────────────

  /** All flags (admin view, cached). */
  async findAll(): Promise<FeatureFlag[]> {
    return this.redis.cacheAside(CACHE_KEY_ALL, FLAG_CACHE_TTL, () => this.repo.findAll());
  }

  /** Resolve a single flag value, respecting per-country overrides. */
  async isEnabled(key: string, countryCode?: string): Promise<boolean> {
    const cached = await this.redis.cacheAside<FeatureFlag | null>(
      cacheKey(key),
      FLAG_CACHE_TTL,
      () => this.repo.findByKey(key),
    );
    if (!cached) return false;
    if (countryCode && cached.countryOverrides && typeof cached.countryOverrides === 'object') {
      const overrides = cached.countryOverrides as Record<string, { enabled?: boolean }>;
      if (countryCode in overrides) {
        return overrides[countryCode].enabled ?? cached.enabled;
      }
    }
    return cached.enabled;
  }

  /** Client-safe public subset (enabled-only keys, no internal config). */
  async getPublicFlags(): Promise<Record<string, boolean>> {
    const all = await this.findAll();
    return Object.fromEntries(all.map((f) => [f.key, f.enabled]));
  }

  /** Flag change history. */
  async getHistory(key: string) {
    return this.repo.getHistory(key);
  }

  // ── Write ───────────────────────────────────────────────────────────────

  async patch(
    key: string,
    patch: { enabled?: boolean; config?: unknown; countryOverrides?: unknown },
    actorId: string,
  ): Promise<FeatureFlag> {
    const existing = await this.repo.findByKey(key);
    if (!existing) {
      throw AppError.notFound(ErrorCodes.FEATURE_DISABLED, `Flag '${key}' not found`);
    }

    // AUTH-15: refuse disabling the last enabled OTP channel.
    const isOtpKey = OTP_FLAG_KEYS.includes(key as (typeof OTP_FLAG_KEYS)[number]);
    if (isOtpKey && patch.enabled === false) {
      const all = await this.repo.findAll();
      const enabledOtpCount = all.filter(
        (f) => OTP_FLAG_KEYS.includes(f.key as (typeof OTP_FLAG_KEYS)[number]) && f.enabled,
      ).length;
      if (enabledOtpCount <= 1 && existing.enabled) {
        throw AppError.unprocessable(ErrorCodes.AUTH_OTP_LAST_CHANNEL);
      }
    }

    const before = { enabled: existing.enabled, config: existing.config };
    const updated = await this.repo.update(key, { ...patch, updatedBy: actorId });
    const after = { enabled: updated.enabled, config: updated.config };

    // Append history row.
    await this.repo.appendHistory({
      flagKey: key,
      enabled: updated.enabled,
      config: updated.config,
      changedBy: actorId,
    });

    // Audit log entry with before/after (ADM-09, TRS-12).
    await this.audit.record({
      actorType: AuditActorType.ADMIN,
      actorId,
      action: 'flag.patch',
      entity: 'FeatureFlag',
      entityId: key,
      before,
      after,
    });

    // Invalidate both the per-key and all-flags cache entries (≤ 60 s propagation).
    await this.redis.cacheInvalidate(cacheKey(key), CACHE_KEY_ALL);
    this.logger.log(`Flag '${key}' updated by ${actorId}: enabled=${updated.enabled}`);

    return updated;
  }

  /** Idempotent upsert used by seeds. Does NOT write history/audit. */
  async upsertSeed(
    key: string,
    enabled: boolean,
    opts: { config?: unknown; countryOverrides?: unknown; description?: string } = {},
  ): Promise<void> {
    await this.repo.upsert({ key, enabled, updatedBy: 'seed', ...opts });
  }
}
