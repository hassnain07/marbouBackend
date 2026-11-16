import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AdminAuthService } from './admin-auth.service';
import { zodPipe } from '../../common/pipes/zod-validation.pipe';
import { loginSchema, verifyTotpSchema, refreshSchema } from './dto/admin-auth.dto';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { AdminJwtGuard, type AdminAuthContext } from '../../common/guards/admin-jwt.guard';

@Controller('api/v1/admin/auth')
export class AdminAuthController {
  constructor(private readonly service: AdminAuthService) {}

  @Post('login')
  @RateLimit({ windowSeconds: 60, max: 10 })
  async login(
    @Body(zodPipe(loginSchema)) body: { email: string; password: string },
    @Req() req: Request,
  ) {
    const ip = resolveIp(req);
    const ua = req.headers['user-agent'];
    return this.service.login(body.email, body.password, ip, ua);
  }

  @Post('2fa/setup')
  @RateLimit({ windowSeconds: 60, max: 10 })
  async setup(@Body('mfaToken') mfaToken: string, @Req() req: Request) {
    const ip = resolveIp(req);
    return this.service.setupTotp(mfaToken, ip, req.headers['user-agent']);
  }

  @Post('2fa/verify')
  @RateLimit({ windowSeconds: 60, max: 10 })
  async verify(
    @Body(zodPipe(verifyTotpSchema)) body: { code: string },
    @Body('mfaToken') mfaToken: string,
    @Req() req: Request,
  ) {
    const ip = resolveIp(req);
    return this.service.verifyTotp(mfaToken, body.code, ip, req.headers['user-agent']);
  }

  @Post('refresh')
  @RateLimit({ windowSeconds: 60, max: 20 })
  async refresh(
    @Body(zodPipe(refreshSchema)) body: { refreshToken: string },
    @Req() req: Request,
  ) {
    const ip = resolveIp(req);
    return this.service.refresh(body.refreshToken, ip, req.headers['user-agent']);
  }

  @Post('logout')
  @UseGuards(AdminJwtGuard)
  async logout(@Req() req: Request & { admin: AdminAuthContext }) {
    await this.service.logout(req.admin.sessionId, req.admin.id);
    return { loggedOut: true };
  }

  @Get('me')
  @UseGuards(AdminJwtGuard)
  async me(@Req() req: Request & { admin: AdminAuthContext }) {
    return this.service.me(req.admin.id, req.admin.sessionId);
  }
}

function resolveIp(req: Request): string {
  const fwd = (req.headers['x-forwarded-for'] as string | undefined) ?? '';
  const direct = fwd.split(',')[0]?.trim() ?? '';
  if (direct && /^[A-Za-z0-9.:[\]]{1,64}$/.test(direct)) return direct;
  return String(req.ip ?? 'unknown');
}
