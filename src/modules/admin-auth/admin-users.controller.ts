import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AdminRole } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { AuditService } from '../platform/audit/audit.service';
import { AuditActorType } from '../platform/audit/audit.constants';
import { AdminJwtGuard, type AdminAuthContext, invalidateSessionCache } from '../../common/guards/admin-jwt.guard';
import { AdminPermission } from '../../common/decorators/admin-permission.decorator';
import { zodPipe } from '../../common/pipes/zod-validation.pipe';
import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';
import { z } from 'zod';

const createAdminSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1),
  role: z.enum([AdminRole.SUPER_ADMIN, AdminRole.CONTENT_MODERATOR, AdminRole.SUPPORT_AGENT, AdminRole.FINANCIAL_AUDITOR]),
  initialPassword: z.string().min(12, 'Password must be at least 12 characters'),
});

const patchAdminSchema = z.object({
  role: z.enum([AdminRole.SUPER_ADMIN, AdminRole.CONTENT_MODERATOR, AdminRole.SUPPORT_AGENT, AdminRole.FINANCIAL_AUDITOR]).optional(),
  isActive: z.boolean().optional(),
  ipAllowList: z.array(z.string()).optional(),
});

@Controller('api/v1/admin/admin-users')
@UseGuards(AdminJwtGuard)
export class AdminUsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @AdminPermission('admin.users.manage')
  async list(@Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    const take = Math.min(Number(limit ?? 20) || 20, 100);
    const rows = await this.prisma.adminUser.findMany({
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      select: {
        id: true, email: true, fullName: true, role: true, isActive: true,
        totpEnabledAt: true, lastLoginAt: true, lastLoginIp: true, createdAt: true,
      },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > take;
    if (hasMore) rows.pop();
    return {
      items: rows,
      __pagination: {
        nextCursor: hasMore ? rows[rows.length - 1].id : null,
        limit: take,
      },
    };
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
    // Check duplicate email.
    const existing = await this.prisma.adminUser.findUnique({ where: { email: body.email } });
    if (existing) {
      throw AppError.conflict(ErrorCodes.ADM_EMAIL_EXISTS);
    }
    const passwordHash = await hash(body.initialPassword, { memoryCost: 65536, timeCost: 3, parallelism: 1 });
    const admin = await this.prisma.adminUser.create({
      data: {
        email: body.email,
        fullName: body.fullName,
        role: body.role,
        passwordHash,
        isActive: true,
        totpSecret: null, // must enroll at first login
        totpEnabledAt: null,
      },
      select: { id: true, email: true, role: true },
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
    const before = { role: existing.role, isActive: existing.isActive, ipAllowList: existing.ipAllowList };

    // Last-super-admin guard (race-safe: check + update in one transaction).
    const result = await this.prisma.$transaction(async (tx) => {
      // Lock the row being modified.
      const locked = await tx.$queryRaw<{ id: string; role: string; isActive: boolean }[]>`
        SELECT id, role, "isActive" FROM "AdminUser" WHERE id = ${id} FOR UPDATE
      `;
      if (locked.length === 0) {
        throw AppError.notFound(ErrorCodes.NOT_FOUND, 'Admin not found');
      }
      // If demoting or deactivating a Super Admin, ensure at least one other remains.
      if (locked[0].role === 'SUPER_ADMIN' && locked[0].isActive) {
        if (body.role !== undefined && body.role !== 'SUPER_ADMIN') {
          const count = await tx.adminUser.count({ where: { role: 'SUPER_ADMIN', isActive: true } });
          if (count <= 1) {
            throw AppError.conflict(ErrorCodes.ADM_LAST_SUPER_ADMIN);
          }
        }
        if (body.isActive === false) {
          const count = await tx.adminUser.count({ where: { role: 'SUPER_ADMIN', isActive: true } });
          if (count <= 1) {
            throw AppError.conflict(ErrorCodes.ADM_LAST_SUPER_ADMIN);
          }
        }
      }
      const data: Record<string, unknown> = {};
      if (body.role !== undefined) data.role = body.role;
      if (body.isActive !== undefined) data.isActive = body.isActive;
      if (body.ipAllowList !== undefined) data.ipAllowList = body.ipAllowList;
      return tx.adminUser.update({ where: { id }, data, select: { id: true, role: true, isActive: true, ipAllowList: true } });
    });

    // Role change or deactivation → revoke all that admin's sessions.
    if (body.role !== undefined || body.isActive === false) {
      await this.prisma.adminSession.updateMany({
        where: { adminId: id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: body.isActive === false ? 'deactivated' : 'role changed' },
      });
    }
    await this.audit.record({
      actorType: AuditActorType.ADMIN,
      actorId: req.admin.id,
      action: 'admin.user.patched',
      entity: 'AdminUser',
      entityId: id,
      before,
      after: { role: result.role, isActive: result.isActive, ipAllowList: result.ipAllowList },
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
      __pagination: { nextCursor: hasMore ? rows[rows.length - 1].id : null, limit: take },
    };
  }

  @Delete(':id')
  @AdminPermission('admin.sessions.manage')
  async revoke(@Param('id') id: string, @Req() req: { admin: AdminAuthContext }) {
    await this.prisma.adminSession.update({
      where: { id },
      data: { revokedAt: new Date(), revokedReason: 'revoked by admin' },
    });
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
      __pagination: { nextCursor: hasMore ? rows[rows.length - 1].id.toString() : null, limit: take },
    };
  }
}
