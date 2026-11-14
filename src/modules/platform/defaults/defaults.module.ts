import { Module } from '@nestjs/common';
import { DefaultsService } from './defaults.service';
import { DefaultsAdminController } from './controllers/defaults-admin.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [DefaultsAdminController],
  providers: [DefaultsService],
  exports: [DefaultsService],
})
export class DefaultsModule {}
