import { Injectable } from '@nestjs/common';
import type { Prisma, OtpPurpose, OtpChannel, LoginOutcome, FunnelStep } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { createHash, randomUUID } from 'node:crypto';

/** Columns returned on session list (never the hash). */
const SESSION_SELECT = {
  id: true, userId: true, familyId: true, deviceName: true, os: true,
  approxLocation: true, ip: true, deviceId: true, lastActiveAt: true,
  revokedAt: true, createdAt: true, expiresAt: true,
} as const;

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── User ─────────────────────────────────────────────────────────────────

  async findUserByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findUserById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async createUser(data: {
    email?: string;
    passwordHash?: string;
    fullName: string;
    language?: string;
    emailVerifiedAt?: Date;
  }) {
    return this.prisma.user.create({
      data: {
        email: data.email ?? null,
        passwordHash: data.passwordHash ?? null,
        fullName: data.fullName,
        language: (data.language as 'AR' | 'EN') ?? 'AR',
        emailVerifiedAt: data.emailVerifiedAt ?? null,
        status: 'ACTIVE',
      },
    });
  }

  async updateUser(id: string, data: Prisma.UserUpdateInput) {
    return this.prisma.user.update({ where: { id }, data });
  }

  // ── Social identities ─────────────────────────────────────────────────────

  async findSocialIdentity(provider: string, providerId: string) {
    return this.prisma.socialIdentity.findUnique({
      where: { provider_providerId: { provider, providerId } },
      include: { user: true },
    });
  }

  async createSocialIdentity(data: { userId: string; provider: string; providerId: string; email?: string }) {
    return this.prisma.socialIdentity.create({ data });
  }

  // ── Sessions ──────────────────────────────────────────────────────────────

  async createSession(data: {
    userId: string;
    familyId: string;
    refreshHash: string;
    deviceName?: string;
    os?: string;
    approxLocation?: string;
    ip?: string;
    userAgent?: string;
    deviceId?: string;
    expiresAt?: Date;
  }) {
    return this.prisma.session.create({
      data: {
        userId: data.userId,
        familyId: data.familyId,
        refreshHash: data.refreshHash,
        deviceName: data.deviceName,
        os: data.os,
        approxLocation: data.approxLocation,
        ip: data.ip,
        userAgent: data.userAgent,
        deviceId: data.deviceId,
        expiresAt: data.expiresAt,
      },
    });
  }

  async findSessionByHash(hash: string) {
    return this.prisma.session.findUnique({ where: { refreshHash: hash } });
  }

  async findSessionById(id: string) {
    return this.prisma.session.findUnique({ where: { id } });
  }

  async revokeSession(id: string, reason: string) {
    return this.prisma.session.update({
      where: { id },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async revokeAllUserSessions(userId: string, reason: string): Promise<string[]> {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null },
      select: { id: true },
    });
    const ids = sessions.map((s) => s.id);
    if (ids.length > 0) {
      await this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: reason },
      });
    }
    return ids;
  }

  async revokeOtherSessions(userId: string, currentSessionId: string, reason: string): Promise<string[]> {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, id: { not: currentSessionId } },
      select: { id: true },
    });
    const ids = sessions.map((s) => s.id);
    if (ids.length > 0) {
      await this.prisma.session.updateMany({
        where: { userId, revokedAt: null, id: { not: currentSessionId } },
        data: { revokedAt: new Date(), revokedReason: reason },
      });
    }
    return ids;
  }

  async listSessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null },
      select: SESSION_SELECT,
      orderBy: { lastActiveAt: 'desc' },
    });
  }

  /** Atomic claim for refresh rotation. Returns count (1=success, 0=already revoked/reuse). */
  async claimSessionForRefresh(sessionId: string, replacedById: string): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'rotated', refreshHash: `revoked:${replacedById}` },
    });
    return result.count;
  }

  async getFamilySessionIds(familyId: string): Promise<string[]> {
    const rows = await this.prisma.session.findMany({
      where: { familyId, revokedAt: null },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  async revokeFamilySessions(familyId: string, reason: string) {
    return this.prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async touchSessionLastActive(sessionId: string) {
    return this.prisma.session.update({
      where: { id: sessionId },
      data: { lastActiveAt: new Date() },
    });
  }

  /** Validation for the JWT guard cache miss. Returns {status, emailVerified} or null. */
  async validateSessionUser(sessionId: string, userId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { revokedAt: true, expiresAt: true },
    });
    if (!session || session.revokedAt) return null;
    if (session.expiresAt && session.expiresAt.getTime() < Date.now()) return null;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, statusReason: true, emailVerifiedAt: true },
    });
    if (!user) return null;

    return {
      status: user.status,
      statusReason: user.statusReason,
      emailVerified: user.emailVerifiedAt !== null,
    };
  }

  // ── OTP codes ─────────────────────────────────────────────────────────────

  async findActiveOtp(emailOrUserId: { email?: string; userId?: string }, purpose: OtpPurpose) {
    const where: Prisma.OtpCodeWhereInput = { purpose, consumedAt: null };
    if (emailOrUserId.email) where.email = emailOrUserId.email;
    else if (emailOrUserId.userId) where.userId = emailOrUserId.userId;
    return this.prisma.otpCode.findFirst({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createOtp(data: {
    userId?: string;
    email?: string;
    purpose: OtpPurpose;
    channel: OtpChannel;
    codeHash: string;
    expiresAt: Date;
  }) {
    // Invalidate previous active codes for same target+purpose
    if (data.email) {
      await this.prisma.otpCode.updateMany({
        where: { email: data.email, purpose: data.purpose, consumedAt: null },
        data: { consumedAt: new Date() },
      });
    } else if (data.userId) {
      await this.prisma.otpCode.updateMany({
        where: { userId: data.userId, purpose: data.purpose, consumedAt: null },
        data: { consumedAt: new Date() },
      });
    }
    return this.prisma.otpCode.create({ data: { id: randomUUID(), ...data } });
  }

  /** Atomically increment attempt counter. Returns new count. */
  async incrementOtpAttempts(id: string): Promise<number> {
    const result = await this.prisma.otpCode.update({
      where: { id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
    return result.attempts;
  }

  async consumeOtp(id: string) {
    return this.prisma.otpCode.update({
      where: { id },
      data: { consumedAt: new Date() },
    });
  }

  async touchOtpLastSent(id: string) {
    return this.prisma.otpCode.update({
      where: { id },
      data: { lastSentAt: new Date() },
    });
  }

  // ── Login events ──────────────────────────────────────────────────────────

  async createLoginEvent(data: {
    userId?: string;
    emailHash?: string;
    outcome: LoginOutcome;
    deviceName?: string;
    os?: string;
    ip?: string;
  }) {
    return this.prisma.loginEvent.create({ data });
  }

  async listLoginEvents(userId: string, limit = 20) {
    return this.prisma.loginEvent.findMany({
      where: { userId },
      orderBy: { id: 'desc' },
      take: limit,
      select: { id: true, outcome: true, deviceName: true, os: true, createdAt: true },
    });
  }

  // ── Funnel events ─────────────────────────────────────────────────────────

  async createFunnelEvent(data: {
    registrationKey: string;
    userId?: string;
    step: FunnelStep;
    channel: OtpChannel;
  }) {
    return this.prisma.authFunnelEvent.create({ data });
  }

  async getFunnelCounts(from: Date, to: Date, channel?: OtpChannel) {
    const where: Prisma.AuthFunnelEventWhereInput = {
      createdAt: { gte: from, lte: to },
    };
    if (channel) where.channel = channel;
    return this.prisma.authFunnelEvent.groupBy({
      by: ['step'],
      where,
      _count: { step: true },
      orderBy: { step: 'asc' },
    });
  }

  /** SHA-256 hash of an email for storage in LoginEvent when user is unknown. */
  static emailHash(email: string): string {
    return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  }
}
