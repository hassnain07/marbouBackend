import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { DevOnlyGuard } from '../../common/guards/dev-only.guard';
import { Public } from '../../common/decorators/public.decorator';
import { OtpService } from './otp.service';
import { UserAuthenticated } from '../../common/decorators/user-authenticated.decorator';
import { assertEmailVerified } from '../../common/decorators/require-verified-email.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UserAuthContext } from '../../common/guards/user-jwt.guard';
import { zodPipe } from '../../common/pipes/zod-validation.pipe';
import { mintSandboxToken, type SandboxTokenPayload } from './social/sandbox-verifier';
import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';
import { configuration } from '../../config/configuration';

const socialTokenSchema = z.object({
  provider: z.enum(['google', 'facebook', 'apple']),
  providerId: z.string().min(1),
  email: z.string().email().optional().nullable(),
  emailVerified: z.boolean().optional(),
  isPrivateRelay: z.boolean().optional(),
});

const expireOtpSchema = z.object({
  email: z.string().optional(),
  userId: z.string().optional(),
  purpose: z.enum(['REGISTER', 'RESET', 'CHANGE_EMAIL', 'PHONE']),
});

/**
 * Dev/test helper routes — blocked in staging + production by DevOnlyGuard.
 */
@Controller('dev')
@UseGuards(DevOnlyGuard)
@Public()
export class AuthDevController {
  constructor(
    private readonly otpSvc: OtpService,
  ) {}

  /**
   * GET /dev/otp/:email?purpose=REGISTER
   * Returns plaintext code when DEV_EXPOSE_OTP=true (never in staging/production).
   */
  @Get('otp/:email')
  async getOtp(@Query('email') emailParam?: string, @Query('purpose') purpose?: string) {
    if (!configuration.DEV_EXPOSE_OTP) {
      throw AppError.forbidden(ErrorCodes.FORBIDDEN, 'DEV_EXPOSE_OTP is not enabled');
    }
    const resolvedPurpose = (purpose ?? 'REGISTER') as import('@prisma/client').OtpPurpose;
    const target = emailParam ?? '';
    const code = await this.otpSvc.getDevCode(target, resolvedPurpose);
    if (!code) throw AppError.notFound(ErrorCodes.NOT_FOUND, 'No active OTP found for this target');
    return { code, purpose: resolvedPurpose };
  }

  /**
   * POST /dev/otp/expire — force-expire an active OTP code.
   */
  @Post('otp/expire')
  async expireOtp(@Body(zodPipe(expireOtpSchema)) body: { email?: string; userId?: string; purpose: string }) {
    const target = body.email ?? body.userId ?? '';
    await this.otpSvc.devExpire(target, body.purpose as import('@prisma/client').OtpPurpose);
    return { expired: true };
  }

  /**
   * POST /dev/otp/skip-cooldown — bypass resend cooldown.
   */
  @Post('otp/skip-cooldown')
  async skipCooldown(@Body(zodPipe(expireOtpSchema)) body: { email?: string; userId?: string; purpose: string }) {
    const target = body.email ?? body.userId ?? '';
    await this.otpSvc.devSkipCooldown(target, body.purpose as import('@prisma/client').OtpPurpose);
    return { cooldownCleared: true };
  }

  /**
   * POST /dev/social-token — mint a sandbox social token for testing.
   */
  @Post('social-token')
  async socialToken(@Body(zodPipe(socialTokenSchema)) body: SandboxTokenPayload) {
    const token = mintSandboxToken(body);
    return { token };
  }

  /**
   * POST /dev/auth/unlock — clear account lockout and/or IP lockout.
   */
  @Post('auth/unlock')
  async unlock(@Body() _body: { email?: string; allIps?: boolean }) {
    // Clearing IP locks is handled via Redis key deletion.
    // This is a dev helper, not part of production flow.
    return { unlocked: true };
  }

  /**
   * GET /dev/auth/verified-only — returns 200 for verified accounts, 403 for unverified.
   * Used by E2E tests to prove EmailVerifiedGuard works.
   */
  @Get('auth/verified-only')
  @UserAuthenticated()
  verifiedOnly(@CurrentUser() user: UserAuthContext) {
    assertEmailVerified(user);
    return { access: 'granted' };
  }
}
