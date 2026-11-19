import { Injectable } from '@nestjs/common';
import type { OtpChannel, OtpPurpose } from '@prisma/client';
import { createHmac, timingSafeEqual, randomInt } from 'node:crypto';
import { configuration } from '../../config/configuration';
import { AuthRepository } from './auth.repository';
import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';
import {
  AUTH_OTP_DIGITS,
  AUTH_OTP_EXPIRY_MINUTES,
  AUTH_OTP_MAX_ATTEMPTS,
  AUTH_OTP_RESEND_COOLDOWN_SECONDS,
  DEV_OTP_REDIS_PREFIX,
} from './auth.constants';
import { RedisService } from '../../redis/redis.service';

/** HMAC-SHA256 of a 6-digit code using OTP_HASH_SECRET. */
function hashCode(code: string): string {
  return createHmac('sha256', configuration.OTP_HASH_SECRET).update(code).digest('hex');
}

/** Constant-time compare of two code hashes. */
function safeCompare(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Generate a cryptographically random N-digit OTP code (AUTH-05). */
function generateCode(): string {
  const max = 10 ** AUTH_OTP_DIGITS;
  return randomInt(0, max).toString().padStart(AUTH_OTP_DIGITS, '0');
}

@Injectable()
export class OtpService {

  constructor(
    private readonly repo: AuthRepository,
    private readonly redis: RedisService,
  ) {}

  /**
   * Issue a new OTP code (or resend if cooldown has passed).
   * Returns the plaintext code (never persisted in DB) so the caller can send it.
   */
  async issue(params: {
    email?: string;
    userId?: string;
    purpose: OtpPurpose;
    channel?: OtpChannel;
  }): Promise<string> {
    const channel: OtpChannel = params.channel ?? 'EMAIL';
    const target = params.email
      ? { email: params.email.trim().toLowerCase() }
      : { userId: params.userId! };

    // Check resend cooldown (AUTH-05: 60 s)
    const existing = await this.repo.findActiveOtp(target, params.purpose);
    if (existing) {
      const cooldownEnd = existing.lastSentAt.getTime() + AUTH_OTP_RESEND_COOLDOWN_SECONDS * 1000;
      if (Date.now() < cooldownEnd) {
        const retryAfter = Math.ceil((cooldownEnd - Date.now()) / 1000);
        throw new AppError(ErrorCodes.AUTH_OTP_COOLDOWN, 429, {
          message: `Wait ${retryAfter}s before requesting a new code`,
        });
      }
    }

    const code = generateCode();
    const codeHash = hashCode(code);
    const expiresAt = new Date(Date.now() + AUTH_OTP_EXPIRY_MINUTES * 60 * 1000);

    if (existing) {
      // Update existing OTP with new hash + reset expiry + touch lastSentAt
      await this.repo['prisma'].otpCode.update({
        where: { id: existing.id },
        data: { codeHash, expiresAt, lastSentAt: new Date(), attempts: 0 },
      });
    } else {
      await this.repo.createOtp({
        ...target,
        purpose: params.purpose,
        channel,
        codeHash,
        expiresAt,
      });
    }

    // Store plaintext in Redis (dev-only, 10 min TTL)
    if (configuration.DEV_EXPOSE_OTP && (configuration.NODE_ENV === 'development' || configuration.NODE_ENV === 'test')) {
      const key = `${DEV_OTP_REDIS_PREFIX}${target.email ?? target.userId}:${params.purpose}`;
      await this.redis.client.set(key, code, 'EX', AUTH_OTP_EXPIRY_MINUTES * 60);
    }

    return code;
  }

  /**
   * Verify an OTP code.
   * Returns the OtpCode row on success. Throws on any failure.
   */
  async verify(params: {
    email?: string;
    userId?: string;
    purpose: OtpPurpose;
    code: string;
  }) {
    if (!/^\d{6}$/.test(params.code)) {
      throw AppError.unauthorized(ErrorCodes.AUTH_OTP_INVALID);
    }

    const target = params.email
      ? { email: params.email.trim().toLowerCase() }
      : { userId: params.userId! };

    const otp = await this.repo.findActiveOtp(target, params.purpose);
    if (!otp) {
      throw AppError.unauthorized(ErrorCodes.AUTH_OTP_INVALID);
    }

    // Expired?
    if (otp.expiresAt.getTime() < Date.now()) {
      throw AppError.unauthorized(ErrorCodes.AUTH_OTP_EXPIRED);
    }

    // Already consumed?
    if (otp.consumedAt) {
      throw AppError.unauthorized(ErrorCodes.AUTH_OTP_INVALID);
    }

    // Max attempts already hit?
    if (otp.attempts >= AUTH_OTP_MAX_ATTEMPTS) {
      throw AppError.unprocessable(ErrorCodes.AUTH_OTP_MAX_ATTEMPTS);
    }

    // Verify hash (constant-time)
    const incoming = hashCode(params.code);
    if (!safeCompare(incoming, otp.codeHash)) {
      const newCount = await this.repo.incrementOtpAttempts(otp.id);
      if (newCount >= AUTH_OTP_MAX_ATTEMPTS) {
        throw AppError.unprocessable(ErrorCodes.AUTH_OTP_MAX_ATTEMPTS);
      }
      throw AppError.unauthorized(ErrorCodes.AUTH_OTP_INVALID);
    }

    // Consume
    await this.repo.consumeOtp(otp.id);
    return otp;
  }

  /** Get plaintext code from Redis (dev/test only). */
  async getDevCode(emailOrUserId: string, purpose: OtpPurpose): Promise<string | null> {
    if (!configuration.DEV_EXPOSE_OTP || (configuration.NODE_ENV !== 'development' && configuration.NODE_ENV !== 'test')) {
      return null;
    }
    const key = `${DEV_OTP_REDIS_PREFIX}${emailOrUserId}:${purpose}`;
    return this.redis.client.get(key);
  }

  /** Force-expire an OTP (dev/test only). */
  async devExpire(emailOrUserId: string, purpose: OtpPurpose): Promise<void> {
    const target = emailOrUserId.includes('@') ? { email: emailOrUserId } : { userId: emailOrUserId };
    const otp = await this.repo.findActiveOtp(target, purpose);
    if (otp) {
      await this.repo['prisma'].otpCode.update({
        where: { id: otp.id },
        data: { expiresAt: new Date(0) },
      });
    }
  }

  /** Skip cooldown (dev/test only). */
  async devSkipCooldown(emailOrUserId: string, purpose: OtpPurpose): Promise<void> {
    const target = emailOrUserId.includes('@') ? { email: emailOrUserId } : { userId: emailOrUserId };
    const otp = await this.repo.findActiveOtp(target, purpose);
    if (otp) {
      await this.repo['prisma'].otpCode.update({
        where: { id: otp.id },
        data: { lastSentAt: new Date(0) },
      });
    }
  }
}
