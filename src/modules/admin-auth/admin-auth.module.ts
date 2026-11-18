import { Module } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';
import { AdminAuthRepository } from './admin-auth.repository';
import { AdminAuthController } from './admin-auth.controller';
import {
  AdminUsersController,
  AdminSessionsController,
  AdminLoginLogsController,
} from './admin-users.controller';
import { PlatformModule } from '../platform/platform.module';

@Module({
  imports: [PlatformModule],
  controllers: [
    AdminAuthController,
    AdminUsersController,
    AdminSessionsController,
    AdminLoginLogsController,
  ],
  providers: [AdminAuthService, AdminAuthRepository],
  exports: [AdminAuthService, AdminAuthRepository],
})
export class AdminAuthModule {}
