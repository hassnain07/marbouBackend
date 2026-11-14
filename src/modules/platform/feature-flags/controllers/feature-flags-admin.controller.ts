import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { FeatureFlagsService } from '../feature-flags.service';
import { AdminBootstrapGuard, type BootstrapAdmin } from '../../../../common/guards/admin-bootstrap.guard';
import { zodPipe } from '../../../../common/pipes/zod-validation.pipe';
import { patchFlagSchema } from '../dto/patch-flag.dto';

/** TODO(phase-2): replace AdminBootstrapGuard with AdminJwtGuard + AdminRoleGuard(SA). */
@Controller('api/v1/admin/flags')
@UseGuards(AdminBootstrapGuard)
export class FeatureFlagsAdminController {
  constructor(private readonly flags: FeatureFlagsService) {}

  @Get()
  async findAll() {
    return this.flags.findAll();
  }

  @Get(':key/history')
  async getHistory(@Param('key') key: string) {
    const rows = await this.flags.getHistory(key);
    // Serialise BigInt id to string — JSON.stringify cannot handle BigInt natively.
    return rows.map((r) => ({ ...r, id: r.id.toString() }));
  }

  @Patch(':key')
  async patch(
    @Param('key') key: string,
    @Body(zodPipe(patchFlagSchema)) body: ReturnType<typeof patchFlagSchema.parse>,
    @Req() req: Request & { admin: BootstrapAdmin },
  ) {
    return this.flags.patch(key, body, req.admin.id);
  }
}
