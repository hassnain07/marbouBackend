import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { AuthRepository } from './auth.repository';
import { OtpService } from './otp.service';
import { EmailService } from './email/email.service';
import { UserTokenService } from '../../common/utils/user-jwt';
import { invalidateUserSessionCache } from '../../common/guards/user-jwt.guard';
import { hashPassword, verifyPassword, DUMMY_PASSWORD_HASH } from '../../common/security/argon2-params';
import { getClientIp } from '../../common/utils/client-ip';
import { loadEnv } from '../../config/configuration';
import { DefaultsService } from '../platform/defaults/defaults.service';
import { AuditService } from '../platform/audit/audit.service';
import { AuditActorType } from '../platform/audit/audit.constants';
import { RedisService } from '../../redis/redis.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';
import { AUTH_PASSWORD_MIN_LENGTH, AUTH_PASSWORD_MAX_LENGTH, AUTH_PASSWORD_REGEX } from './auth.constants';
import type { SocialVerifier } from './social/social-verifier.port';
import { parseUA } from './ua-parser';
import { EventEmitter2 } from '@nestjs/event-emitter';

// IP lockout Redis key (per IP, counts across all accounts)
const ipFailKey = (ip: string) => `auth:ipfail:${ip}`;
const IP_FAIL_WINDOW_SECONDS = 3600; // 1 hour window

@Injectable()
export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly otp: OtpService,
    private readonly email: EmailService,
    private readonly redis: RedisService,
    private readonly defaults: DefaultsService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async issueTokens(
    userId: string,
    req: Request,
  ) {
    const env = loadEnv();
    const ip = getClientIp(req, env.TRUSTED_PROXY_HOPS);
    const ua = req.headers['user-agent'] ?? '';
    const { deviceName, os } = parseUA(ua);
    const deviceId = (req.headers['x-device-id'] as string | undefined) ?? undefined;

    const familyId = randomUUID();
    const refreshToken = randomUUID() + randomUUID(); // 72 chars → ~432 bits
    const refreshHash = createHash('sha256').update(refreshToken).digest('hex');
    const ttlSeconds = UserTokenService.ttlToSeconds(env.JWT_REFRESH_TTL ?? '30d');
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    // Approximate location from x-dev-approx-location in dev/test only
    let approxLocation: string | undefined;
    if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') {
      approxLocation = (req.headers['x-dev-approx-location'] as string | undefined) ?? undefined;
    }

    const session = await this.repo.createSession({
      userId, familyId, refreshHash, deviceName, os, ip, userAgent: ua, deviceId, expiresAt, approxLocation,
    });
    const accessToken = UserTokenService.signAccessToken(userId, session.id);

    return { accessToken, refreshToken, session };
  }

  private validatePassword(password: string): void {
    if (
      password.length < AUTH_PASSWORD_MIN_LENGTH ||
      password.length > AUTH_PASSWORD_MAX_LENGTH ||
      !AUTH_PASSWORD_REGEX.test(password)
    ) {
      throw AppError.unprocessable(ErrorCodes.VALIDATION_FAILED, [
        { field: 'password', issue: `Min ${AUTH_PASSWORD_MIN_LENGTH} chars, must contain a letter and a digit, max ${AUTH_PASSWORD_MAX_LENGTH}` },
      ]);
    }
  }

  private async getLockedUntil(failCount: number): Promise<Date | null> {
    const maxAttempts = await this.defaults.get<number>('auth.lockout.maxAttempts');
    const delays = await this.defaults.get<number[]>('auth.lockout.delayMinutes');
    if (failCount < maxAttempts) return null;
    const tier = Math.min(failCount - maxAttempts, delays.length - 1);
    const minutes = delays[tier] ?? delays[delays.length - 1];
    return new Date(Date.now() + minutes * 60 * 1000);
  }

  private async checkIpLock(ip: string): Promise<void> {
    const ipMaxAttempts = await this.defaults.get<number>('auth.lockout.ipMaxAttempts');
    const count = Number(await this.redis.client.get(ipFailKey(ip)) ?? '0');
    if (count >= ipMaxAttempts) {
      throw new AppError(ErrorCodes.AUTH_ACCOUNT_LOCKED, 423, {
        message: 'Too many failed attempts from this IP',
        details: [{ issue: 'IP temporarily blocked' }],
      });
    }
  }

  private async recordIpFail(ip: string): Promise<void> {
    await this.redis.client.incr(ipFailKey(ip));
    await this.redis.client.expire(ipFailKey(ip), IP_FAIL_WINDOW_SECONDS);
  }

  private async clearIpFail(ip: string): Promise<void> {
    await this.redis.client.del(ipFailKey(ip));
  }

  // ── Register ──────────────────────────────────────────────────────────────

  async register(data: {
    email: string;
    password: string;
    fullName: string;
    language?: string;
    req: Request;
  }) {
    const email = data.email.trim().toLowerCase();
    this.validatePassword(data.password);

    const registrationKey = randomUUID();
    await this.repo.createFunnelEvent({ registrationKey, step: 'REGISTER_STARTED', channel: 'EMAIL' });

    const existing = await this.repo.findUserByEmail(email);
    if (existing) {
      if (existing.emailVerifiedAt !== null) {
        throw AppError.conflict(ErrorCodes.AUTH_EMAIL_EXISTS);
      }
      // Abandoned unverified account — overwrite password/name (pre-hijack protection)
      const passwordHash = await hashPassword(data.password);
      await this.repo.updateUser(existing.id, {
        passwordHash,
        fullName: data.fullName,
        language: (data.language ?? 'AR') as 'AR' | 'EN',
      });
      // Revoke any stale sessions
      const stale = await this.repo.revokeAllUserSessions(existing.id, 'registration overwrite');
      if (stale.length) await invalidateUserSessionCache(this.redis, ...stale);

      const code = await this.otp.issue({ email, purpose: 'REGISTER' });
      await this.email.sendOtp(email, code, (data.language ?? 'ar') as 'ar' | 'en');
      await this.repo.createFunnelEvent({ registrationKey, userId: existing.id, step: 'OTP_SENT', channel: 'EMAIL' });
      this.events.emit('user.registered', { userId: existing.id });
      return { userId: existing.id };
    }

    const passwordHash = await hashPassword(data.password);
    const user = await this.repo.createUser({
      email,
      passwordHash,
      fullName: data.fullName,
      language: data.language,
    });

    const code = await this.otp.issue({ email, userId: user.id, purpose: 'REGISTER' });
    await this.email.sendOtp(email, code, (data.language ?? 'ar') as 'ar' | 'en');
    await this.repo.createFunnelEvent({ registrationKey, userId: user.id, step: 'OTP_SENT', channel: 'EMAIL' });
    this.events.emit('user.registered', { userId: user.id });

    return { userId: user.id };
  }

  // ── OTP request (generic — used for REGISTER, RESET, CHANGE_EMAIL, PHONE) ─

  async requestOtp(params: {
    email?: string;
    purpose: 'REGISTER' | 'RESET' | 'CHANGE_EMAIL' | 'PHONE';
    channel?: 'EMAIL' | 'SMS' | 'WHATSAPP';
    userId?: string;
    language?: string;
  }) {
    const channel = params.channel ?? 'EMAIL';
    const lang = (params.language ?? 'ar') as 'ar' | 'en';

    if (params.purpose === 'REGISTER' || params.purpose === 'RESET') {
      // Email-based, unauthenticated — no account enumeration
      if (!params.email) throw AppError.unprocessable(ErrorCodes.VALIDATION_FAILED, [{ field: 'email', issue: 'required' }]);
      const email = params.email.trim().toLowerCase();

      if (params.purpose === 'RESET') {
        const user = await this.repo.findUserByEmail(email);
        // Always 200 (generic) — only send if verified account exists
        if (user && user.emailVerifiedAt) {
          const code = await this.otp.issue({ email, userId: user.id, purpose: 'RESET' });
          await this.email.sendOtp(email, code, lang);
        }
        return; // generic response
      }

      const code = await this.otp.issue({ email, purpose: 'REGISTER' });
      await this.email.sendOtp(email, code, lang);
      return;
    }

    // Authenticated purposes (CHANGE_EMAIL, PHONE)
    if (!params.userId) throw AppError.unauthorized(ErrorCodes.UNAUTHORIZED);
    const code = await this.otp.issue({ userId: params.userId, purpose: params.purpose as 'CHANGE_EMAIL' | 'PHONE', channel: channel as 'EMAIL' | 'SMS' | 'WHATSAPP' });
    if (channel === 'EMAIL' && params.email) {
      await this.email.sendOtp(params.email, code, lang);
    }
    // SMS/WhatsApp: would call respective port here (flag OFF at launch)
  }

  // ── OTP verify (REGISTER = auto-login) ────────────────────────────────────

  async verifyOtp(params: {
    email?: string;
    purpose: 'REGISTER' | 'RESET' | 'CHANGE_EMAIL' | 'PHONE';
    code: string;
    userId?: string;
    req: Request;
  }) {
    const target = params.email
      ? { email: params.email.trim().toLowerCase() }
      : { userId: params.userId! };

    await this.otp.verify({ ...target, purpose: params.purpose as import('@prisma/client').OtpPurpose, code: params.code });

    if (params.purpose === 'REGISTER') {
      const email = params.email!.trim().toLowerCase();
      const user = await this.repo.findUserByEmail(email);
      if (!user) throw AppError.notFound(ErrorCodes.NOT_FOUND, 'User not found');

      await this.repo.updateUser(user.id, { emailVerifiedAt: new Date() });
      await this.repo.createFunnelEvent({ registrationKey: randomUUID(), userId: user.id, step: 'OTP_VERIFIED', channel: 'EMAIL' });
      this.events.emit('user.email.verified', { userId: user.id });

      const { accessToken, refreshToken } = await this.issueTokens(user.id, params.req);
      await this.repo.createLoginEvent({ userId: user.id, outcome: 'SUCCESS', ip: getClientIp(params.req, loadEnv().TRUSTED_PROXY_HOPS) });
      return { accessToken, refreshToken };
    }

    return {}; // RESET/CHANGE_EMAIL/PHONE returns no tokens here
  }

  // ── Login ─────────────────────────────────────────────────────────────────

  async login(email: string, password: string, req: Request) {
    email = email.trim().toLowerCase();
    const env = loadEnv();
    const ip = getClientIp(req, env.TRUSTED_PROXY_HOPS);
    const ua = req.headers['user-agent'] ?? '';
    const { deviceName, os } = parseUA(ua);

    // IP-level lockout
    await this.checkIpLock(ip);

    const user = await this.repo.findUserByEmail(email);

    // Timing protection for unknown email
    if (!user) {
      await verifyPassword(DUMMY_PASSWORD_HASH, password);
      await this.recordIpFail(ip);
      await this.repo.createLoginEvent({ emailHash: AuthRepository.emailHash(email), outcome: 'BAD_PASSWORD', ip });
      throw AppError.unauthorized(ErrorCodes.AUTH_CREDENTIALS_INVALID);
    }

    // Check account lockout BEFORE password (locked accounts never increment)
    const failKey = `auth:fail:${user.id}`;
    const failCount = Number(await this.redis.client.get(failKey) ?? '0');
    if (failCount >= (await this.defaults.get<number>('auth.lockout.maxAttempts'))) {
      const retryAfterKey = `auth:lockuntil:${user.id}`;
      const lockUntilStr = await this.redis.client.get(retryAfterKey);
      if (lockUntilStr && Number(lockUntilStr) > Date.now()) {
        const retryAfter = Math.ceil((Number(lockUntilStr) - Date.now()) / 1000);
        await this.repo.createLoginEvent({ userId: user.id, outcome: 'LOCKED', deviceName, os, ip });
        throw new AppError(ErrorCodes.AUTH_ACCOUNT_LOCKED, 423, {
          message: `Account locked; retry after ${retryAfter}s`,
          details: [{ issue: `retryAfterSeconds: ${retryAfter}` }],
        });
      }
      // Lock expired — reset
      await this.redis.client.del(failKey);
    }

    // Verify password
    const ok = await verifyPassword(user.passwordHash ?? '', password);
    if (!ok) {
      const newCount = await this.redis.client.incr(failKey);
      await this.redis.client.expire(failKey, 7200); // 2h window for counter
      const lockUntil = await this.getLockedUntil(newCount);
      if (lockUntil) {
        const lockSeconds = Math.ceil((lockUntil.getTime() - Date.now()) / 1000) + 10;
        await this.redis.client.set(`auth:lockuntil:${user.id}`, lockUntil.getTime().toString(), 'EX', lockSeconds);
        await this.audit.record({
          actorType: AuditActorType.SYSTEM, actorId: 'system',
          action: 'auth.account.locked', entity: 'User', entityId: user.id,
          after: { failureCount: newCount },
        });
      }
      await this.recordIpFail(ip);
      await this.repo.createLoginEvent({ userId: user.id, outcome: 'BAD_PASSWORD', deviceName, os, ip });
      throw AppError.unauthorized(ErrorCodes.AUTH_CREDENTIALS_INVALID);
    }

    // Status check
    if (user.status !== 'ACTIVE') {
      await this.repo.createLoginEvent({ userId: user.id, outcome: 'SUSPENDED', deviceName, os, ip });
      throw new AppError(ErrorCodes.ACCOUNT_SUSPENDED, 403, {
        message: user.statusReason ?? 'Account suspended',
        details: user.statusReason ? [{ issue: user.statusReason }] : [],
      });
    }

    // Email verified check
    if (!user.emailVerifiedAt) {
      await this.repo.createLoginEvent({ userId: user.id, outcome: 'EMAIL_NOT_VERIFIED', deviceName, os, ip });
      throw AppError.forbidden(ErrorCodes.AUTH_EMAIL_NOT_VERIFIED);
    }

    // Success — reset failure counters
    await this.redis.client.del(failKey, `auth:lockuntil:${user.id}`);
    await this.clearIpFail(ip);

    const { accessToken, refreshToken } = await this.issueTokens(user.id, req);
    await this.repo.createLoginEvent({ userId: user.id, outcome: 'SUCCESS', deviceName, os, ip });

    return { accessToken, refreshToken, user: { id: user.id } };
  }

  // ── Refresh ───────────────────────────────────────────────────────────────

  async refresh(refreshToken: string, req: Request) {
    const hash = createHash('sha256').update(refreshToken).digest('hex');
    const session = await this.repo.findSessionByHash(hash);
    if (!session) throw AppError.unauthorized(ErrorCodes.AUTH_REFRESH_REUSED);

    if (session.expiresAt && session.expiresAt.getTime() < Date.now()) {
      throw AppError.unauthorized(ErrorCodes.UNAUTHORIZED, 'Refresh token expired');
    }

    // Atomic claim — prevents concurrent refresh race
    const newId = randomUUID();
    const claimed = await this.repo.claimSessionForRefresh(session.id, newId);
    if (claimed === 0) {
      // Reuse detected — revoke whole family
      const familyIds = await this.repo.getFamilySessionIds(session.familyId);
      await this.repo.revokeFamilySessions(session.familyId, 'refresh token reuse');
      if (familyIds.length) await invalidateUserSessionCache(this.redis, ...familyIds);
      await this.audit.record({
        actorType: AuditActorType.SYSTEM, actorId: 'system',
        action: 'auth.refresh.reuse', entity: 'Session', entityId: session.familyId,
        after: { revokedCount: familyIds.length },
      });
      throw AppError.unauthorized(ErrorCodes.AUTH_REFRESH_REUSED);
    }

    await invalidateUserSessionCache(this.redis, session.id);

    const user = await this.repo.findUserById(session.userId);
    if (!user || user.status !== 'ACTIVE') {
      throw AppError.unauthorized(ErrorCodes.UNAUTHORIZED, 'Account no longer active');
    }

    const env = loadEnv();
    const ip = getClientIp(req, env.TRUSTED_PROXY_HOPS);
    const ua = req.headers['user-agent'] ?? '';
    const { deviceName, os } = parseUA(ua);
    const deviceId = (req.headers['x-device-id'] as string | undefined) ?? undefined;

    const newRefreshToken = randomUUID() + randomUUID();
    const newHash = createHash('sha256').update(newRefreshToken).digest('hex');
    const ttlSeconds = UserTokenService.ttlToSeconds(env.JWT_REFRESH_TTL ?? '30d');
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000); // sliding expiry

    const newSession = await this.repo.createSession({
      userId: user.id, familyId: session.familyId, refreshHash: newHash,
      deviceName, os, ip, userAgent: ua, deviceId, expiresAt,
      approxLocation: session.approxLocation ?? undefined,
    });
    const accessToken = UserTokenService.signAccessToken(user.id, newSession.id);

    return { accessToken, refreshToken: newRefreshToken };
  }

  // ── Logout ────────────────────────────────────────────────────────────────

  async logout(sessionId: string, userId: string) {
    await this.repo.revokeSession(sessionId, 'logout');
    await invalidateUserSessionCache(this.redis, sessionId);
    this.events.emit('sessions.revoked', { userId, sessionIds: [sessionId] });
  }

  async logoutAll(userId: string) {
    const ids = await this.repo.revokeAllUserSessions(userId, 'logout-all');
    if (ids.length) await invalidateUserSessionCache(this.redis, ...ids);
    this.events.emit('sessions.revoked', { userId, sessionIds: ids });
  }

  async logoutOthers(userId: string, currentSessionId: string) {
    const ids = await this.repo.revokeOtherSessions(userId, currentSessionId, 'logout-others');
    if (ids.length) await invalidateUserSessionCache(this.redis, ...ids);
  }

  // ── Sessions ──────────────────────────────────────────────────────────────

  async listSessions(userId: string, currentSessionId: string) {
    const rows = await this.repo.listSessions(userId);
    return rows.map((s) => ({ ...s, isCurrent: s.id === currentSessionId }));
  }

  async revokeSession(userId: string, sessionId: string) {
    const session = await this.repo.findSessionById(sessionId);
    if (!session || session.userId !== userId) {
      throw AppError.notFound(ErrorCodes.AUTH_SESSION_NOT_FOUND);
    }
    await this.repo.revokeSession(sessionId, 'revoked by user');
    await invalidateUserSessionCache(this.redis, sessionId);
  }

  async getLoginActivity(userId: string) {
    return this.repo.listLoginEvents(userId, 20);
  }

  // ── Password forgot / reset ───────────────────────────────────────────────

  async forgotPassword(email: string, lang: 'ar' | 'en' = 'ar') {
    email = email.trim().toLowerCase();
    const user = await this.repo.findUserByEmail(email);
    if (user && user.emailVerifiedAt) {
      const code = await this.otp.issue({ email, userId: user.id, purpose: 'RESET' });
      await this.email.sendOtp(email, code, lang);
    }
    // Always 200 generic — no account enumeration
  }

  async resetPassword(email: string, code: string, newPassword: string) {
    email = email.trim().toLowerCase();
    this.validatePassword(newPassword);

    await this.otp.verify({ email, purpose: 'RESET', code });

    const user = await this.repo.findUserByEmail(email);
    if (!user) throw AppError.notFound(ErrorCodes.NOT_FOUND, 'User not found');

    const passwordHash = await hashPassword(newPassword);
    await this.repo.updateUser(user.id, { passwordHash });

    // Revoke ALL sessions
    const ids = await this.repo.revokeAllUserSessions(user.id, 'password reset');
    if (ids.length) await invalidateUserSessionCache(this.redis, ...ids);

    // Clear lockout counters
    await this.redis.client.del(`auth:fail:${user.id}`, `auth:lockuntil:${user.id}`);

    await this.email.sendPasswordResetNotice(email, (user.language?.toLowerCase() ?? 'ar') as 'ar' | 'en');
    this.events.emit('password.changed', { userId: user.id });
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    this.validatePassword(newPassword);
    const user = await this.repo.findUserById(userId);
    if (!user) throw AppError.unauthorized(ErrorCodes.UNAUTHORIZED);
    const ok = await verifyPassword(user.passwordHash ?? '', currentPassword);
    if (!ok) throw AppError.unauthorized(ErrorCodes.AUTH_CREDENTIALS_INVALID);

    const passwordHash = await hashPassword(newPassword);
    await this.repo.updateUser(userId, { passwordHash });

    // Revoke all OTHER sessions (current stays)
    // (caller passes currentSessionId — we revoke others separately via logoutOthers)
    this.events.emit('password.changed', { userId });
  }

  // ── Email change ──────────────────────────────────────────────────────────

  async initiateEmailChange(userId: string, newEmail: string, currentPassword?: string, lang: 'ar' | 'en' = 'ar') {
    newEmail = newEmail.trim().toLowerCase();

    const user = await this.repo.findUserById(userId);
    if (!user) throw AppError.unauthorized(ErrorCodes.UNAUTHORIZED);

    // If account has a password, require it to change email
    if (user.passwordHash && currentPassword) {
      const ok = await verifyPassword(user.passwordHash, currentPassword);
      if (!ok) throw AppError.unauthorized(ErrorCodes.AUTH_CREDENTIALS_INVALID);
    } else if (user.passwordHash && !currentPassword) {
      throw AppError.unprocessable(ErrorCodes.VALIDATION_FAILED, [{ field: 'currentPassword', issue: 'required' }]);
    }

    const existing = await this.repo.findUserByEmail(newEmail);
    if (existing && existing.id !== userId) {
      throw AppError.conflict(ErrorCodes.AUTH_EMAIL_EXISTS);
    }

    // Send OTP to the NEW email address
    const code = await this.otp.issue({ userId, purpose: 'CHANGE_EMAIL' });
    await this.email.sendOtp(newEmail, code, lang);

    // Stash the pending email in Redis (10 min)
    await this.redis.client.set(`auth:pendingemail:${userId}`, newEmail, 'EX', 10 * 60);
  }

  async confirmEmailChange(userId: string, code: string, currentSessionId: string) {
    await this.otp.verify({ userId, purpose: 'CHANGE_EMAIL', code });

    const newEmail = await this.redis.client.get(`auth:pendingemail:${userId}`);
    if (!newEmail) throw AppError.unprocessable(ErrorCodes.AUTH_OTP_EXPIRED, [], 'Email change session expired');

    const user = await this.repo.findUserById(userId);
    const oldEmail = user?.email;

    await this.repo.updateUser(userId, { email: newEmail, emailVerifiedAt: new Date() });
    await this.redis.client.del(`auth:pendingemail:${userId}`);

    // Revoke other sessions
    const ids = await this.repo.revokeOtherSessions(userId, currentSessionId, 'email changed');
    if (ids.length) await invalidateUserSessionCache(this.redis, ...ids);

    if (oldEmail) {
      await this.email.sendEmailChangedNotice(oldEmail, newEmail, (user?.language?.toLowerCase() ?? 'ar') as 'ar' | 'en');
    }
  }

  // ── Phone ─────────────────────────────────────────────────────────────────

  async updatePhone(userId: string, phoneNumber: string) {
    const { parsePhoneNumber, isValidPhoneNumber } = await import('libphonenumber-js');
    const valid = isValidPhoneNumber(phoneNumber, 'SD');
    if (!valid) {
      // Try parsing with + prefix
      const withPlus = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
      const valid2 = isValidPhoneNumber(withPlus, 'SD');
      if (!valid2) throw AppError.unprocessable(ErrorCodes.AUTH_PHONE_INVALID);
    }
    const parsed = parsePhoneNumber(phoneNumber, 'SD');
    const e164 = parsed.format('E.164');

    await this.repo.updateUser(userId, {
      phoneNumber: e164,
      verifiedPhoneNumber: null, // clear verified phone on number change
    });
  }

  // ── Social auth ───────────────────────────────────────────────────────────

  async socialAuth(provider: 'google' | 'facebook' | 'apple', token: string, req: Request, verifier: SocialVerifier) {
    const profile = await verifier.verify(token);

    // Try to find existing social identity
    const existingIdentity = await this.repo.findSocialIdentity(provider.toUpperCase(), profile.providerId);

    if (existingIdentity) {
      const user = existingIdentity.user;
      if (user.status !== 'ACTIVE') {
        throw new AppError(ErrorCodes.ACCOUNT_SUSPENDED, 403, {
          message: user.statusReason ?? 'Account suspended',
        });
      }
      const { accessToken, refreshToken } = await this.issueTokens(user.id, req);
      await this.repo.createLoginEvent({ userId: user.id, outcome: 'SOCIAL_SUCCESS', ip: getClientIp(req, loadEnv().TRUSTED_PROXY_HOPS) });
      return { accessToken, refreshToken, user: { id: user.id, browseOnly: !user.emailVerifiedAt } };
    }

    // Check if provider email matches an existing account
    const isPrivateRelay = profile.isPrivateRelay ?? profile.email?.endsWith('@privaterelay.appleid.com') ?? false;

    if (profile.email && !isPrivateRelay && profile.emailVerified) {
      const existing = await this.repo.findUserByEmail(profile.email.trim().toLowerCase());
      if (existing) {
        // Link by verified email
        if (!existing.emailVerifiedAt) {
          // Pre-hijack protection: unverified password account — neutralize and link
          const revokedIds = await this.repo.revokeAllUserSessions(existing.id, 'social link pre-hijack');
          if (revokedIds.length) await invalidateUserSessionCache(this.redis, ...revokedIds);
          await this.repo.updateUser(existing.id, { passwordHash: null, emailVerifiedAt: new Date() });
        }
        await this.repo.createSocialIdentity({ userId: existing.id, provider: provider.toUpperCase(), providerId: profile.providerId, email: profile.email });
        const { accessToken, refreshToken } = await this.issueTokens(existing.id, req);
        return { accessToken, refreshToken, user: { id: existing.id, browseOnly: false } };
      }
    } else if (profile.email && !isPrivateRelay && !profile.emailVerified) {
      // Unverified provider email that matches an existing account — conflict (AUTH-08)
      if (profile.email) {
        const existing = await this.repo.findUserByEmail(profile.email.trim().toLowerCase());
        if (existing) {
          throw AppError.conflict(ErrorCodes.AUTH_SOCIAL_LINK_CONFLICT);
        }
      }
    }

    // Create new account
    const browseOnly = !profile.email || isPrivateRelay || !profile.emailVerified;
    const user = await this.repo.createUser({
      email: (profile.email && !isPrivateRelay) ? profile.email.trim().toLowerCase() : undefined,
      fullName: profile.displayName ?? 'User',
      emailVerifiedAt: (!browseOnly) ? new Date() : undefined,
    });

    await this.repo.createSocialIdentity({ userId: user.id, provider: provider.toUpperCase(), providerId: profile.providerId, email: profile.email ?? undefined });
    const { accessToken, refreshToken } = await this.issueTokens(user.id, req);
    this.events.emit('user.registered', { userId: user.id });

    return { accessToken, refreshToken, user: { id: user.id, browseOnly } };
  }

  // ── Me ────────────────────────────────────────────────────────────────────

  async me(userId: string) {
    const user = await this.repo.findUserById(userId);
    if (!user) throw AppError.unauthorized(ErrorCodes.UNAUTHORIZED);
    return {
      id: user.id,
      email: user.email,
      emailVerified: !!user.emailVerifiedAt,
      browseOnly: !user.emailVerifiedAt,
      status: user.status,
      statusReason: user.statusReason,
      phoneNumber: user.phoneNumber,
      phoneVerified: !!user.verifiedPhoneNumber,
      language: user.language,
    };
  }

  // ── Admin: suspend/restore user ───────────────────────────────────────────

  async setUserStatus(actorId: string, targetUserId: string, status: 'ACTIVE' | 'SUSPENDED', reason?: string) {
    const user = await this.repo.findUserById(targetUserId);
    if (!user) throw AppError.notFound(ErrorCodes.NOT_FOUND, 'User not found');

    const before = { status: user.status, statusReason: user.statusReason };
    await this.repo.updateUser(targetUserId, {
      status,
      statusReason: reason ?? null,
    });

    // Revoke all sessions + invalidate cache
    const ids = await this.repo.revokeAllUserSessions(targetUserId, `status changed to ${status}`);
    if (ids.length) await invalidateUserSessionCache(this.redis, ...ids);

    await this.audit.record({
      actorType: AuditActorType.ADMIN, actorId,
      action: 'user.status.changed', entity: 'User', entityId: targetUserId,
      before, after: { status, statusReason: reason },
    });

    this.events.emit('user.status.changed', { userId: targetUserId, status, reason });
  }

  // ── Funnel admin ──────────────────────────────────────────────────────────

  async getFunnelStats(from: Date, to: Date, channel?: 'EMAIL' | 'SMS' | 'WHATSAPP') {
    const counts = await this.repo.getFunnelCounts(from, to, channel as import('@prisma/client').OtpChannel | undefined);
    const dropOffTrigger = await this.defaults.get<number>('auth.otp.dropOffTriggerPercent');
    const steps = ['REGISTER_STARTED', 'OTP_SENT', 'OTP_DELIVERED', 'OTP_DELIVERY_FAILED', 'OTP_VERIFIED'];
    const countMap = new Map(counts.map((c) => [c.step, c._count.step]));
    const started = countMap.get('REGISTER_STARTED') ?? 0;
    const verified = countMap.get('OTP_VERIFIED') ?? 0;
    const dropOffPct = started > 0 ? ((started - verified) / started) * 100 : 0;
    return {
      steps: steps.map((s) => ({ step: s, count: countMap.get(s as import('@prisma/client').FunnelStep) ?? 0 })),
      dropOffPercent: Math.round(dropOffPct * 10) / 10,
      exceedsOd01Trigger: dropOffPct > dropOffTrigger,
    };
  }
}
