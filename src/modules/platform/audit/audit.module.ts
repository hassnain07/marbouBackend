import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditRepository } from './audit.repository';
import { AuditAdminController } from './controllers/audit-admin.controller';

@Module({
  controllers: [AuditAdminController],
  providers: [AuditService, AuditRepository],
  exports: [AuditService],
})
export class AuditModule {}
