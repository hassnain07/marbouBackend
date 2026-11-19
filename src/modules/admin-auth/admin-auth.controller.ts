import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AdminAuthService } from './admin-auth.service';
import { zodPipe } from '../../common/pipes/zod-validation.pipe';
import { loginSchema, verifyTotpSchema, refreshSchema } from './dto/admin-auth.dto';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { AdminJwtGuard, type AdminAuthContext } from '../../common/guards/admin-jwt.guard';
import { AdminAuthenticated } from '../../common/decorators/admin-authenticated.decorator';
import { configuration } from '../../config/configuration';
import { Public } from '../../common/decorators/public.decorator';

@Controller('api/v1/admin/auth')
@Public() // Admin routes use AdminJwtGuard; UserJwtGuard must skip this controller
export class AdminAuthController {
  constructor(private readonly service: AdminAuthService) {}

  @Post('login')
  @RateLimit({ windowSeconds: 60, max: configuration.RATE_LIMIT_AUTH_PER_MINUTE })
  async login(
    @Body(zodPipe(loginSchema)) body: { email: string; password: string },
    @Req() req: Request,
  ) {
    return this.service.login(body.email, body.password, req);
  }

  @Post('2fa/setup')
  @RateLimit({ windowSeconds: 60, max: configuration.RATE_LIMIT_AUTH_PER_MINUTE })
  async setup(@Body('mfaToken') mfaToken: string, @Req() req: Request) {
    return this.service.setupTotp(mfaToken, req);
  }

  @Post('2fa/verify')
  @RateLimit({ windowSeconds: 60, max: configuration.RATE_LIMIT_AUTH_PER_MINUTE })
  async verify(
    @Body(zodPipe(verifyTotpSchema)) body: { code: string },
    @Body('mfaToken') mfaToken: string,
    @Req() req: Request,
  ) {
    return this.service.verifyTotp(mfaToken, body.code, req);
  }

  @Post('refresh')
  @RateLimit({ windowSeconds: 60, max: configuration.RATE_LIMIT_AUTH_PER_MINUTE })
  async refresh(
    @Body(zodPipe(refreshSchema)) body: { refreshToken: string },
    @Req() req: Request,
  ) {
    return this.service.refresh(body.refreshToken, req);
  }

  @Post('logout')
  @UseGuards(AdminJwtGuard)
  @AdminAuthenticated()
  async logout(@Req() req: Request & { admin: AdminAuthContext }) {
    await this.service.logout(req.admin.id, req.admin.sessionId);
    return { loggedOut: true };
  }

  @Get('me')
  @UseGuards(AdminJwtGuard)
  @AdminAuthenticated()
  async me(@Req() req: Request & { admin: AdminAuthContext }) {
    return this.service.me(req.admin.id, req.admin.sessionId);
  }
}
