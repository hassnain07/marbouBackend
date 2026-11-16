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
}
