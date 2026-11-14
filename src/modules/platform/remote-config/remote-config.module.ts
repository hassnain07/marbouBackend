import { Module } from '@nestjs/common';
import { RemoteConfigService } from './remote-config.service';
import { ConfigAdminController } from './controllers/config-admin.controller';
import { AuditModule } from '../audit/audit.module';

/** RemoteConfigModule no longer owns ConfigController — that lives in PlatformModule
 * to avoid a circular dependency on FeatureFlagsModule. */
@Module({
  imports: [AuditModule],
  controllers: [ConfigAdminController],
  providers: [RemoteConfigService],
  exports: [RemoteConfigService],
})
export class RemoteConfigModule {}
