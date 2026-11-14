import { Controller, Get, UseInterceptors } from '@nestjs/common';
import { FeatureFlagsService } from '../feature-flags.service';
import { ETagInterceptor } from '../../../../common/interceptors/etag.interceptor';
import { Public } from '../../../../common/decorators/public.decorator';

/** GET /api/v1/flags — public, ETag-cached client view. */
@Controller('api/v1/flags')
@Public()
@UseInterceptors(ETagInterceptor)
export class FeatureFlagsController {
  constructor(private readonly flags: FeatureFlagsService) {}

  @Get()
  async getPublic() {
    return this.flags.getPublicFlags();
  }
}
