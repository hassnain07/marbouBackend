import { Controller, Get, Param, Patch, Body, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { FeatureFlagsService } from '../feature-flags.service';
import { AdminJwtGuard, type AdminAuthContext } from '../../../../common/guards/admin-jwt.guard';
import { AdminPermission } from '../../../../common/decorators/admin-permission.decorator';
import { zodPipe } from '../../../../common/pipes/zod-validation.pipe';
import { patchFlagSchema } from '../dto/patch-flag.dto';

/** Phase 2: AdminJwtGuard + @AdminPermission replaces the temporary AdminBootstrapGuard. */
@Controller('api/v1/admin/flags')
@UseGuards(AdminJwtGuard)
export class FeatureFlagsAdminController {
  constructor(private readonly flags: FeatureFlagsService) {}

  @Get()
  @AdminPermission('config.flags.read')
  async findAll() {
    return this.flags.findAll();
  }

  @Get(':key/history')
  @AdminPermission('config.flags.read')
  async getHistory(@Param('key') key: string) {
    const rows = await this.flags.getHistory(key);
    // Serialise BigInt id to string — JSON.stringify cannot handle BigInt natively.
    return rows.map((r) => ({ ...r, id: r.id.toString() }));
  }

  @Patch(':key')
  @AdminPermission('config.flags.write')
  async patch(
    @Param('key') key: string,
    @Body(zodPipe(patchFlagSchema)) body: ReturnType<typeof patchFlagSchema.parse>,
    @Req() req: Request & { admin: AdminAuthContext },
  ) {
    return this.flags.patch(key, body, req.admin.id);
  }
}
