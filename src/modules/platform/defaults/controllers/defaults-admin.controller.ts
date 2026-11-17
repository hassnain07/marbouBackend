import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DefaultsService } from '../defaults.service';
import { AdminJwtGuard, type AdminAuthContext } from '../../../../common/guards/admin-jwt.guard';
import { AdminPermission } from '../../../../common/decorators/admin-permission.decorator';
import { zodPipe } from '../../../../common/pipes/zod-validation.pipe';
import { patchDefaultSchema } from '../dto/patch-default.dto';

/** Admin defaults controller — requires @AdminPermission (Phase 2 guard). */
@Controller('api/v1/admin/defaults')
@UseGuards(AdminJwtGuard)
export class DefaultsAdminController {
  constructor(private readonly defaults: DefaultsService) {}

  @Get()
  @AdminPermission('config.defaults.read')
  async findAll() {
    return this.defaults.findAll();
  }

  @Patch()
  @AdminPermission('config.defaults.write')
  async patch(
    @Body(zodPipe(patchDefaultSchema)) body: ReturnType<typeof patchDefaultSchema.parse>,
    @Req() req: Request & { admin: AdminAuthContext },
  ) {
    return this.defaults.patch(body.key, body.value, req.admin.id);
  }
}
