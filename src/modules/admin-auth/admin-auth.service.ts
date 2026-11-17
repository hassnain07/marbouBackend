import { Injectable } from '@nestjs/common';
import { AdminRole } from '@prisma/client';
import { randomUUID, createHash } from 'node:crypto';
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
import { hashPassword, verifyPassword, DUMMY_PASSWORD_HASH } from './argon2-params';
import { calculateLockedUntil } from './lockout-config';
import { getClientIp } from '../../common/utils/client-ip';

/**
 * AdminAuthService — Admin authentication with mandatory TOTP 2FA, RBAC enforcement,
 * session management, and progressive lockout (AUTH-20, ADM-17, ADM-18, NFR-SEC-07).
 *
 * Security fixes applied (Phase 2):
 * - A1: Immediate cache invalidation on revoke/deactivate
 * - A3: TOTP failures count toward lockout; lockout checked before password
 * - A4: Atomic refresh rotation and TOTP replay prevention
 * - A6: Uses getClientIp with TRUSTED_PROXY_HOPS
 * - A7: Timing attack protection with dummy hash; lowercase+trim emails
 * - A9: Audit entries use IDs only, no PII
 */
@Injectable()
export class AdminAuthService {

  constructor(
    private readonly repo: AdminAuthRepository,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  // ── Login (step 1: password) ─────────────────────────────────────────────

  /**
   * Verify admin password and issue an MFA-stage token.
   * Returns mfaToken (short-lived, marbou-admin-mfa audience).
   *
   * Security:
   * - A7: Lowercase+trim email
   * - A7: Timing attack protection (dummy hash for unknown emails)
   * - A3: Check lockout BEFORE password (locked accounts don't increment)
   * - A3: Don't reset failedLoginCount here (only after successful 2FA)
   * - A6: Extract client IP with TRUSTED_PROXY_HOPS
   * - A9: Log email hash for unknown emails (not plaintext)
   */
  async login(email: string, password: string, req: Request) {
    // A7: Normalize email
    email = email.trim().toLowerCase();

    // A6: Extract real client IP
    const env = loadEnv();
    const ip = getClientIp(req, env.TRUSTED_PROXY_HOPS);
    const userAgent = req.headers['user-agent'];

    // Look up admin
    const admin = await this.repo.findByEmail(email);

    // A7: Timing attack protection — verify against dummy hash if email unknown
    if (!admin) {
      await verifyPassword(DUMMY_PASSWORD_HASH, password);
      // A9: Log with email hash, not plaintext
      const emailHash = createHash('sha256').update(email).digest('hex');
      await this.repo.createLoginLog({
        emailHash,
        outcome: 'BAD_PASSWORD',
        ip,
        userAgent,
      });
      throw AppError.unauthorized(ErrorCodes.ADM_CREDENTIALS_INVALID);
    }

    // A3: Check lockout BEFORE password check (locked accounts don't increment)
    if (admin.lockedUntil && admin.lockedUntil.getTime() > Date.now()) {
      const retryAfter = Math.ceil((admin.lockedUntil.getTime() - Date.now()) / 1000);
      // Don't log or increment — just reject
      throw new AppError(ErrorCodes.ADM_ACCOUNT_LOCKED, 423, {
        message: `Account locked; retry after ${retryAfter}s`,
      });
    }

    // Check if inactive
    if (!admin.isActive) {
      await this.repo.createLoginLog({
        adminId: admin.id,
        outcome: 'INACTIVE',
        ip,
        userAgent,
      });
      throw AppError.forbidden(ErrorCodes.ADM_ACCOUNT_LOCKED, 'Account is inactive');
    }

    // Verify password
    const passwordOk = await verifyPassword(admin.passwordHash, password);

    if (!passwordOk) {
      // A3: Increment failures and apply lockout progression
      const newCount = admin.failedLoginCount + 1;
      const lockedUntil = calculateLockedUntil(newCount);

      await this.repo.updateAdmin(admin.id, {
        failedLoginCount: newCount,
        lockedUntil,
      });

      await this.repo.createLoginLog({
        adminId: admin.id,
        outcome: 'BAD_PASSWORD',
        ip,
        userAgent,
      });

      // A9: Emit audit event (count only, no IP/email)
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

    // IP allow-list check (ADM-18)
    if (admin.ipAllowList.length > 0 && !admin.ipAllowList.includes(ip)) {
      await this.repo.createLoginLog({
        adminId: admin.id,
        outcome: 'IP_BLOCKED',
        ip,
        userAgent,
      });
      throw AppError.forbidden(ErrorCodes.ADM_IP_NOT_ALLOWED);
    }

    // Password OK — issue an MFA-stage token
    const enrolled = admin.totpEnabledAt !== null;
    const mfaToken = AdminTokenService.signMfaToken(admin.id, email);

    await this.repo.createLoginLog({
      adminId: admin.id,
      outcome: 'PASSWORD_OK',
      ip,
      userAgent,
    });

    // A3: DON'T reset failedLoginCount here — only after successful 2FA

    return {
      mfaToken,
      mfaStage: enrolled ? ('VERIFY' as const) : ('SETUP_REQUIRED' as const),
      adminId: admin.id,
    };
  }

  // ── 2FA setup (only when NOT enrolled) ────────────────────────────────────

  /**
   * Generate a new TOTP secret for first-time enrollment.
   * Returns the secret (base32) and otpauthUri for QR code generation.
   *
   * Security:
   * - A7: Check inactive and IP allow-list
   */
  async setupTotp(mfaToken: string, req: Request) {
    const claims = AdminTokenService.verifyMfaToken(mfaToken);
    if (!claims) {
      throw AppError.unauthorized(ErrorCodes.UNAUTHORIZED, 'Invalid MFA token');
    }

    const admin = await this.repo.findById(claims.sub);
    if (!admin) {
      throw AppError.unauthorized(ErrorCodes.UNAUTHORIZED);
    }

    // A7: Check inactive
    if (!admin.isActive) {
      throw AppError.forbidden(ErrorCodes.ADM_ACCOUNT_LOCKED, 'Account is inactive');
    }

    // A7: Check IP allow-list
    const env = loadEnv();
    const ip = getClientIp(req, env.TRUSTED_PROXY_HOPS);
    if (admin.ipAllowList.length > 0 && !admin.ipAllowList.includes(ip)) {
      throw AppError.forbidden(ErrorCodes.ADM_IP_NOT_ALLOWED);
    }

    if (admin.totpEnabledAt !== null) {
      throw AppError.conflict(ErrorCodes.ADM_TOTP_ALREADY_ENROLLED);
    }

    // Generate a new secret, encrypt and store (NOT yet enabled)
    const secret = generateTotpSecret();
    await this.repo.updateAdmin(admin.id, {
      totpSecret: aesEncrypt(secret),
    });

    const otpauthUri = buildOtpauthUri(secret, admin.email);
    return { secret, otpauthUri };
  }

  // ── 2FA verify (completes enrollment or normal login) ──────────────────────

  /**
   * Verify TOTP code and create an authenticated admin session.
   * Returns accessToken + refreshToken.
   *
   * Security:
   * - A3: TOTP failures count toward lockout
   * - A3: Reset failedLoginCount only on complete success (not after password)
   * - A4: Atomic TOTP replay prevention with conditional update
   * - A7: Check lockout, inactive, IP allow-list BEFORE verifying TOTP
   */
  async verifyTotp(mfaToken: string, totpCode: string, req: Request) {
    const claims = AdminTokenService.verifyMfaToken(mfaToken);
    if (!claims) {
      throw AppError.unauthorized(ErrorCodes.UNAUTHORIZED, 'Invalid MFA token');
    }

    // A6: Extract real client IP
    const env = loadEnv();
    const ip = getClientIp(req, env.TRUSTED_PROXY_HOPS);
    const userAgent = req.headers['user-agent'];

    const admin = await this.repo.findById(claims.sub);
    if (!admin) {
      throw AppError.unauthorized(ErrorCodes.UNAUTHORIZED);
    }

    // A3 + A7: Check lockout, inactive, IP allow-list BEFORE verifying TOTP
    if (admin.lockedUntil && admin.lockedUntil.getTime() > Date.now()) {
      const retryAfter = Math.ceil((admin.lockedUntil.getTime() - Date.now()) / 1000);
      throw new AppError(ErrorCodes.ADM_ACCOUNT_LOCKED, 423, {
        message: `Account locked; retry after ${retryAfter}s`,
      });
    }

    if (!admin.isActive) {
      throw AppError.forbidden(ErrorCodes.ADM_ACCOUNT_LOCKED, 'Account is inactive');
    }

    if (admin.ipAllowList.length > 0 && !admin.ipAllowList.includes(ip)) {
      throw AppError.forbidden(ErrorCodes.ADM_IP_NOT_ALLOWED);
    }

    if (!admin.totpSecret) {
      throw AppError.badRequest(ErrorCodes.ADM_TOTP_REQUIRED, undefined, 'TOTP not set up');
    }

    // Decrypt TOTP secret
    const totpSecret = aesDecrypt(admin.totpSecret);

    // Verify TOTP (±1 window for clock skew)
    const verified = verifyTotpCode(totpSecret, totpCode, admin.lastTotpStep);

    if (!verified) {
      // A3: TOTP failure counts toward lockout
      const newCount = admin.failedLoginCount + 1;
      const lockedUntil = calculateLockedUntil(newCount);

      await this.repo.updateAdmin(admin.id, {
        failedLoginCount: newCount,
        lockedUntil,
      });

      await this.repo.createLoginLog({
        adminId: admin.id,
        outcome: 'BAD_TOTP',
        ip,
        userAgent,
      });

      // A9: Emit lockout audit event
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

      throw AppError.unauthorized(ErrorCodes.ADM_TOTP_INVALID);
    }

    // A4: Atomic TOTP replay prevention
    const currentStep = BigInt(Math.floor(Date.now() / 30000));
    const updated = await this.repo.updateTotpStepIfFresh(admin.id, currentStep);

    if (updated === 0) {
      // Step was already used (replay attack)
      await this.repo.createLoginLog({
        adminId: admin.id,
        outcome: 'TOTP_REPLAY',
        ip,
        userAgent,
      });
      throw AppError.unauthorized(ErrorCodes.ADM_TOTP_INVALID, 'TOTP code already used');
    }

    // Success! A3: Reset failure count NOW (not after password)
    const updates: Parameters<typeof this.repo.updateAdmin>[1] = {
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      lastLoginIp: ip,
    };

    // Mark enrollment complete on first verify
    if (admin.totpEnabledAt === null) {
      updates.totpEnabledAt = new Date();
      // A9: Audit the enrollment (ID only)
      await this.audit.record({
        actorType: AuditActorType.ADMIN,
        actorId: admin.id,
        action: 'admin.totp.enrolled',
        entity: 'AdminUser',
        entityId: admin.id,
      });
    }

    await this.repo.updateAdmin(admin.id, updates);

    // Create session with refresh token family
    const familyId = randomUUID();
    const refreshToken = randomUUID();
    const refreshTokenHash = createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const session = await this.repo.createSession({
      adminId: admin.id,
      familyId,
      refreshTokenHash,
      ip,
      userAgent,
      expiresAt,
    });

    const accessToken = AdminTokenService.signAccessToken(admin.id, admin.role, session.id);

    await this.repo.createLoginLog({
      adminId: admin.id,
      outcome: 'SUCCESS',
      ip,
      userAgent,
    });

    // A9: Audit login success
    await this.audit.record({
      actorType: AuditActorType.ADMIN,
      actorId: admin.id,
      action: 'admin.login.success',
      entity: 'AdminSession',
      entityId: session.id,
    });

    return {
      accessToken,
      refreshToken,
      admin: { id: admin.id, role: admin.role },
      sessionId: session.id,
    };
  }

  // ── Refresh (rotates the token; reuse revokes the family) ──────────────────

  /**
   * Rotate refresh token, creating a new session in the same family.
   * Reuse detection revokes the entire family.
   *
   * Security:
   * - A4: Atomic claim with conditional update (race-safe)
   * - A1: Invalidate old session cache immediately
   * - A7: Re-check admin isActive and IP allow-list
   * - A9: Audit reuse detection
   */
  async refresh(refreshToken: string, req: Request) {
    // A6: Extract real client IP
    const env = loadEnv();
    const ip = getClientIp(req, env.TRUSTED_PROXY_HOPS);
    const userAgent = req.headers['user-agent'];

    const refreshTokenHash = createHash('sha256').update(refreshToken).digest('hex');
    const oldSession = await this.repo.findSessionByHash(refreshTokenHash);

    if (!oldSession) {
      throw AppError.unauthorized(ErrorCodes.UNAUTHORIZED, 'Invalid refresh token');
    }

    // A4: Atomically claim the session (prevents race conditions)
    const newSessionId = randomUUID();
    const claimed = await this.repo.claimSessionForRefresh(oldSession.id, newSessionId);

    if (claimed === 0) {
      // Session was already claimed/revoked (reuse detected!)
      // A1 + A9: Revoke entire family and invalidate cache
      const familySessions = await this.repo.getActiveSessionIds(oldSession.adminId);
      await this.repo.revokeFamily(oldSession.familyId, 'Refresh token reused');
      await invalidateSessionCache(this.redis, ...familySessions);

      await this.audit.record({
        actorType: AuditActorType.SYSTEM,
        actorId: 'system',
        action: 'admin.refresh.reuse_detected',
        entity: 'AdminSession',
        entityId: oldSession.familyId,
        after: { revokedCount: familySessions.length },
      });

      throw AppError.unauthorized(ErrorCodes.ADM_REFRESH_REUSED, 'Refresh token reused - family revoked');
    }

    // A7: Re-check admin is still active and IP allow-list
    const admin = await this.repo.findById(oldSession.adminId);
    if (!admin || !admin.isActive) {
      throw AppError.unauthorized(ErrorCodes.UNAUTHORIZED, 'Admin no longer active');
    }

    if (admin.ipAllowList.length > 0 && !admin.ipAllowList.includes(ip)) {
      throw AppError.forbidden(ErrorCodes.ADM_IP_NOT_ALLOWED);
    }

    // Create new session in same family
    const newRefreshToken = randomUUID();
    const newRefreshTokenHash = createHash('sha256').update(newRefreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const newSession = await this.repo.createSession({
      adminId: admin.id,
      familyId: oldSession.familyId,
      refreshTokenHash: newRefreshTokenHash,
      ip,
      userAgent,
      expiresAt,
    });

    const newAccessToken = AdminTokenService.signAccessToken(admin.id, admin.role, newSession.id);

    // A1: Invalidate old session cache
    await invalidateSessionCache(this.redis, oldSession.id);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      admin: { id: admin.id, role: admin.role },
    };
  }

  // ── Logout ─────────────────────────────────────────────────────────────────

  /**
   * Revoke the current session (logout).
   *
   * Security:
   * - A1: Invalidate cache immediately
   */
  async logout(adminId: string, sessionId: string) {
    await this.repo.revokeSession(sessionId, 'Logged out');

    // A1: Invalidate cache immediately
    await invalidateSessionCache(this.redis, sessionId);

    await this.audit.record({
      actorType: AuditActorType.ADMIN,
      actorId: adminId,
      action: 'admin.logout',
      entity: 'AdminSession',
      entityId: sessionId,
    });
  }

  // ── Me ───────────────────────────────────────────────────────────────────

  async me(adminId: string, sessionId: string) {
    const admin = await this.repo.findById(adminId);
    if (!admin) {
      throw AppError.unauthorized(ErrorCodes.UNAUTHORIZED);
    }
    return {
      id: admin.id,
      role: admin.role,
      sessionId,
      email: admin.email,
      fullName: admin.fullName,
    };
  }

  // ── Admin management helpers (called by controllers) ────────────────────────

  /**
   * Revoke a specific session by ID (admin action).
   *
   * Security:
   * - A1: Invalidate cache immediately
   * - Returns 404 if session not found (not 500)
   */
  async revokeSessionById(actorAdminId: string, sessionId: string) {
    const session = await this.repo.findSessionById(sessionId);

    if (!session) {
      throw AppError.notFound(ErrorCodes.NOT_FOUND, 'Session not found');
    }

    await this.repo.revokeSession(sessionId, 'Revoked by admin');

    // A1: Invalidate cache immediately
    await invalidateSessionCache(this.redis, sessionId);

    await this.audit.record({
      actorType: AuditActorType.ADMIN,
      actorId: actorAdminId,
      action: 'admin.session.revoked',
      entity: 'AdminSession',
      entityId: sessionId,
    });
  }

  /**
   * Deactivate an admin account and revoke all sessions.
   *
   * Security:
   * - A1: Invalidate all session caches immediately
   */
  async deactivateAdmin(actorId: string, targetAdminId: string, reason: string) {
    // Get all active sessions before deactivating
    const sessionIds = await this.repo.getActiveSessionIds(targetAdminId);

    // Deactivate admin
    await this.repo.updateAdmin(targetAdminId, { isActive: false });

    // Revoke all sessions
    await this.repo.revokeAllAdminSessions(targetAdminId, reason);

    // A1: Invalidate all session caches immediately
    await invalidateSessionCache(this.redis, ...sessionIds);

    // A9: Audit (count only, no PII)
    await this.audit.record({
      actorType: AuditActorType.ADMIN,
      actorId,
      action: 'admin.user.deactivated',
      entity: 'AdminUser',
      entityId: targetAdminId,
      after: { reason, sessionCount: sessionIds.length },
    });
  }

  /**
   * Update an admin's role and revoke all sessions (role change = re-auth required).
   *
   * Security:
   * - A1: Invalidate all session caches immediately
   */
  async changeAdminRole(actorId: string, targetAdminId: string, newRole: AdminRole) {
    // Get all active sessions
    const sessionIds = await this.repo.getActiveSessionIds(targetAdminId);

    // Update role
    await this.repo.updateAdmin(targetAdminId, { role: newRole });

    // Revoke all sessions (role change requires re-authentication)
    await this.repo.revokeAllAdminSessions(targetAdminId, 'Role changed');

    // A1: Invalidate all session caches immediately
    await invalidateSessionCache(this.redis, ...sessionIds);

    await this.audit.record({
      actorType: AuditActorType.ADMIN,
      actorId,
      action: 'admin.role.changed',
      entity: 'AdminUser',
      entityId: targetAdminId,
      after: { newRole, sessionCount: sessionIds.length },
    });
  }

  /**
   * Create a new admin account (Super Admin only).
   *
   * Security:
   * - Uses centralized Argon2 parameters
   * - A7: Lowercase+trim email
   */
  async createAdmin(
    actorId: string,
    data: {
      email: string;
      password: string;
      fullName: string;
      role: AdminRole;
      ipAllowList?: string[];
    },
  ) {
    // A7: Normalize email
    const email = data.email.trim().toLowerCase();

    // Check for duplicate
    const existing = await this.repo.findByEmail(email);
    if (existing) {
      throw AppError.conflict(ErrorCodes.ADM_EMAIL_EXISTS, 'Email already exists');
    }

    // Hash password with centralized parameters
    const passwordHash = await hashPassword(data.password);

    const admin = await this.repo.updateAdmin(randomUUID(), {
      email,
      passwordHash,
      fullName: data.fullName,
      role: data.role,
      ipAllowList: data.ipAllowList ?? [],
      isActive: true,
    });

    await this.audit.record({
      actorType: AuditActorType.ADMIN,
      actorId,
      action: 'admin.user.created',
      entity: 'AdminUser',
      entityId: admin.id,
      after: { role: data.role, email },
    });

    return admin;
  }
}

export { AdminRole };
