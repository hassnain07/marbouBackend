import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { RemoteConfigService } from '../remote-config.service';
import { AdminJwtGuard, type AdminAuthContext } from '../../../../common/guards/admin-jwt.guard';
import { AdminPermission } from '../../../../common/decorators/admin-permission.decorator';
import { zodPipe } from '../../../../common/pipes/zod-validation.pipe';
import { patchMaintenanceSchema } from '../dto/patch-maintenance.dto';
import { patchAppVersionsSchema } from '../dto/patch-app-versions.dto';
import { patchMediaLimitsSchema } from '../dto/patch-media-limits.dto';
import { Audit } from '../../../../common/decorators/audit.decorator';

/** Phase 2: AdminJwtGuard + @AdminPermission replaces the temporary AdminBootstrapGuard. */
@Controller('api/v1/admin')
@UseGuards(AdminJwtGuard)
export class ConfigAdminController {
  constructor(private readonly rc: RemoteConfigService) {}

  @Get('media-limits')
  @AdminPermission('config.media-limits.read')
  async getMediaLimits() {
    return this.rc.getMediaLimits();
  }

  @Patch('media-limits')
  @AdminPermission('config.media-limits.write')
  async patchMediaLimits(
    @Body(zodPipe(patchMediaLimitsSchema)) body: ReturnType<typeof patchMediaLimitsSchema.parse>,
    @Req() req: Request & { admin: AdminAuthContext },
  ) {
    const current = await this.rc.getMediaLimits();
    const updated = { ...current, ...body };
    return this.rc.setMediaLimits(updated, req.admin.id);
  }

  @Patch('app-versions')
  @AdminPermission('config.app-versions.write')
  @Audit({ action: 'remoteConfig.set.appVersions', entity: 'AppVersionConfig' })
  async patchAppVersions(
    @Body(zodPipe(patchAppVersionsSchema)) body: ReturnType<typeof patchAppVersionsSchema.parse>,
    @Req() req: Request & { admin: AdminAuthContext },
  ) {
    return this.rc.setAppVersions(body, req.admin.id);
  }

  @Patch('maintenance')
  @AdminPermission('config.maintenance.write')
  async patchMaintenance(
    @Body(zodPipe(patchMaintenanceSchema)) body: ReturnType<typeof patchMaintenanceSchema.parse>,
    @Req() req: Request & { admin: AdminAuthContext },
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
