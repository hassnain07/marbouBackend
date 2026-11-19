import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { zodPipe } from '../../common/pipes/zod-validation.pipe';
import {
  registerSchema, otpRequestSchema, otpVerifySchema, loginSchema, refreshSchema,
  forgotPasswordSchema, resetPasswordSchema, changePasswordSchema,
  changeEmailSchema, confirmEmailSchema, updatePhoneSchema, socialAuthSchema,
} from './dto/auth.dto';
import { UserJwtGuard, type UserAuthContext } from '../../common/guards/user-jwt.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { UserAuthenticated } from '../../common/decorators/user-authenticated.decorator';
import { GOOGLE_VERIFIER, FACEBOOK_VERIFIER, APPLE_VERIFIER } from './social/social-verifier.port';
import type { SocialVerifier } from './social/social-verifier.port';
import { Inject } from '@nestjs/common';

@Controller('api/v1/auth')
export class AuthController {
  constructor(
    private readonly svc: AuthService,
    @Inject(GOOGLE_VERIFIER) private readonly googleVerifier: SocialVerifier,
    @Inject(FACEBOOK_VERIFIER) private readonly facebookVerifier: SocialVerifier,
    @Inject(APPLE_VERIFIER) private readonly appleVerifier: SocialVerifier,
  ) {}

  // ── Registration ────────────────────────────────────────────────────────

  @Post('register')
  @Public()
  async register(
    @Body(zodPipe(registerSchema)) body: { email: string; password: string; fullName: string; language?: string },
    @Req() req: Request,
  ) {
    return this.svc.register({ ...body, req });
  }

  // ── OTP ──────────────────────────────────────────────────────────────────

  @Post('otp/request')
  @UseGuards(UserJwtGuard)
  @Public()
  async requestOtp(
    @Body(zodPipe(otpRequestSchema)) body: { email?: string; purpose: string; channel?: string },
    @Req() req: Request,
  ) {
    const user = (req as unknown as { user?: UserAuthContext }).user;
    await this.svc.requestOtp({
      email: body.email,
      purpose: body.purpose as 'REGISTER' | 'RESET' | 'CHANGE_EMAIL' | 'PHONE',
      channel: body.channel as 'EMAIL' | 'SMS' | 'WHATSAPP' | undefined,
      userId: user?.id,
      language: (req.headers['accept-language']?.split(',')[0]?.trim().split('-')[0] ?? 'ar') as string,
    });
    return { sent: true };
  }

  @Post('otp/verify')
  @UseGuards(UserJwtGuard)
  @Public()
  async verifyOtp(
    @Body(zodPipe(otpVerifySchema)) body: { email?: string; purpose: string; code: string },
    @Req() req: Request,
  ) {
    const user = (req as unknown as { user?: UserAuthContext }).user;
    return this.svc.verifyOtp({
      email: body.email,
      purpose: body.purpose as 'REGISTER' | 'RESET' | 'CHANGE_EMAIL' | 'PHONE',
      code: body.code,
      userId: user?.id,
      req,
    });
  }

  // ── Login / Refresh / Logout ──────────────────────────────────────────────

  @Post('login')
  @Public()
  async login(
    @Body(zodPipe(loginSchema)) body: { email: string; password: string },
    @Req() req: Request,
  ) {
    return this.svc.login(body.email, body.password, req);
  }

  @Post('refresh')
  @Public()
  async refresh(@Body(zodPipe(refreshSchema)) body: { refreshToken: string }, @Req() req: Request) {
    return this.svc.refresh(body.refreshToken, req);
  }

  @Post('logout')
  @UserAuthenticated()
  async logout(@CurrentUser() user: UserAuthContext) {
    await this.svc.logout(user.sessionId, user.id);
    return { loggedOut: true };
  }

  @Post('logout-all')
  @UserAuthenticated()
  async logoutAll(@CurrentUser() user: UserAuthContext) {
    await this.svc.logoutAll(user.id);
    return { loggedOut: true };
  }

  // ── Me ───────────────────────────────────────────────────────────────────

  @Get('me')
  @UserAuthenticated()
  async me(@CurrentUser() user: UserAuthContext) {
    return this.svc.me(user.id);
  }

  // ── Sessions ──────────────────────────────────────────────────────────────

  @Get('sessions')
  @UserAuthenticated()
  async listSessions(@CurrentUser() user: UserAuthContext) {
    return this.svc.listSessions(user.id, user.sessionId);
  }

  @Delete('sessions/:id')
  @UserAuthenticated()
  async revokeSession(@CurrentUser() user: UserAuthContext, @Param('id') id: string) {
    await this.svc.revokeSession(user.id, id);
    return { revoked: true };
  }

  @Delete('sessions')
  @UserAuthenticated()
  async revokeOthers(@CurrentUser() user: UserAuthContext) {
    await this.svc.logoutOthers(user.id, user.sessionId);
    return { revoked: true };
  }

  @Get('login-activity')
  @UserAuthenticated()
  async loginActivity(@CurrentUser() user: UserAuthContext) {
    return this.svc.getLoginActivity(user.id);
  }

  // ── Password ──────────────────────────────────────────────────────────────

  @Post('password/forgot')
  @Public()
  async forgotPassword(@Body(zodPipe(forgotPasswordSchema)) body: { email: string }, @Req() req: Request) {
    const lang = (req.headers['accept-language']?.split(',')[0]?.trim().split('-')[0] ?? 'ar') as 'ar' | 'en';
    await this.svc.forgotPassword(body.email, lang);
    return { sent: true };
  }

  @Post('password/reset')
  @Public()
  async resetPassword(@Body(zodPipe(resetPasswordSchema)) body: { email: string; code: string; newPassword: string }) {
    await this.svc.resetPassword(body.email, body.code, body.newPassword);
    return { reset: true };
  }

  @Post('password/change')
  @UserAuthenticated()
  async changePassword(
    @Body(zodPipe(changePasswordSchema)) body: { currentPassword: string; newPassword: string },
    @CurrentUser() user: UserAuthContext,
  ) {
    await this.svc.changePassword(user.id, body.currentPassword, body.newPassword);
    await this.svc.logoutOthers(user.id, user.sessionId);
    return { changed: true };
  }

  // ── Email change ──────────────────────────────────────────────────────────

  @Post('email/change')
  @UserAuthenticated()
  async initiateEmailChange(
    @Body(zodPipe(changeEmailSchema)) body: { newEmail: string; currentPassword?: string },
    @CurrentUser() user: UserAuthContext,
    @Req() req: Request,
  ) {
    const lang = (req.headers['accept-language']?.split(',')[0]?.trim().split('-')[0] ?? 'ar') as 'ar' | 'en';
    await this.svc.initiateEmailChange(user.id, body.newEmail, body.currentPassword, lang);
    return { sent: true };
  }

  @Post('email/confirm')
  @UserAuthenticated()
  async confirmEmailChange(
    @Body(zodPipe(confirmEmailSchema)) body: { code: string },
    @CurrentUser() user: UserAuthContext,
  ) {
    await this.svc.confirmEmailChange(user.id, body.code, user.sessionId);
    return { changed: true };
  }

  // ── Phone ─────────────────────────────────────────────────────────────────

  @Patch('phone')
  @UserAuthenticated()
  async updatePhone(
    @Body(zodPipe(updatePhoneSchema)) body: { phoneNumber: string },
    @CurrentUser() user: UserAuthContext,
  ) {
    await this.svc.updatePhone(user.id, body.phoneNumber);
    return { updated: true };
  }

  // ── Social ────────────────────────────────────────────────────────────────

  @Post('social/google')
  @Public()
  async socialGoogle(@Body(zodPipe(socialAuthSchema)) body: { idToken?: string; accessToken?: string }, @Req() req: Request) {
    return this.svc.socialAuth('google', body.idToken ?? body.accessToken!, req, this.googleVerifier);
  }

  @Post('social/facebook')
  @Public()
  async socialFacebook(@Body(zodPipe(socialAuthSchema)) body: { idToken?: string; accessToken?: string }, @Req() req: Request) {
    return this.svc.socialAuth('facebook', body.idToken ?? body.accessToken!, req, this.facebookVerifier);
  }

  @Post('social/apple')
  @Public()
  async socialApple(@Body(zodPipe(socialAuthSchema)) body: { idToken?: string; accessToken?: string }, @Req() req: Request) {
    return this.svc.socialAuth('apple', body.idToken ?? body.accessToken!, req, this.appleVerifier);
  }
}

// ── Admin auth controller (admin routes for auth module) ───────────────────

import { AdminJwtGuard, type AdminAuthContext } from '../../common/guards/admin-jwt.guard';
import { AdminPermission } from '../../common/decorators/admin-permission.decorator';
import { setStatusSchema } from './dto/auth.dto';

@Controller('api/v1/admin')
@UseGuards(AdminJwtGuard)
@Public() // UserJwtGuard must skip admin routes; AdminJwtGuard is the guard here
export class AdminAuthRoutesController {
  constructor(private readonly svc: AuthService) {}

  @Patch('users/:id/status')
  @AdminPermission('admin.users.manage')
  async setUserStatus(
    @Param('id') id: string,
    @Body(zodPipe(setStatusSchema)) body: { status: 'ACTIVE' | 'SUSPENDED'; reason?: string },
    @Req() req: Request & { admin: AdminAuthContext },
  ) {
    await this.svc.setUserStatus(req.admin.id, id, body.status, body.reason);
    return { updated: true };
  }

  @Get('auth-funnel')
  @AdminPermission('admin.users.manage')
  async getFunnel(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('channel') channel?: string,
  ) {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 14 * 86400000);
    const toDate = to ? new Date(to) : new Date();
    return this.svc.getFunnelStats(fromDate, toDate, channel as 'EMAIL' | 'SMS' | 'WHATSAPP' | undefined);
  }
}
