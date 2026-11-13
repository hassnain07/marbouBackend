import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { DevModule } from './dev/dev.module';

/** M26 / M24 foundation — platform services shared by every module. */
@Module({
  imports: [HealthModule, DevModule],
})
export class PlatformModule {}
