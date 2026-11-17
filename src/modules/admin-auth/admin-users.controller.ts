import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AdminRole } from '@prisma/client';
import { AdminAuthRepository } from './admin-auth.repository';
import { RedisService } from '../../redis/redis.service';
import { AuditService } from '../platform/audit/audit.service';
import { AuditActorType } from '../platform/audit/audit.constants';
import { AdminJwtGuard, type AdminAuthContext, invalidateSessionCache } from '../../common/guards/admin-jwt.guard';
import { AdminPermission } from '../../common/decorators/admin-permission.decorator';
import { zodPipe } from '../../common/pipes/zod-validation.pipe';
import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';
import { hashPassword } from './argon2-params';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';

const createAdminSchema = z.object({
  email: z.string().email().transform((v) => v.trim().toLowerCase()),
  fullName: z.string().min(1),
  role: z.enum([AdminRole.SUPER_ADMIN, AdminRole.CONTENT_MODERATOR, AdminRole.SUPPORT_AGENT, AdminRole.FINANCIAL_AUDITOR]),
  initialPassword: z.string().min(12, 'Password must be at least 12 characters'),
});

const patchAdminSchema = z.object({
  role: z.enum([AdminRole.SUPER_ADMIN, AdminRole.CONTENT_MODERATOR, AdminRole.SUPPORT_AGENT, AdminRole.FINANCIAL_AUDITOR]).optional(),
  isActive: z.boolean().optional(),
  ipAllowList: z.array(z.string()).optional(),
});

/** Select shape for list/get operations — no sensitive fields. */
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

@Controller('api/v1/admin/admin-users')
@UseGuards(AdminJwtGuard)
export class AdminUsersController {
  constructor(
    private readonly repo: AdminAuthRepository,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @AdminPermission('admin.users.manage')
  async list(@Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    const take = Math.min(Number(limit ?? 20) || 20, 100);
    const rows = await this.prisma.adminUser.findMany({
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      select: ADMIN_USER_SELECT,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > take;
    if (hasMore) rows.pop();
    return {
      items: rows,
      __pagination: {
        nextCursor: hasMore ? rows[rows.length - 1]?.id : null,
        limit: take,
      },
    };
  }

  /** A11: GET /admin/admin-users/:id — SA only, 404 if unknown. */
  @Get(':id')
  @AdminPermission('admin.users.manage')
  async getById(@Param('id') id: string) {
    const admin = await this.prisma.adminUser.findUnique({
      where: { id },
      select: ADMIN_USER_SELECT,
    });
    if (!admin) {
      throw AppError.notFound(ErrorCodes.NOT_FOUND, 'Admin not found');
    }
    return admin;
  }

  @Post()
  @AdminPermission('admin.users.manage')
  async create(
    @Body(zodPipe(createAdminSchema)) body: {
      email: string;
      fullName: string;
      role: AdminRole;
      initialPassword: string;
    },
    @Req() req: Request & { admin: AdminAuthContext },
  ) {
    // A7: email is already normalized by the schema transform
    const existing = await this.repo.findByEmail(body.email);
    if (existing) {
      throw AppError.conflict(ErrorCodes.ADM_EMAIL_EXISTS);
    }
    // A7: Use centralized Argon2 params (same as login)
    const passwordHash = await hashPassword(body.initialPassword);
    const admin = await this.repo.createAdmin({
      email: body.email,
      passwordHash,
      fullName: body.fullName,
      role: body.role,
    });
    await this.audit.record({
      actorType: AuditActorType.ADMIN,
      actorId: req.admin.id,
      action: 'admin.user.created',
      entity: 'AdminUser',
      entityId: admin.id,
      after: { role: admin.role },
    });
    return admin;
  }

  @Patch(':id')
  @AdminPermission('admin.users.manage')
  async patch(
    @Param('id') id: string,
    @Body(zodPipe(patchAdminSchema)) body: {
      role?: AdminRole;
      isActive?: boolean;
      ipAllowList?: string[];
    },
    @Req() req: Request & { admin: AdminAuthContext },
  ) {
    const existing = await this.prisma.adminUser.findUnique({ where: { id } });
    if (!existing) {
      throw AppError.notFound(ErrorCodes.NOT_FOUND, 'Admin not found');
    }
    // A9: Don't put ipAllowList values in before/after; record change indicator only
    const before = {
      role: existing.role,
      isActive: existing.isActive,
      ...(existing.ipAllowList !== undefined
        ? { ipAllowListChanged: false, ipAllowListCount: existing.ipAllowList.length }
        : {}),
    };

    // A5: Last-super-admin guard with ALL SA rows locked
    const { result, revokedSessionIds } = await this.prisma.$transaction(async (tx) => {
      // Lock ALL active Super Admin rows to prevent concurrent demotions (A5)
      const saIds = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "AdminUser"
        WHERE role = 'SUPER_ADMIN' AND "isActive" = true
        ORDER BY id FOR UPDATE
      `;

      const isCurrentlySa = existing.role === 'SUPER_ADMIN' && existing.isActive;
      const wouldDemote = body.role !== undefined && body.role !== AdminRole.SUPER_ADMIN;
      const wouldDeactivate = body.isActive === false;

      if (isCurrentlySa && (wouldDemote || wouldDeactivate)) {
        // saIds already has the locked count
        if (saIds.length <= 1) {
          throw AppError.conflict(ErrorCodes.ADM_LAST_SUPER_ADMIN);
        }
      }

      const data: Record<string, unknown> = {};
      if (body.role !== undefined) data.role = body.role;
      if (body.isActive !== undefined) data.isActive = body.isActive;
      if (body.ipAllowList !== undefined) data.ipAllowList = body.ipAllowList;

      const updated = await tx.adminUser.update({
        where: { id },
        data,
        select: { id: true, role: true, isActive: true, ipAllowList: true },
      });

      // A1: Revoke sessions in the same transaction for role change or deactivation
      let revokedIds: string[] = [];
      if (body.role !== undefined || body.isActive === false) {
        const reason = body.isActive === false ? 'deactivated' : 'role changed';
        revokedIds = await this.repo.revokeAdminSessionsInTx(tx, id, reason);
      }

      return { result: updated, revokedSessionIds: revokedIds };
    });

    // A1: Invalidate Redis cache for all revoked sessions AFTER transaction commits
    if (revokedSessionIds.length > 0) {
      await invalidateSessionCache(this.redis, ...revokedSessionIds);
    }

    // A9: Audit — no raw ipAllowList values
    const after: Record<string, unknown> = { role: result.role, isActive: result.isActive };
    if (body.ipAllowList !== undefined) {
      after.ipAllowListChanged = true;
      after.ipAllowListCount = result.ipAllowList.length;
    }

    await this.audit.record({
      actorType: AuditActorType.ADMIN,
      actorId: req.admin.id,
      action: 'admin.user.patched',
      entity: 'AdminUser',
      entityId: id,
      before,
      after,
    });
    return result;
  }
}

@Controller('api/v1/admin/admin-sessions')
@UseGuards(AdminJwtGuard)
export class AdminSessionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @AdminPermission('admin.sessions.manage')
  async list(
    @Query('adminId') adminId?: string,
    @Query('activeOnly') activeOnly?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const take = Math.min(Number(limit ?? 20) || 20, 100);
    const where: Record<string, unknown> = {};
    if (adminId) where.adminId = adminId;
    if (activeOnly === 'true') where.revokedAt = null;
    const rows = await this.prisma.adminSession.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > take;
    if (hasMore) rows.pop();
    return {
      items: rows.map((r) => ({ ...r, refreshTokenHash: undefined })),
      __pagination: { nextCursor: hasMore ? rows[rows.length - 1]?.id : null, limit: take },
    };
  }

  /** A1: DELETE /admin-sessions/:id — 404 on unknown id, invalidate cache. */
  @Delete(':id')
  @AdminPermission('admin.sessions.manage')
  async revoke(@Param('id') id: string, @Req() req: Request & { admin: AdminAuthContext }) {
    // A1: Check existence first → 404 not 500 on unknown id
    const session = await this.prisma.adminSession.findUnique({ where: { id } });
    if (!session) {
      throw AppError.notFound(ErrorCodes.NOT_FOUND, 'Session not found');
    }

    await this.prisma.adminSession.update({
      where: { id },
      data: { revokedAt: new Date(), revokedReason: 'revoked by admin' },
    });

    // A1: Invalidate cache immediately
    await invalidateSessionCache(this.redis, id);

    await this.audit.record({
      actorType: AuditActorType.ADMIN,
      actorId: req.admin.id,
      action: 'admin.session.revoked',
      entity: 'AdminSession',
      entityId: id,
    });
    return { revoked: true };
  }
}

@Controller('api/v1/admin/admin-login-logs')
@UseGuards(AdminJwtGuard)
export class AdminLoginLogsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @AdminPermission('admin.login-logs.read')
  async list(
    @Query('adminId') adminId?: string,
    @Query('outcome') outcome?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const take = Math.min(Number(limit ?? 20) || 20, 100);
    const where: Record<string, unknown> = {};
    if (adminId) where.adminId = adminId;
    if (outcome) where.outcome = outcome;
    const rows = await this.prisma.adminLoginLog.findMany({
      where,
      orderBy: { id: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: BigInt(cursor) }, skip: 1 } : {}),
    });
    const hasMore = rows.length > take;
    if (hasMore) rows.pop();
    return {
      items: rows.map((r) => ({ ...r, id: r.id.toString() })),
      __pagination: { nextCursor: hasMore ? rows[rows.length - 1]?.id.toString() : null, limit: take },
    };
  }
}
