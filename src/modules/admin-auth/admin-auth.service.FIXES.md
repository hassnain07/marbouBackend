# AdminAuthService Security Fixes

## Critical Changes Required

### 1. Import Updates
```typescript
// Add these imports at top:
import { hashPassword, verifyPassword, DUMMY_PASSWORD_HASH } from './argon2-params';
import { calculateLockedUntil } from './lockout-config';
import { getClientIp } from '../../common/utils/client-ip';
import { loadEnv } from '../../config/configuration';

// Remove old argon2 imports:
// import { hash, verify } from '@node-rs/argon2';
```

### 2. login() Method - Complete Replacement

```typescript
async login(email: string, password: string, req: Request) {
  // A7: Normalize email (lowercase + trim)
  email = email.trim().toLowerCase();
  
  // A6: Extract real client IP
  const env = loadEnv();
  const ip = getClientIp(req, env.TRUSTED_PROXY_HOPS);
  const userAgent = req.headers['user-agent'];

  // Look up admin
  const admin = await this.repo.findByEmail(email);
  
  // A7: Timing attack protection - verify against dummy hash if email unknown
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

  // A3: Check lockout BEFORE password check (locked accounts don't increment further)
  if (admin.lockedUntil && admin.lockedUntil.getTime() > Date.now()) {
    const retryAfter = Math.ceil((admin.lockedUntil.getTime() - Date.now()) / 1000);
    // Don't log or increment - just reject
    throw new AppError(ErrorCodes.ADM_ACCOUNT_LOCKED, 423, {
      message: `Account locked; retry after ${retryAfter}s`,
      retryAfter,
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
    
    // A9: Emit audit event (count only, no IP)
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
  
  // A3: DON'T reset failedLoginCount here - only after successful 2FA
  
  return {
    mfaToken,
    mfaStage: enrolled ? ('VERIFY' as const) : ('SETUP_REQUIRED' as const),
    adminId: admin.id,
  };
}
```

### 3. verify2FA() Method - Complete Replacement

```typescript
async verify2FA(mfaToken: string, totpCode: string, req: Request) {
  // A8: Strict JWT verification (done in AdminTokenService)
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
      retryAfter,
    });
  }

  if (!admin.isActive) {
    throw AppError.forbidden(ErrorCodes.ADM_ACCOUNT_LOCKED, 'Account is inactive');
  }

  if (admin.ipAllowList.length > 0 && !admin.ipAllowList.includes(ip)) {
    throw AppError.forbidden(ErrorCodes.ADM_IP_NOT_ALLOWED);
  }

  if (!admin.totpSecret || !admin.totpEnabledAt) {
    throw AppError.badRequest(ErrorCodes.ADM_TOTP_INVALID, 'TOTP not enrolled');
  }

  // Decrypt TOTP secret
  const encKey = configuration().ADMIN_TOTP_ENC_KEY;
  const totpSecret = aesDecrypt(admin.totpSecret, encKey);

  // Verify TOTP
  const verified = verifyTotp(totpSecret, totpCode);
  
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
  await this.repo.updateAdmin(admin.id, {
    failedLoginCount: 0,
    lockedUntil: null,
    lastLoginAt: new Date(),
    lastLoginIp: ip,
  });

  // Create session
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

  return { accessToken, refreshToken };
}
```

### 4. refresh() Method - Complete Replacement

```typescript
async refresh(refreshToken: string, req: Request) {
  // A6: Extract real client IP
  const env = loadEnv();
  const ip = getClientIp(req, env.TRUSTED_PROXY_HOPS);

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
    const revokedIds = await this.repo.revokeFamily(oldSession.familyId, 'Refresh token reused');
    await invalidateSessionCache(this.redis, ...revokedIds);
    
    await this.audit.record({
      actorType: AuditActorType.SYSTEM,
      actorId: 'system',
      action: 'admin.refresh.reuse_detected',
      entity: 'AdminSession',
      entityId: oldSession.familyId,
      after: { revokedCount: revokedIds.length },
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

  // Create new session
  const newRefreshToken = randomUUID();
  const newRefreshTokenHash = createHash('sha256').update(newRefreshToken).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  const newSession = await this.repo.createSession({
    adminId: admin.id,
    familyId: oldSession.familyId,
    refreshTokenHash: newRefreshTokenHash,
    ip,
    userAgent: req.headers['user-agent'],
    expiresAt,
  });

  const newAccessToken = AdminTokenService.signAccessToken(admin.id, admin.role, newSession.id);

  // A1: Invalidate old session cache
  await invalidateSessionCache(this.redis, oldSession.id);

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}
```

### 5. logout() and revokeSession() - Add Cache Invalidation

```typescript
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

async revokeSessionById(actorAdminId: string, sessionId: string) {
  const session = await this.repo.findSessionById(sessionId);
  
  // A11: Return 404 if unknown (not 500)
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
```

### 6. Helper for Admin Deactivation (used by admin-users controller)

```typescript
async deactivateAdmin(actorId: string, targetAdminId: string, reason: string) {
  // Get all active sessions before deactivating
  const sessionIds = await this.repo.getActiveSessionIds(targetAdminId);
  
  // Deactivate admin
  await this.repo.updateAdmin(targetAdminId, { isActive: false });
  
  // Revoke all sessions
  await this.repo.revokeAllAdminSessions(targetAdminId, reason);
  
  // A1: Invalidate all session caches immediately
  await invalidateSessionCache(this.redis, ...sessionIds);
  
  await this.audit.record({
    actorType: AuditActorType.ADMIN,
    actorId,
    action: 'admin.user.deactivated',
    entity: 'AdminUser',
    entityId: targetAdminId,
    after: { reason, sessionCount: sessionIds.length },
  });
}
```

## Testing These Changes

After applying these fixes, test:
1. Unknown email and wrong password take same time
2. Locked account rejects before password check
3. TOTP failures count toward lockout
4. Failure count resets only after complete 2FA success
5. Refresh token reuse revokes family and invalidates cache
6. Logout/revoke/deactivate invalidate cache immediately
7. Replayed TOTP codes are rejected
8. IP allow-list is checked at login, 2FA, and refresh
