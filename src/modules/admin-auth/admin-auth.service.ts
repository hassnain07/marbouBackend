// unused imports cleaned up — buildOtpauthUri is used in setupTotp
import { Injectable, Logger } from '@nestjs/common';
import { AdminRole } from '@prisma/client';
import { randomUUID, createHash } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { RedisService } from '../../redis/redis.service';
import { AuditService } from '../platform/audit/audit.service';
import { AuditActorType } from '../platform/audit/audit.constants';
import { AdminAuthRepository } from './admin-auth.repository';
import { AdminTokenService } from '../../common/utils/admin-jwt';
import { aesEncrypt, aesDecrypt } from '../../common/utils/aes';
import { generateTotpSecret, verifyTotp, buildOtpauthUri } from '../../common/utils/totp';
import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';
import { invalidateSessionCache } from '../../common/guards/admin-jwt.guard';
import { configuration } from '../../config/configuration';

const LOCKOUT_STEPS_MIN = [1, 5, 15, 60]; // Appendix C auth.lockout.delayMinutes

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    private readonly repo: AdminAuthRepository,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  // ── Login (step 1: password) ─────────────────────────────────────────────

  async login(email: string, password: string, ip: string, userAgent?: string) {
    // Look up the admin. Timing-safe: hash a dummy password when email is unknown.
    const admin = await this.repo.findByEmail(email);
    let passwordOk = false;
    if (!admin) {
      // Burn time so unknown-email and wrong-password take the same time.
      await hash(password, { memoryCost: 4096, timeCost: 2 });
      this.logAttempt(undefined, email, 'BAD_PASSWORD', ip, userAgent);
      throw AppError.unauthorized(ErrorCodes.ADM_CREDENTIALS_INVALID);
    }
    if (admin.passwordHash) {
      passwordOk = await verify(admin.passwordHash, password);
    }
    if (!passwordOk) {
      await this.registerFailedAttempt(
        { id: admin.id, email: admin.email, failedLoginCount: admin.failedLoginCount, lockedUntil: admin.lockedUntil },
        'BAD_PASSWORD',
        ip,
        userAgent,
      );
      throw AppError.unauthorized(ErrorCodes.ADM_CREDENTIALS_INVALID);
    }

    // Account active?
    if (!admin.isActive) {
      this.logAttempt(admin.id, email, 'INACTIVE', ip, userAgent);
      throw AppError.forbidden(ErrorCodes.ADM_ACCOUNT_LOCKED, 'Account is inactive');
    }

    // Locked?
    if (admin.lockedUntil && admin.lockedUntil.getTime() > Date.now()) {
      const retryAfter = Math.ceil((admin.lockedUntil.getTime() - Date.now()) / 1000);
      this.logAttempt(admin.id, email, 'LOCKED', ip, userAgent);
      throw new AppError(ErrorCodes.ADM_ACCOUNT_LOCKED, 423, {
        message: `Account locked; retry after ${retryAfter}s`,
      });
    }

    // IP allow-list
    if (admin.ipAllowList.length > 0 && !admin.ipAllowList.includes(ip)) {
      this.logAttempt(admin.id, email, 'IP_BLOCKED', ip, userAgent);
      throw AppError.forbidden(ErrorCodes.ADM_IP_NOT_ALLOWED);
    }

    // Password OK — issue an MFA-stage token. Determine if TOTP is enrolled.
    const enrolled = admin.totpEnabledAt !== null;
    const mfaToken = AdminTokenService.signMfaToken(admin.id, email);
    this.logAttempt(admin.id, email, 'SUCCESS', ip, userAgent);
    // Reset the failed-attempt counter on a successful password.
    if (admin.failedLoginCount > 0) {
      await this.repo.updateAdmin(admin.id, { failedLoginCount: 0 });
    }
    return {
      mfaToken,
      mfaStage: enrolled ? ('VERIFY' as const) : ('SETUP_REQUIRED' as const),
      adminId: admin.id,
    };
  }

  // ── 2FA setup (only when NOT enrolled) ────────────────────────────────────

  async setupTotp(mfaToken: string, _ip: string, _userAgent?: string) {
    const claims = AdminTokenService.verifyMfaToken(mfaToken);
    if (!claims) {
      throw AppError.unauthorized(ErrorCodes.UNAUTHORIZED, 'Invalid MFA token');
    }
    const admin = await this.repo.findById(claims.sub);
    if (!admin) {
      throw AppError.unauthorized(ErrorCodes.UNAUTHORIZED);
    }
    if (admin.totpEnabledAt !== null) {
      throw AppError.conflict(ErrorCodes.ADM_TOTP_ALREADY_ENROLLED);
    }
    // Generate a new secret, encrypt and store (NOT yet enabled).
    const secret = generateTotpSecret();
    await this.repo.updateAdmin(admin.id, {
      totpSecret: aesEncrypt(secret),
    });
    const otpauthUri = buildOtpauthUri(secret, admin.email);
    return { secret, otpauthUri };
  }

  // ── 2FA verify (completes enrollment or normal login) ──────────────────────

  async verifyTotp(mfaToken: string, code: string, ip: string, userAgent?: string) {
    const claims = AdminTokenService.verifyMfaToken(mfaToken);
    if (!claims) {
      throw AppError.unauthorized(ErrorCodes.UNAUTHORIZED, 'Invalid MFA token');
    }
    const admin = await this.repo.findById(claims.sub);
    if (!admin) {
      throw AppError.unauthorized(ErrorCodes.UNAUTHORIZED);
    }
    if (!admin.totpSecret) {
      throw AppError.unauthorized(ErrorCodes.ADM_TOTP_REQUIRED, 'TOTP not set up');
    }
    if (admin.lockedUntil && admin.lockedUntil.getTime() > Date.now()) {
      const retryAfter = Math.ceil((admin.lockedUntil.getTime() - Date.now()) / 1000);
      throw new AppError(ErrorCodes.ADM_ACCOUNT_LOCKED, 423, {
        message: `Account locked; retry after ${retryAfter}s`,
      });
    }

    const secret = aesDecrypt(admin.totpSecret);
    const lastStep = admin.lastTotpStep ?? null;
    const acceptedStep = verifyTotp(secret, code, lastStep);
    if (!acceptedStep) {
      await this.registerFailedAttempt(
        { id: admin.id, email: admin.email, failedLoginCount: admin.failedLoginCount, lockedUntil: admin.lockedUntil },
        'BAD_TOTP',
        ip,
        userAgent,
      );
      this.logAttempt(admin.id, admin.email, 'BAD_TOTP', ip, userAgent);
      throw AppError.unauthorized(ErrorCodes.ADM_TOTP_INVALID);
    }

    // Mark enrollment complete on first verify, and record the step for replay.
    const updates: Parameters<typeof this.repo.updateAdmin>[1] = {
      lastTotpStep: acceptedStep,
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      lastLoginIp: ip,
    };
    if (admin.totpEnabledAt === null) {
      updates.totpEnabledAt = new Date();
      // Audit the enrollment.
      await this.audit.record({
        actorType: AuditActorType.ADMIN,
        actorId: admin.id,
        action: 'admin.totp.enrolled',
        entity: 'AdminUser',
        entityId: admin.id,
      });
    }
    await this.repo.updateAdmin(admin.id, updates);

    // Create a session and issue tokens.
    const familyId = randomUUID();
    const { token: refreshToken, hash: refreshHash } = AdminTokenService.generateRefreshToken();
    const expiresAt = new Date(
      Date.now() + AdminTokenService.ttlToSeconds(configuration.ADMIN_JWT_REFRESH_TTL || '12h') * 1000,
    );
    const session = await this.repo.createSession({
      adminId: admin.id,
      familyId,
      refreshTokenHash: refreshHash,
      ip,
      userAgent,
      expiresAt,
    });
    const accessToken = AdminTokenService.signAccessToken(admin.id, session.id, admin.role);
    this.logAttempt(admin.id, admin.email, 'SUCCESS', ip, userAgent);

    // Audit login success.
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

  async refresh(refreshToken: string, ip: string, userAgent?: string) {
    const hash = createHash('sha256').update(refreshToken).digest('hex');
    const session = await this.repo.findSessionByHash(hash);
    if (!session) {
      throw AppError.unauthorized(ErrorCodes.ADM_REFRESH_REUSED);
    }
    if (session.revokedAt) {
      // Reuse of a rotated (already-replaced) token → revoke the whole family.
      await this.repo.revokeFamily(session.familyId, 'refresh token reuse');
      throw AppError.unauthorized(ErrorCodes.ADM_REFRESH_REUSED);
    }
    if (session.expiresAt.getTime() < Date.now()) {
      await this.repo.revokeSession(session.id, 'expired');
      throw AppError.unauthorized(ErrorCodes.ADM_SESSION_REVOKED, 'Refresh token expired');
    }
    const admin = await this.repo.findById(session.adminId);
    if (!admin || !admin.isActive) {
      throw AppError.unauthorized(ErrorCodes.ADM_SESSION_REVOKED);
    }

    // Rotate: create a new session in the same family, revoke the old one.
    const { token: newRefresh, hash: newHash } = AdminTokenService.generateRefreshToken();
    const newSession = await this.repo.createSession({
      adminId: admin.id,
      familyId: session.familyId,
      refreshTokenHash: newHash,
      ip,
      userAgent,
      expiresAt: session.expiresAt,
    });
    await this.repo.revokeSession(session.id, 'rotated');
    await this.repo.replaceSession(session.id, newSession.id);
    await invalidateSessionCache(this.redis, session.id);
    const accessToken = AdminTokenService.signAccessToken(admin.id, newSession.id, admin.role);
    return { accessToken, refreshToken: newRefresh, admin: { id: admin.id, role: admin.role } };
  }

  // ── Logout ─────────────────────────────────────────────────────────────────

  async logout(sessionId: string, actorId?: string) {
    await this.repo.revokeSession(sessionId, 'logout');
    await invalidateSessionCache(this.redis, sessionId);
    await this.audit.record({
      actorType: AuditActorType.ADMIN,
      actorId: actorId ?? 'unknown',
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

  // ── Lockout / failed attempts ───────────────────────────────────────────────

  /** Record a failed login/2FA attempt, applying progressive lockout. */
  private async registerFailedAttempt(
    admin: { id: string; email: string; failedLoginCount: number; lockedUntil: Date | null },
    _kind: 'BAD_PASSWORD' | 'BAD_TOTP',
    ip: string,
    userAgent?: string,
  ) {
    const maxAttempts = 5; // Appendix C auth.lockout.maxAttempts
    const next = admin.failedLoginCount + 1;
    if (next >= maxAttempts) {
      // Progressive lock: tier 0=1min, 1=5min, 2=15min, 3+=60min
      const lockTier = Math.floor((next - maxAttempts) / maxAttempts);
      const stepMinutes = LOCKOUT_STEPS_MIN[Math.min(lockTier, LOCKOUT_STEPS_MIN.length - 1)];
      const lockedUntil = new Date(Date.now() + stepMinutes * 60_000);
      await this.repo.updateAdmin(admin.id, { failedLoginCount: next, lockedUntil });
      this.logAttempt(admin.id, admin.email, 'LOCKED', ip, userAgent);
      throw new AppError(ErrorCodes.ADM_ACCOUNT_LOCKED, 423, {
        message: `Account locked for ${stepMinutes} minutes`,
      });
    }
    await this.repo.updateAdmin(admin.id, { failedLoginCount: next });
  }

  private logAttempt(
    adminId: string | undefined,
    email: string,
    outcome: string,
    ip: string,
    userAgent?: string,
  ) {
    // For unknown emails, hash the email instead of storing it.
    const emailHash = adminId ? undefined : createHash('sha256').update(email).digest('hex');
    this.repo.createLoginLog({ adminId, emailHash, outcome, ip, userAgent }).catch((e) =>
      this.logger.warn(`Failed to write login log: ${(e as Error).message}`),
    );
  }
}

export { AdminRole };
