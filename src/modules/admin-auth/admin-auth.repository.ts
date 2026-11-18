import { Injectable } from '@nestjs/common';
import type { Prisma, AdminRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';

/** Columns returned on list/get operations — no sensitive fields. */
const ADMIN_USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  isActive: true,
  totpEnabledAt: true,
  lastLoginAt: true,
  lastLoginIp: true,
  createdAt: true,
} as const;

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
    return this.prisma.adminUser.findUnique({ where: { id }, select: ADMIN_USER_SELECT });
  }

  async createAdmin(data: {
    email: string;
    passwordHash: string;
    fullName: string;
    role: AdminRole;
    ipAllowList?: string[];
  }) {
    return this.prisma.adminUser.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        fullName: data.fullName,
        role: data.role,
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

  async listAdmins(limit: number, cursor?: string) {
    const rows = await this.prisma.adminUser.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      select: ADMIN_USER_SELECT,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();
    return { items: rows, nextCursor: hasMore ? rows[rows.length - 1]?.id ?? null : null };
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

  /** Get all active session IDs belonging to a token family (for reuse-revoke). */
  async getFamilySessionIds(familyId: string): Promise<string[]> {
    const sessions = await this.prisma.adminSession.findMany({
      where: { familyId, revokedAt: null },
      select: { id: true },
    });
    return sessions.map((s) => s.id);
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
      select: {
        id: true, adminId: true, familyId: true, ip: true, userAgent: true,
        createdAt: true, expiresAt: true, revokedAt: true, revokedReason: true, replacedById: true,
      },
    });
    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();
    return { items: rows, nextCursor: hasMore ? rows[rows.length - 1]?.id ?? null : null };
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
    return {
      items: rows.map((r) => ({ ...r, id: r.id.toString() })),
      nextCursor: hasMore ? rows[rows.length - 1]?.id.toString() ?? null : null,
    };
  }

  // ── Guard helper ──────────────────────────────────────────────────────────

  /**
   * Validate session and admin for JWT guard (A2, A11).
   * Checks: session exists, not revoked, not expired, admin active.
   */
  async validateSessionAndAdmin(
    sessionId: string,
    adminId: string,
  ): Promise<{ role: AdminRole; ipAllowList: string[] } | null> {
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

    return { role: admin.role, ipAllowList: admin.ipAllowList };
  }

  // ── Atomic operations ─────────────────────────────────────────────────────

  /**
   * Atomically claim a session for refresh rotation (A4).
   * Returns count of updated rows (1 = success, 0 = already revoked/reuse).
   */
  async claimSessionForRefresh(sessionId: string, replacedById: string): Promise<number> {
    const result = await this.prisma.adminSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'Rotated', replacedById },
    });
    return result.count;
  }

  /**
   * Atomically update TOTP last step to prevent replay (A4).
   * Returns count of updated rows (1 = fresh, 0 = replay).
   */
  async updateTotpStepIfFresh(adminId: string, newStep: bigint): Promise<number> {
    const result = await this.prisma.adminUser.updateMany({
      where: {
        id: adminId,
        OR: [{ lastTotpStep: null }, { lastTotpStep: { lt: newStep } }],
      },
      data: { lastTotpStep: newStep },
    });
    return result.count;
  }

  // ── Bulk session operations ───────────────────────────────────────────────

  /** Get all active session IDs for an admin (for bulk invalidation). */
  async getActiveSessionIds(adminId: string): Promise<string[]> {
    const sessions = await this.prisma.adminSession.findMany({
      where: { adminId, revokedAt: null },
      select: { id: true },
    });
    return sessions.map((s) => s.id);
  }

  /** Revoke all active sessions for an admin, return their IDs. */
  async revokeAllAdminSessions(adminId: string, reason: string): Promise<string[]> {
    const sessionIds = await this.getActiveSessionIds(adminId);
    if (sessionIds.length > 0) {
      await this.prisma.adminSession.updateMany({
        where: { adminId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: reason },
      });
    }
    return sessionIds;
  }

  /** Revoke all active sessions for an admin inside a transaction, return their IDs. */
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

  /**
   * Patch an admin user inside a single transaction:
   * 1. Lock ALL active SA rows (A5 — prevents concurrent last-SA bypass).
   * 2. Enforce last-SA guard.
   * 3. Apply field updates.
   * 4. Revoke sessions if role changed or account deactivated (returns revoked ids).
   */
  async patchAdminInTx(
    id: string,
    existing: { role: string; isActive: boolean; ipAllowList: string[] },
    patch: { role?: string; isActive?: boolean; ipAllowList?: string[] },
  ): Promise<{ updated: { id: string; role: string; isActive: boolean; ipAllowList: string[] }; revokedSessionIds: string[] }> {
    return this.prisma.$transaction(async (tx) => {
      // A5: Lock ALL active SA rows to prevent concurrent demotions racing past the count
      const saRows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "AdminUser"
        WHERE role = 'SUPER_ADMIN' AND "isActive" = true
        ORDER BY id FOR UPDATE
      `;

      const isCurrentlySa = existing.role === 'SUPER_ADMIN' && existing.isActive;
      const wouldDemote = patch.role !== undefined && patch.role !== 'SUPER_ADMIN';
      const wouldDeactivate = patch.isActive === false;
      if (isCurrentlySa && (wouldDemote || wouldDeactivate) && saRows.length <= 1) {
        throw AppError.conflict(ErrorCodes.ADM_LAST_SUPER_ADMIN);
      }

      const data: Record<string, unknown> = {};
      if (patch.role !== undefined) data.role = patch.role;
      if (patch.isActive !== undefined) data.isActive = patch.isActive;
      if (patch.ipAllowList !== undefined) data.ipAllowList = patch.ipAllowList;

      const updated = await tx.adminUser.update({
        where: { id },
        data,
        select: { id: true, role: true, isActive: true, ipAllowList: true },
      });

      let revokedIds: string[] = [];
      if (patch.role !== undefined || patch.isActive === false) {
        const reason = patch.isActive === false ? 'deactivated' : 'role changed';
        revokedIds = await this.revokeAdminSessionsInTx(tx, id, reason);
      }

      return { updated, revokedSessionIds: revokedIds };
    });
  }

}
