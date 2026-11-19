import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AdminJwtGuard, type AdminAuthContext } from '../../common/guards/admin-jwt.guard';
import { AdminPermission } from '../../common/decorators/admin-permission.decorator';
import { zodPipe } from '../../common/pipes/zod-validation.pipe';
import { FeatureFlagsService } from '../platform/feature-flags/feature-flags.service';
import { Public } from '../../common/decorators/public.decorator';

const patchChannelSchema = z.object({ enabled: z.boolean() });

/**
 * OTP channel admin routes (AUTH-15).
 * Backed by FeatureFlagsService.patch() which enforces the last-channel rule
 * atomically for both /admin/otp-channels and /admin/flags/otp.* routes.
 */
@Controller('api/v1/admin/otp-channels')
@UseGuards(AdminJwtGuard)
@Public()
export class OtpChannelsController {
  constructor(private readonly flags: FeatureFlagsService) {}

  @Get()
  @AdminPermission('config.flags.read')
  async list() {
    const all = await this.flags.findAll();
    return all
      .filter((f) => ['otp.email', 'otp.sms', 'otp.whatsapp'].includes(f.key))
      .map((f) => ({ channel: f.key.replace('otp.', '').toUpperCase(), enabled: f.enabled }));
  }

  @Patch(':channel')
  @AdminPermission('config.flags.write')
  async toggle(
    @Param('channel') channel: string,
    @Body(zodPipe(patchChannelSchema)) body: { enabled: boolean },
    @Req() req: Request & { admin: AdminAuthContext },
  ) {
    const key = `otp.${channel.toLowerCase()}`;
    return this.flags.patch(key, { enabled: body.enabled }, req.admin.id);
  }
}
