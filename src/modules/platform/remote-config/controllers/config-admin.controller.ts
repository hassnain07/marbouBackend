import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { RemoteConfigService } from '../remote-config.service';
import {
  AdminBootstrapGuard,
  type BootstrapAdmin,
} from '../../../../common/guards/admin-bootstrap.guard';
import { zodPipe } from '../../../../common/pipes/zod-validation.pipe';
import { patchMaintenanceSchema } from '../dto/patch-maintenance.dto';
import { patchAppVersionsSchema } from '../dto/patch-app-versions.dto';
import { patchMediaLimitsSchema } from '../dto/patch-media-limits.dto';
import { Audit } from '../../../../common/decorators/audit.decorator';

/** TODO(phase-2): replace AdminBootstrapGuard with AdminJwtGuard + AdminRoleGuard(SA). */
@Controller('api/v1/admin')
@UseGuards(AdminBootstrapGuard)
export class ConfigAdminController {
  constructor(private readonly rc: RemoteConfigService) {}

  @Get('media-limits')
  async getMediaLimits() {
    return this.rc.getMediaLimits();
  }

  @Patch('media-limits')
  async patchMediaLimits(
    @Body(zodPipe(patchMediaLimitsSchema)) body: ReturnType<typeof patchMediaLimitsSchema.parse>,
    @Req() req: Request & { admin: BootstrapAdmin },
  ) {
    const current = await this.rc.getMediaLimits();
    const updated = { ...current, ...body };
    return this.rc.setMediaLimits(updated, req.admin.id);
  }

  @Patch('app-versions')
  @Audit({ action: 'remoteConfig.set.appVersions', entity: 'AppVersionConfig' })
  async patchAppVersions(
    @Body(zodPipe(patchAppVersionsSchema)) body: ReturnType<typeof patchAppVersionsSchema.parse>,
    @Req() req: Request & { admin: BootstrapAdmin },
  ) {
    return this.rc.setAppVersions(body, req.admin.id);
  }

  @Patch('maintenance')
  async patchMaintenance(
    @Body(zodPipe(patchMaintenanceSchema)) body: ReturnType<typeof patchMaintenanceSchema.parse>,
    @Req() req: Request & { admin: BootstrapAdmin },
  ) {
    return this.rc.setMaintenance(
      {
        enabled: body.enabled,
        startAt: body.startAt ?? null,
        endAt: body.endAt ?? null,
        bannerAr: body.bannerAr,
        bannerEn: body.bannerEn,
      },
      req.admin.id,
    );
  }
}
