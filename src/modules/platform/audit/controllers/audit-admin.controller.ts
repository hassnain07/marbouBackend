import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditService } from '../audit.service';
import { AuditRepository } from '../audit.repository';
import { AdminJwtGuard } from '../../../../common/guards/admin-jwt.guard';
import { Public } from '../../../../common/decorators/public.decorator';
import { AdminPermission } from '../../../../common/decorators/admin-permission.decorator';
import { zodPipe } from '../../../../common/pipes/zod-validation.pipe';
import { auditFilterSchema } from '../dto/audit-filter.dto';
import { paginated } from '../../../../common/envelope';

/** Phase 2: AdminJwtGuard + @AdminPermission('audit.read') â€” FIN + SA only. */
@Controller('api/v1/admin/audit-logs')
@Public()
@UseGuards(AdminJwtGuard)
export class AuditAdminController {
  constructor(
    private readonly audit: AuditService,
    private readonly repo: AuditRepository,
  ) {}

  @Get()
  @AdminPermission('audit.read')
  async list(@Query(zodPipe(auditFilterSchema)) q: ReturnType<typeof auditFilterSchema.parse>) {
    const filter = {
      entity: q.entity,
      entityId: q.entityId,
      actorId: q.actorId,
      action: q.action,
      fromDate: q.fromDate ? new Date(q.fromDate) : undefined,
      toDate: q.toDate ? new Date(q.toDate) : undefined,
    };
    const { items, nextCursor } = await this.repo.list(filter, q.limit, q.cursor);
    const rows = items.map((r) => ({ ...r, id: r.id.toString() }));
    return paginated(rows, { nextCursor, limit: q.limit });
  }

  @Get('verify-chain')
  @AdminPermission('audit.read')
  async verifyChain() {
    return this.audit.verifyChain();
  }
}

