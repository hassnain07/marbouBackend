import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditService } from '../audit.service';
import { AuditRepository } from '../audit.repository';
import { AdminBootstrapGuard } from '../../../../common/guards/admin-bootstrap.guard';
import { zodPipe } from '../../../../common/pipes/zod-validation.pipe';
import { auditFilterSchema } from '../dto/audit-filter.dto';
import { paginated } from '../../../../common/envelope';

/** TODO(phase-2): replace AdminBootstrapGuard with AdminJwtGuard + AdminRoleGuard(FIN, SA). */
@Controller('api/v1/admin/audit-logs')
@UseGuards(AdminBootstrapGuard)
export class AuditAdminController {
  constructor(
    private readonly audit: AuditService,
    private readonly repo: AuditRepository,
  ) {}

  /** GET /api/v1/admin/audit-logs — cursor-paginated, filterable. */
  @Get()
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
    // Serialise BigInt ids to strings for JSON safety.
    const rows = items.map((r) => ({ ...r, id: r.id.toString() }));
    return paginated(rows, { nextCursor, limit: q.limit });
  }

  /** GET /api/v1/admin/audit-logs/verify-chain — recompute and verify the hash chain. */
  @Get('verify-chain')
  async verifyChain() {
    return this.audit.verifyChain();
  }
}
