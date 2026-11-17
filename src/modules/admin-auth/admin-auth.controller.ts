import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AdminAuthService } from './admin-auth.service';
import { zodPipe } from '../../common/pipes/zod-validation.pipe';
import { loginSchema, verifyTotpSchema, refreshSchema } from './dto/admin-auth.dto';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { AdminJwtGuard, type AdminAuthContext } from '../../common/guards/admin-jwt.guard';
import { AdminAuthenticated } from '../../common/decorators/admin-authenticated.decorator';

@Controller('api/v1/admin/auth')
export class AdminAuthController {
  constructor(private readonly service: AdminAuthService) {}

  @Post('login')
  @RateLimit({ windowSeconds: 60, max: 10 })
  async login(
    @Body(zodPipe(loginSchema)) body: { email: string; password: string },
    @Req() req: Request,
  ) {
    return this.service.login(body.email, body.password, req);
  }

  @Post('2fa/setup')
  @RateLimit({ windowSeconds: 60, max: 10 })
  async setup(@Body('mfaToken') mfaToken: string, @Req() req: Request) {
    return this.service.setupTotp(mfaToken, req);
  }

  @Post('2fa/verify')
  @RateLimit({ windowSeconds: 60, max: 10 })
  async verify(
    @Body(zodPipe(verifyTotpSchema)) body: { code: string },
    @Body('mfaToken') mfaToken: string,
    @Req() req: Request,
  ) {
    return this.service.verifyTotp(mfaToken, body.code, req);
  }

  @Post('refresh')
  @RateLimit({ windowSeconds: 60, max: 20 })
  async refresh(
    @Body(zodPipe(refreshSchema)) body: { refreshToken: string },
    @Req() req: Request,
  ) {
    return this.service.refresh(body.refreshToken, req);
  }

  @Post('logout')
  @UseGuards(AdminJwtGuard)
  @AdminAuthenticated() // A2: No specific permission required, just authentication
  async logout(@Req() req: Request & { admin: AdminAuthContext }) {
    await this.service.logout(req.admin.id, req.admin.sessionId);
    return { loggedOut: true };
  }

  @Get('me')
  @UseGuards(AdminJwtGuard)
  @AdminAuthenticated() // A2: No specific permission required, just authentication
  async me(@Req() req: Request & { admin: AdminAuthContext }) {
    return this.service.me(req.admin.id, req.admin.sessionId);
  }
}
