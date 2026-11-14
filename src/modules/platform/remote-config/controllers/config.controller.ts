import { Controller, Get, UseInterceptors } from '@nestjs/common';
import { RemoteConfigService } from '../remote-config.service';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import { ETagInterceptor } from '../../../../common/interceptors/etag.interceptor';
import { Public } from '../../../../common/decorators/public.decorator';

/**
 * GET /api/v1/config — public client config payload with ETag (§7.1, NFR-NET-04).
 * Returns: minVersions, maintenance, mediaLimits, activeFlags.
 * ETag is computed from the full payload so a single change invalidates the cache.
 */
@Controller('api/v1/config')
@Public()
@UseInterceptors(ETagInterceptor)
export class ConfigController {
  constructor(
    private readonly rc: RemoteConfigService,
    private readonly flags: FeatureFlagsService,
  ) {}

  @Get()
  async getConfig() {
    const [appVersions, maintenance, mediaLimits, activeFlags] = await Promise.all([
      this.rc.getAppVersions(),
      this.rc.getMaintenance(),
      this.rc.getMediaLimits(),
      this.flags.getPublicFlags(),
    ]);
    return { appVersions, maintenance, mediaLimits, activeFlags };
  }
}
