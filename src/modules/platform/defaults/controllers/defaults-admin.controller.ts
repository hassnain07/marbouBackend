import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DefaultsService } from '../defaults.service';
import {
  AdminBootstrapGuard,
  type BootstrapAdmin,
} from '../../../../common/guards/admin-bootstrap.guard';
import { zodPipe } from '../../../../common/pipes/zod-validation.pipe';
import { patchDefaultSchema } from '../dto/patch-default.dto';

/** TODO(phase-2): replace AdminBootstrapGuard with AdminJwtGuard + AdminRoleGuard(SA). */
@Controller('api/v1/admin/defaults')
@UseGuards(AdminBootstrapGuard)
export class DefaultsAdminController {
  constructor(private readonly defaults: DefaultsService) {}

  @Get()
  async findAll() {
    return this.defaults.findAll();
  }

  @Patch()
  async patch(
    @Body(zodPipe(patchDefaultSchema)) body: ReturnType<typeof patchDefaultSchema.parse>,
    @Req() req: Request & { admin: BootstrapAdmin },
  ) {
    return this.defaults.patch(body.key, body.value, req.admin.id);
  }
}
