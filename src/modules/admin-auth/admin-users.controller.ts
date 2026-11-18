import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AdminRole } from '@prisma/client';
import { AdminAuthRepository } from './admin-auth.repository';
import { AdminAuthService } from './admin-auth.service';
import { AuditService } from '../platform/audit/audit.service';
import { AuditActorType } from '../platform/audit/audit.constants';
import { AdminJwtGuard, type AdminAuthContext, invalidateSessionCache } from '../../common/guards/admin-jwt.guard';
import { AdminPermission } from '../../common/decorators/admin-permission.decorator';
import { zodPipe } from '../../common/pipes/zod-validation.pipe';
import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';
import { hashPassword } from './argon2-params';
import { z } from 'zod';

// ── Schemas ────────────────────────────────────────────────────────────────

const createAdminSchema = z.object({
  email: z.string().email().transform((v) => v.trim().toLowerCase()),
  fullName: z.string().min(1),
  role: z.enum([
    AdminRole.SUPER_ADMIN,
    AdminRole.CONTENT_MODERATOR,
    AdminRole.SUPPORT_AGENT,
    AdminRole.FINANCIAL_AUDITOR,
  ]),
  initialPassword: z.string().min(12, 'Password must be at least 12 characters'),
});

const patchAdminSchema = z.object({
  role: z.enum([
    AdminRole.SUPER_ADMIN,
    AdminRole.CONTENT_MODERATOR,
    AdminRole.SUPPORT_AGENT,
    AdminRole.FINANCIAL_AUDITOR,
  ]).optional(),
  isActive: z.boolean().optional(),
  ipAllowList: z.array(z.string()).optional(),
});

// ── AdminUsersController ─────────────────────────────────────────────────────

@Controller('api/v1/admin/admin-users')
@UseGuards(AdminJwtGuard)
export class AdminUsersController {
  constructor(
    private readonly repo: AdminAuthRepository,
    private readonly svc: AdminAuthService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @AdminPermission('admin.users.manage')
  async list(@Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    const take = Math.min(Number(limit ?? 20) || 20, 100);
    return this.repo.listAdmins(take, cursor);
  }

  @Get(':id')
  @AdminPermission('admin.users.manage')
  async getById(@Param('id') id: string) {
    const admin = await this.repo.findByIdForList(id);
    if (!admin) throw AppError.notFound(ErrorCodes.NOT_FOUND, 'Admin not found');
    return admin;
  }

  @Post()
  @AdminPermission('admin.users.manage')
  async create(
    @Body(zodPipe(createAdminSchema)) body: z.output<typeof createAdminSchema>,
    @Req() req: Request & { admin: AdminAuthContext },
  ) {
    const existing = await this.repo.findByEmail(body.email);
    if (existing) throw AppError.conflict(ErrorCodes.ADM_EMAIL_EXISTS);

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
    @Body(zodPipe(patchAdminSchema)) body: z.output<typeof patchAdminSchema>,
    @Req() req: Request & { admin: AdminAuthContext },
  ) {
    const existing = await this.repo.findById(id);
    if (!existing) throw AppError.notFound(ErrorCodes.NOT_FOUND, 'Admin not found');

    // A9: audit before — no raw ipAllowList values
    const before: Record<string, unknown> = { role: existing.role, isActive: existing.isActive };
    if (body.ipAllowList !== undefined) {
      before.ipAllowListChanged = false;
      before.ipAllowListCount = existing.ipAllowList.length;
    }

    // All Prisma/transaction logic lives in the repository (item 2).
    const { updated: result, revokedSessionIds } = await this.repo.patchAdminInTx(id, existing, body);

    // A1: invalidate Redis cache for revoked sessions (after transaction commits)
    if (revokedSessionIds.length > 0) {
      await invalidateSessionCache(this.svc.redis, ...revokedSessionIds);
    }

    // Post-revocation audit (single code path through service)
    if (body.isActive === false) {
      await this.svc.deactivateAdmin(req.admin.id, id, revokedSessionIds);
    } else if (body.role !== undefined) {
      await this.svc.changeAdminRole(req.admin.id, id, result.role as AdminRole, revokedSessionIds);
    }

    const after: Record<string, unknown> = { role: result.role, isActive: result.isActive };
    if (body.ipAllowList !== undefined) {
      after.ipAllowListChanged = true;
      after.ipAllowListCount = result.ipAllowList.length;
    }
    await this.audit.record({
      actorType: AuditActorType.ADMIN, actorId: req.admin.id,
      action: 'admin.user.patched', entity: 'AdminUser', entityId: id,
      before, after,
    });
    return result;
  }
}

// ── AdminSessionsController ───────────────────────────────────────────────────

@Controller('api/v1/admin/admin-sessions')
@UseGuards(AdminJwtGuard)
export class AdminSessionsController {
  constructor(
    private readonly repo: AdminAuthRepository,
    private readonly svc: AdminAuthService,
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
    return this.repo.listSessions(
      { adminId, activeOnly: activeOnly === 'true' },
      take,
      cursor,
    );
  }

  @Delete(':id')
  @AdminPermission('admin.sessions.manage')
  async revoke(@Param('id') id: string, @Req() req: Request & { admin: AdminAuthContext }) {
    await this.svc.revokeSessionById(req.admin.id, id);
    return { revoked: true };
  }
}

// ── AdminLoginLogsController ──────────────────────────────────────────────────

@Controller('api/v1/admin/admin-login-logs')
@UseGuards(AdminJwtGuard)
export class AdminLoginLogsController {
  constructor(private readonly repo: AdminAuthRepository) {}

  @Get()
  @AdminPermission('admin.login-logs.read')
  async list(
    @Query('adminId') adminId?: string,
    @Query('outcome') outcome?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const take = Math.min(Number(limit ?? 20) || 20, 100);
    return this.repo.listLoginLogs({ adminId, outcome }, take, cursor);
  }
}
