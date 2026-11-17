import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminAuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── AdminUser ────────────────────────────────────────────────────────────

  async findByEmail(email: string) {
    return this.prisma.adminUser.findUnique({ where: { email } });
  }

  async findById(id: string) {
    return this.prisma.adminUser.findUnique({ where: { id } });
  }

  async findByIdForList(id: string) {
    return this.prisma.adminUser.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        totpEnabledAt: true,
        lastLoginAt: true,
        lastLoginIp: true,
        createdAt: true,
      },
    });
  }

  async createAdmin(data: {
    email: string;
    passwordHash: string;
    fullName: string;
    role: string;
    ipAllowList?: string[];
  }) {
    return this.prisma.adminUser.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        fullName: data.fullName,
        role: data.role as import('@prisma/client').AdminRole,
        ipAllowList: data.ipAllowList ?? [],
        isActive: true,
        totpSecret: null,
        totpEnabledAt: null,
      },
      select: { id: true, email: true, role: true },
    });
  }

  async updateAdmin(id: string, data: Prisma.AdminUserUpdateInput) {
    return this.prisma.adminUser.update({ where: { id }, data });
  }

  // ── Sessions ──────────────────────────────────────────────────────────────

  async createSession(data: {
    adminId: string;
    familyId: string;
    refreshTokenHash: string;
    ip?: string;
    userAgent?: string;
    expiresAt: Date;
  }) {
    return this.prisma.adminSession.create({
      data: {
        adminId: data.adminId,
        familyId: data.familyId,
        refreshTokenHash: data.refreshTokenHash,
        ip: data.ip,
        userAgent: data.userAgent,
        expiresAt: data.expiresAt,
      },
    });
  }

  async findSessionByHash(hash: string) {
    return this.prisma.adminSession.findFirst({
      where: { refreshTokenHash: hash },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findSessionById(id: string) {
    return this.prisma.adminSession.findUnique({ where: { id } });
  }

  async revokeSession(id: string, reason: string) {
    return this.prisma.adminSession.update({
      where: { id },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async revokeFamily(familyId: string, reason: string) {
    return this.prisma.adminSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async replaceSession(oldId: string, newId: string) {
    return this.prisma.adminSession.update({
      where: { id: oldId },
      data: { replacedById: newId },
    });
  }

  async listSessions(filter: { adminId?: string; activeOnly?: boolean }, limit: number, cursor?: string) {
    const where: Prisma.AdminSessionWhereInput = {};
    if (filter.adminId) where.adminId = filter.adminId;
    if (filter.activeOnly) where.revokedAt = null;
    const rows = await this.prisma.adminSession.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();
    return { items: rows, nextCursor: hasMore ? rows[rows.length - 1]?.id : null };
  }

  // ── Login logs ─────────────────────────────────────────────────────────────

  async createLoginLog(data: {
    adminId?: string;
    emailHash?: string;
    outcome: string;
    ip?: string;
    userAgent?: string;
  }) {
    return this.prisma.adminLoginLog.create({
      data: {
        adminId: data.adminId,
        emailHash: data.emailHash,
        outcome: data.outcome,
        ip: data.ip,
        userAgent: data.userAgent,
      },
    });
  }

  async listLoginLogs(
    filter: { adminId?: string; outcome?: string; fromDate?: Date; toDate?: Date },
    limit: number,
    cursor?: string,
  ) {
    const where: Prisma.AdminLoginLogWhereInput = {};
    if (filter.adminId) where.adminId = filter.adminId;
    if (filter.outcome) where.outcome = filter.outcome;
    if (filter.fromDate || filter.toDate) {
      where.createdAt = {};
      if (filter.fromDate) where.createdAt.gte = filter.fromDate;
      if (filter.toDate) where.createdAt.lte = filter.toDate;
    }
    const rows = await this.prisma.adminLoginLog.findMany({
      where,
      orderBy: { id: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: BigInt(cursor) }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();
    return { items: rows, nextCursor: hasMore ? rows[rows.length - 1].id.toString() : null };
  }

  /** Count active Super Admins (race-safe with a row lock — see service). */
  async countActiveSuperAdminsInTx(tx: Prisma.TransactionClient): Promise<number> {
    return tx.adminUser.count({
      where: { role: 'SUPER_ADMIN', isActive: true },
    });
  }

  /**
   * Validate session and admin for JWT guard (A2, A11).
   * Returns role and ipAllowList if valid, null otherwise.
   * Checks: session exists, not revoked, not expired, admin active.
   */
  async validateSessionAndAdmin(
    sessionId: string,
    adminId: string,
  ): Promise<{ role: import('@prisma/client').AdminRole; ipAllowList: string[] } | null> {
    const session = await this.prisma.adminSession.findUnique({
      where: { id: sessionId },
      select: { revokedAt: true, expiresAt: true },
    });

    if (!session) return null;
    if (session.revokedAt) return null;
    if (session.expiresAt.getTime() < Date.now()) return null;

    const admin = await this.prisma.adminUser.findUnique({
      where: { id: adminId },
      select: { isActive: true, role: true, ipAllowList: true },
    });

    if (!admin || !admin.isActive) return null;

    return {
      role: admin.role,
      ipAllowList: admin.ipAllowList,
    };
  }

  /**
   * Atomically claim a session for refresh rotation (A4).
   * Returns the count of updated rows (should be 1).
   * Only updates if session is not yet revoked.
   */
  async claimSessionForRefresh(sessionId: string, replacedById: string): Promise<number> {
    const result = await this.prisma.adminSession.updateMany({
      where: {
        id: sessionId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        revokedReason: 'Rotated',
        replacedById,
      },
    });

    return result.count;
  }

  /**
   * Atomically update TOTP last step to prevent replay (A4).
   * Returns the count of updated rows (should be 1 if step is fresh).
   * Only updates if lastTotpStep is null or less than the new step.
   */
  async updateTotpStepIfFresh(adminId: string, newStep: bigint): Promise<number> {
    const result = await this.prisma.adminUser.updateMany({
      where: {
        id: adminId,
        OR: [{ lastTotpStep: null }, { lastTotpStep: { lt: newStep } }],
      },
      data: {
        lastTotpStep: newStep,
      },
    });

    return result.count;
  }

  /**
   * Get all active session IDs for an admin (for bulk invalidation, A1).
   */
  async getActiveSessionIds(adminId: string): Promise<string[]> {
    const sessions = await this.prisma.adminSession.findMany({
      where: { adminId, revokedAt: null },
      select: { id: true },
    });

    return sessions.map((s) => s.id);
  }

  /**
   * Revoke all sessions for an admin (A1).
   * Returns the IDs of revoked sessions for cache invalidation.
   */
  async revokeAllAdminSessions(adminId: string, reason: string): Promise<string[]> {
    const sessionIds = await this.getActiveSessionIds(adminId);

    await this.prisma.adminSession.updateMany({
      where: { adminId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });

    return sessionIds;
  }

  /**
   * Lock all active Super Admin rows for update (A5).
   * Must be called within a transaction.
   * Returns the IDs of locked Super Admins.
   */
  async lockActiveSuperAdmins(tx: Prisma.TransactionClient): Promise<string[]> {
    // Use raw SQL for SELECT ... FOR UPDATE to lock ALL SA rows, preventing
    // concurrent demotions/deactivations from both passing the count check (A5).
    const result = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id 
      FROM "AdminUser" 
      WHERE role = 'SUPER_ADMIN' AND "isActive" = true 
      ORDER BY id 
      FOR UPDATE
    `;

    return result.map((r) => r.id);
  }

  /**
   * Revoke all sessions for an admin and return their IDs (A1).
   */
  async revokeAdminSessionsInTx(
    tx: Prisma.TransactionClient,
    adminId: string,
    reason: string,
  ): Promise<string[]> {
    const sessions = await tx.adminSession.findMany({
      where: { adminId, revokedAt: null },
      select: { id: true },
    });
    const ids = sessions.map((s) => s.id);
    if (ids.length > 0) {
      await tx.adminSession.updateMany({
        where: { adminId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: reason },
      });
    }
    return ids;
  }
}
