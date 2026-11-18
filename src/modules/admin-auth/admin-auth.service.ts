import { Injectable } from '@nestjs/common';
import { AdminRole } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { RedisService } from '../../redis/redis.service';
import { AuditService } from '../platform/audit/audit.service';
import { AuditActorType } from '../platform/audit/audit.constants';
import { AdminAuthRepository } from './admin-auth.repository';
import { AdminTokenService } from '../../common/utils/admin-jwt';
import { aesEncrypt, aesDecrypt } from '../../common/utils/aes';
import { generateTotpSecret, verifyTotp as verifyTotpCode, buildOtpauthUri } from '../../common/utils/totp';
import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';
import { invalidateSessionCache } from '../../common/guards/admin-jwt.guard';
import { loadEnv } from '../../config/configuration';
import { verifyPassword, DUMMY_PASSWORD_HASH } from './argon2-params';
import { calculateLockedUntil } from './lockout-config';
import { getClientIp } from '../../common/utils/client-ip';

/**
 * AdminAuthService — Admin authentication, TOTP 2FA, session management, RBAC.
 * AUTH-20, ADM-17, ADM-18, NFR-SEC-07.
 */
@Injectable()
export class AdminAuthService {
  constructor(
    private readonly repo: AdminAuthRepository,
    readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  // ── Login (step 1: password) ────────────────────────────────────────────

  async login(email: string, password: string, req: Request) {
    // A7: Normalize email at service boundary (DTO already trims, belt-and-braces)
    email = email.trim().toLowerCase();

    const env = loadEnv();
    const ip = getClientIp(req, env.TRUSTED_PROXY_HOPS);
    const userAgent = req.headers['user-agent'];

    const admin = await this.repo.findByEmail(email);

    // A7: Timing protection — always verify a hash even for unknown emails
    if (!admin) {
      await verifyPassword(DUMMY_PASSWORD_HASH, password);
      const emailHash = createHash('sha256').update(email).digest('hex');
      await this.repo.createLoginLog({ emailHash, outcome: 'BAD_PASSWORD', ip, userAgent });
      throw AppError.unauthorized(ErrorCodes.ADM_CREDENTIALS_INVALID);
    }

    // A3: Lockout check BEFORE password (locked accounts never increment)
    if (admin.lockedUntil && admin.lockedUntil.getTime() > Date.now()) {
      const retryAfter = Math.ceil((admin.lockedUntil.getTime() - Date.now()) / 1000);
      throw new AppError(ErrorCodes.ADM_ACCOUNT_LOCKED, 423, {
        message: `Account locked; retry after ${retryAfter}s`,
      });
    }

    // Verify password first, then check isActive (item 4: don't reveal inactive status
    // without valid credentials)
    const passwordOk = await verifyPassword(admin.passwordHash, password);

    if (!passwordOk) {
      const newCount = admin.failedLoginCount + 1;
      const lockedUntil = calculateLockedUntil(newCount);
      await this.repo.updateAdmin(admin.id, { failedLoginCount: newCount, lockedUntil });
      await this.repo.createLoginLog({ adminId: admin.id, outcome: 'BAD_PASSWORD', ip, userAgent });

      // A9: audit failed login (counts only)
      await this.audit.record({
        actorType: AuditActorType.SYSTEM,
        actorId: 'system',
        action: 'admin.login.failed',
        entity: 'AdminUser',
        entityId: admin.id,
        after: { failureCount: newCount },
      });
      if (lockedUntil) {
        await this.audit.record({
          actorType: AuditActorType.SYSTEM,
          actorId: 'system',
          action: 'admin.account.locked',
          entity: 'AdminUser',
          entityId: admin.id,
          after: { failureCount: newCount, lockedUntil: lockedUntil.toISOString() },
        });
      }
      throw AppError.unauthorized(ErrorCodes.ADM_CREDENTIALS_INVALID);
    }

    // Password correct — now check isActive (item 4)
    if (!admin.isActive) {
      await this.repo.createLoginLog({ adminId: admin.id, outcome: 'INACTIVE', ip, userAgent });
      throw AppError.forbidden(ErrorCodes.ADM_ACCOUNT_LOCKED, 'Account is inactive');
    }

    // IP allow-list check
    if (admin.ipAllowList.length > 0 && !admin.ipAllowList.includes(ip)) {
      await this.repo.createLoginLog({ adminId: admin.id, outcome: 'IP_BLOCKED', ip, userAgent });
      throw AppError.forbidden(ErrorCodes.ADM_IP_NOT_ALLOWED);
    }

    const enrolled = admin.totpEnabledAt !== null;
    const mfaToken = AdminTokenService.signMfaToken(admin.id, email);
    await this.repo.createLoginLog({ adminId: admin.id, outcome: 'PASSWORD_OK', ip, userAgent });

    return {
      mfaToken,
      mfaStage: enrolled ? ('VERIFY' as const) : ('SETUP_REQUIRED' as const),
    };
  }

  // ── 2FA setup ─────────────────────────────────────────────────────────────

  async setupTotp(mfaToken: string, req: Request) {
    const claims = AdminTokenService.verifyMfaToken(mfaToken);
    if (!claims) throw AppError.unauthorized(ErrorCodes.UNAUTHORIZED, 'Invalid MFA token');

    const admin = await this.repo.findById(claims.sub);
    if (!admin) throw AppError.unauthorized(ErrorCodes.UNAUTHORIZED);
    if (!admin.isActive) throw AppError.forbidden(ErrorCodes.ADM_ACCOUNT_LOCKED, 'Account is inactive');

    const env = loadEnv();
    const ip = getClientIp(req, env.TRUSTED_PROXY_HOPS);
    if (admin.ipAllowList.length > 0 && !admin.ipAllowList.includes(ip)) {
      throw AppError.forbidden(ErrorCodes.ADM_IP_NOT_ALLOWED);
    }
    if (admin.totpEnabledAt !== null) throw AppError.conflict(ErrorCodes.ADM_TOTP_ALREADY_ENROLLED);

    const secret = generateTotpSecret();
    await this.repo.updateAdmin(admin.id, { totpSecret: aesEncrypt(secret) });

    return { secret, otpauthUri: buildOtpauthUri(secret, admin.email) };
  }

  // ── 2FA verify ────────────────────────────────────────────────────────────

  async verifyTotp(mfaToken: string, totpCode: string, req: Request) {
    const claims = AdminTokenService.verifyMfaToken(mfaToken);
    if (!claims) throw AppError.unauthorized(ErrorCodes.UNAUTHORIZED, 'Invalid MFA token');

    const env = loadEnv();
    const ip = getClientIp(req, env.TRUSTED_PROXY_HOPS);
    const userAgent = req.headers['user-agent'];

    const admin = await this.repo.findById(claims.sub);
    if (!admin) throw AppError.unauthorized(ErrorCodes.UNAUTHORIZED);

    // A3: lockout before TOTP (locked accounts never increment)
    if (admin.lockedUntil && admin.lockedUntil.getTime() > Date.now()) {
      const retryAfter = Math.ceil((admin.lockedUntil.getTime() - Date.now()) / 1000);
      throw new AppError(ErrorCodes.ADM_ACCOUNT_LOCKED, 423, {
        message: `Account locked; retry after ${retryAfter}s`,
      });
    }
    if (!admin.isActive) throw AppError.forbidden(ErrorCodes.ADM_ACCOUNT_LOCKED, 'Account is inactive');
    if (admin.ipAllowList.length > 0 && !admin.ipAllowList.includes(ip)) {
      throw AppError.forbidden(ErrorCodes.ADM_IP_NOT_ALLOWED);
    }
    if (!admin.totpSecret) throw AppError.badRequest(ErrorCodes.ADM_TOTP_REQUIRED, undefined, 'TOTP not set up');

    const totpSecret = aesDecrypt(admin.totpSecret);
    // item 3: verifyTotpCode returns the matched step (bigint) or null
    const matchedStep = verifyTotpCode(totpSecret, totpCode, admin.lastTotpStep);

    if (matchedStep === null) {
      const newCount = admin.failedLoginCount + 1;
      const lockedUntil = calculateLockedUntil(newCount);
      await this.repo.updateAdmin(admin.id, { failedLoginCount: newCount, lockedUntil });
      await this.repo.createLoginLog({ adminId: admin.id, outcome: 'BAD_TOTP', ip, userAgent });
      await this.audit.record({
        actorType: AuditActorType.SYSTEM, actorId: 'system',
        action: 'admin.login.failed', entity: 'AdminUser', entityId: admin.id,
        after: { failureCount: newCount },
      });
      if (lockedUntil) {
        await this.audit.record({
          actorType: AuditActorType.SYSTEM, actorId: 'system',
          action: 'admin.account.locked', entity: 'AdminUser', entityId: admin.id,
          after: { failureCount: newCount, lockedUntil: lockedUntil.toISOString() },
        });
      }
      throw AppError.unauthorized(ErrorCodes.ADM_TOTP_INVALID);
    }

    // A4: Atomic replay prevention — store the EXACT step that matched (item 3)
    const updated = await this.repo.updateTotpStepIfFresh(admin.id, matchedStep);
    if (updated === 0) {
      await this.repo.createLoginLog({ adminId: admin.id, outcome: 'TOTP_REPLAY', ip, userAgent });
      throw AppError.unauthorized(ErrorCodes.ADM_TOTP_INVALID, 'TOTP code already used');
    }

    // Success: reset failure count
    const updates: Prisma.AdminUserUpdateInput = {
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      lastLoginIp: ip,
    };
    if (admin.totpEnabledAt === null) {
      updates.totpEnabledAt = new Date();
      await this.audit.record({
        actorType: AuditActorType.ADMIN, actorId: admin.id,
        action: 'admin.totp.enrolled', entity: 'AdminUser', entityId: admin.id,
      });
    }
    await this.repo.updateAdmin(admin.id, updates);

    // Create session — use ADMIN_JWT_REFRESH_TTL (item 2)
    const refreshTtlMs = AdminTokenService.ttlToSeconds(env.ADMIN_JWT_REFRESH_TTL ?? '12h') * 1000;
    const expiresAt = new Date(Date.now() + refreshTtlMs);
    const { token: refreshToken, hash: refreshTokenHash } = AdminTokenService.generateRefreshToken();
    const familyId = randomUUID();

    const session = await this.repo.createSession({
      adminId: admin.id, familyId, refreshTokenHash, ip, userAgent, expiresAt,
    });
    const accessToken = AdminTokenService.signAccessToken(admin.id, admin.role, session.id);

    await this.repo.createLoginLog({ adminId: admin.id, outcome: 'SUCCESS', ip, userAgent });
    await this.audit.record({
      actorType: AuditActorType.ADMIN, actorId: admin.id,
      action: 'admin.login.success', entity: 'AdminSession', entityId: session.id,
    });

    return { accessToken, refreshToken, admin: { id: admin.id, role: admin.role } };
  }

  // ── Refresh ───────────────────────────────────────────────────────────────

  async refresh(refreshToken: string, req: Request) {
    const env = loadEnv();
    const ip = getClientIp(req, env.TRUSTED_PROXY_HOPS);
    const userAgent = req.headers['user-agent'];

    const hash = createHash('sha256').update(refreshToken).digest('hex');
    const oldSession = await this.repo.findSessionByHash(hash);
    if (!oldSession) throw AppError.unauthorized(ErrorCodes.UNAUTHORIZED, 'Invalid refresh token');

    // item 2: check expiry before the atomic claim
    if (oldSession.expiresAt.getTime() < Date.now()) {
      throw AppError.unauthorized(ErrorCodes.ADM_SESSION_REVOKED, 'Refresh token expired');
    }

    // A4: Atomic claim
    const newSessionPlaceholderId = randomUUID();
    const claimed = await this.repo.claimSessionForRefresh(oldSession.id, newSessionPlaceholderId);

    if (claimed === 0) {
      // Reuse detected — revoke the whole family by familyId (item 2)
      const familySessionIds = await this.repo.getFamilySessionIds(oldSession.familyId);
      await this.repo.revokeFamily(oldSession.familyId, 'Refresh token reused');
      if (familySessionIds.length > 0) {
        await invalidateSessionCache(this.redis, ...familySessionIds);
      }
      await this.audit.record({
        actorType: AuditActorType.SYSTEM, actorId: 'system',
        action: 'admin.refresh.reuse_detected', entity: 'AdminSession',
        entityId: oldSession.familyId,
        after: { revokedCount: familySessionIds.length },
      });
      throw AppError.unauthorized(ErrorCodes.ADM_REFRESH_REUSED, 'Refresh token reused — family revoked');
    }

    const admin = await this.repo.findById(oldSession.adminId);
    if (!admin || !admin.isActive) throw AppError.unauthorized(ErrorCodes.UNAUTHORIZED, 'Admin no longer active');
    if (admin.ipAllowList.length > 0 && !admin.ipAllowList.includes(ip)) {
      throw AppError.forbidden(ErrorCodes.ADM_IP_NOT_ALLOWED);
    }

    // item 2: new session inherits the ORIGINAL family expiresAt (absolute cap)
    const { token: newRefreshToken, hash: newRefreshTokenHash } = AdminTokenService.generateRefreshToken();
    const newSession = await this.repo.createSession({
      adminId: admin.id,
      familyId: oldSession.familyId,
      refreshTokenHash: newRefreshTokenHash,
      ip,
      userAgent,
      expiresAt: oldSession.expiresAt, // absolute cap — no sliding extension
    });
    const newAccessToken = AdminTokenService.signAccessToken(admin.id, admin.role, newSession.id);

    // A1: Invalidate old session
    await invalidateSessionCache(this.redis, oldSession.id);

    return { accessToken: newAccessToken, refreshToken: newRefreshToken, admin: { id: admin.id, role: admin.role } };
  }

  // ── Logout ────────────────────────────────────────────────────────────────

  async logout(adminId: string, sessionId: string) {
    await this.repo.revokeSession(sessionId, 'Logged out');
    await invalidateSessionCache(this.redis, sessionId);
    await this.audit.record({
      actorType: AuditActorType.ADMIN, actorId: adminId,
      action: 'admin.logout', entity: 'AdminSession', entityId: sessionId,
    });
  }

  // ── Me ────────────────────────────────────────────────────────────────────

  async me(adminId: string, sessionId: string) {
    const admin = await this.repo.findById(adminId);
    if (!admin) throw AppError.unauthorized(ErrorCodes.UNAUTHORIZED);
    return { id: admin.id, role: admin.role, sessionId, email: admin.email, fullName: admin.fullName };
  }

  // ── Admin management (called by AdminUsersController) ─────────────────────

  async revokeSessionById(actorAdminId: string, sessionId: string) {
    const session = await this.repo.findSessionById(sessionId);
    if (!session) throw AppError.notFound(ErrorCodes.NOT_FOUND, 'Session not found');
    await this.repo.revokeSession(sessionId, 'Revoked by admin');
    await invalidateSessionCache(this.redis, sessionId);
    await this.audit.record({
      actorType: AuditActorType.ADMIN, actorId: actorAdminId,
      action: 'admin.session.revoked', entity: 'AdminSession', entityId: sessionId,
    });
  }

  async deactivateAdmin(actorId: string, targetAdminId: string, sessionIds: string[]) {
    await invalidateSessionCache(this.redis, ...sessionIds);
    await this.audit.record({
      actorType: AuditActorType.ADMIN, actorId,
      action: 'admin.user.deactivated', entity: 'AdminUser', entityId: targetAdminId,
      after: { sessionCount: sessionIds.length },
    });
  }

  async changeAdminRole(actorId: string, targetAdminId: string, newRole: AdminRole, sessionIds: string[]) {
    await invalidateSessionCache(this.redis, ...sessionIds);
    await this.audit.record({
      actorType: AuditActorType.ADMIN, actorId,
      action: 'admin.role.changed', entity: 'AdminUser', entityId: targetAdminId,
      after: { newRole, sessionCount: sessionIds.length },
    });
  }
}

// Re-export for convenience
export { AdminRole };

// Prisma import needed for update input type
import type { Prisma } from '@prisma/client';
