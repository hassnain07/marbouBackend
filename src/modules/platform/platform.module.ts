import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { DevModule } from './dev/dev.module';
import { AuditModule } from './audit/audit.module';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module';
import { RemoteConfigModule } from './remote-config/remote-config.module';
import { DefaultsModule } from './defaults/defaults.module';
import { ConfigController } from './remote-config/controllers/config.controller';

/** M26 / M24 foundation — platform services shared by every module. */
@Module({
  imports: [HealthModule, DevModule, AuditModule, FeatureFlagsModule, RemoteConfigModule, DefaultsModule],
  // ConfigController needs both RemoteConfigService + FeatureFlagsService, so it
  // lives in PlatformModule which imports both sub-modules.
  controllers: [ConfigController],
  exports: [AuditModule, FeatureFlagsModule, RemoteConfigModule, DefaultsModule],
})
export class PlatformModule {}
