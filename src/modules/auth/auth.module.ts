import { Module } from '@nestjs/common';
import { AuthController, AdminAuthRoutesController } from './auth.controller';
import { OtpChannelsController } from './otp-channels.controller';
import { AuthDevController } from './auth-dev.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { AuthRepository } from './auth.repository';
import { EmailService } from './email/email.service';
import { ConsoleEmailAdapter } from './email/console-email.adapter';
import { SmtpEmailAdapter } from './email/smtp-email.adapter';
import { EMAIL_PORT } from './email/email.port';
import { GoogleVerifier } from './social/google-verifier';
import { FacebookVerifier } from './social/facebook-verifier';
import { AppleVerifier } from './social/apple-verifier';
import { SandboxVerifier } from './social/sandbox-verifier';
import { GOOGLE_VERIFIER, FACEBOOK_VERIFIER, APPLE_VERIFIER } from './social/social-verifier.port';
import { PlatformModule } from '../platform/platform.module';
import { configuration } from '../../config/configuration';

@Module({
  imports: [PlatformModule],
  controllers: [
    AuthController,
    AdminAuthRoutesController,
    OtpChannelsController,
    AuthDevController,
  ],
  providers: [
    AuthService,
    OtpService,
    AuthRepository,
    EmailService,
    // Email port: use SMTP in live mode, console/mock otherwise
    {
      provide: EMAIL_PORT,
      useFactory: () => {
        if (configuration.INTEGRATIONS_MODE === 'live' && configuration.SMTP_HOST) {
          return new SmtpEmailAdapter();
        }
        return new ConsoleEmailAdapter();
      },
    },
    // Social verifiers: use sandbox when INTEGRATIONS_MODE=mock (dev/test only)
    {
      provide: GOOGLE_VERIFIER,
      useFactory: () => {
        if (configuration.INTEGRATIONS_MODE === 'mock') return new SandboxVerifier();
        return new GoogleVerifier();
      },
    },
    {
      provide: FACEBOOK_VERIFIER,
      useFactory: () => {
        if (configuration.INTEGRATIONS_MODE === 'mock') return new SandboxVerifier();
        return new FacebookVerifier();
      },
    },
    {
      provide: APPLE_VERIFIER,
      useFactory: () => {
        if (configuration.INTEGRATIONS_MODE === 'mock') return new SandboxVerifier();
        return new AppleVerifier();
      },
    },
  ],
  exports: [AuthService, AuthRepository, OtpService],
})
export class AuthModule {}
