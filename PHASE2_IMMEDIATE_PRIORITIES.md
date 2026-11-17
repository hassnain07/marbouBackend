# Phase 2 - Immediate Priorities for Direct Implementation

## Critical Path (Must Do First)

### 1. Fix AdminAuthService.login() - CURRENT FOCUS
**Issues:**
- ❌ Uses inconsistent Argon2 params (should use argon2-params.ts)
- ❌ Resets failedLoginCount on password success (should only reset after 2FA)
- ❌ Doesn't use DUMMY_PASSWORD_HASH for timing protection
- ❌ Doesn't lowercase+trim email
- ❌ Lockout check should be BEFORE password check
- ❌ Uses raw IP string (should use getClientIp)

**Required changes:**
```typescript
// 1. Trim+lowercase email at entry
email = email.trim().toLowerCase();

// 2. Check lockout BEFORE password (locked accounts don't reveal email existence)
if (admin && admin.lockedUntil && admin.lockedUntil.getTime() > Date.now()) {
  // Don't increment failures, don't log anything revealing
  throw locked error with retry-after
}

// 3. Use DUMMY_PASSWORD_HASH for unknown emails
if (!admin) {
  await verifyPassword(DUMMY_PASSWORD_HASH, password);
  // Log with SHA-256 hash of email (not plaintext)
  throw generic credentials error
}

// 4. Don't reset failedLoginCount here (move to verify2FA)
```

### 2. Fix AdminAuthService.verify2FA()
**Issues:**
- ❌ Doesn't increment failedLoginCount on TOTP failure
- ❌ Doesn't check if account is locked
- ❌ Doesn't check IP allow-list
- ❌ Doesn't use atomic TOTP replay prevention
- ❌ Doesn't reset failedLoginCount on success

**Required changes:**
- Check locked/inactive/IP before verifying TOTP
- Use repo.updateTotpStepIfFresh() for replay prevention
- Increment failures on TOTP failure
- Reset failures to 0 on complete success
- Apply lockout progression

### 3. Fix AdminAuthService.refresh()
**Issues:**
- ❌ Doesn't use atomic claim (race condition)
- ❌ Doesn't invalidate cache on rotation
- ❌ Doesn't re-check isActive and IP allow-list

**Required changes:**
- Use repo.claimSessionForRefresh (atomic)
- If count===0, treat as reuse → revoke family + invalidate cache
- Re-check admin isActive and IP allow-list
- Invalidate old session cache after successful rotation

### 4. Replace AdminJwtGuard
- ✅ New guard created: admin-jwt.guard.new.ts
- ⏳ Rename to admin-jwt.guard.ts (backup old one first)
- ⏳ Update all imports
- ⏳ Add @AdminAuthenticated to /auth/me and /auth/logout

### 5. Update seed for NODE_ENV safety
- ⏳ Check NODE_ENV in seed
- ⏳ Skip dev accounts in staging/production
- ⏳ Use argon2-params for password hashing

## Estimated Effort

**Service fixes:** ~2-3 hours (complex logic, security-critical)
**Guard replacement:** ~30 minutes
**Repository already done:** ✅
**Utilities already done:** ✅
**Tests:** ~4-5 hours (comprehensive security tests)
**Postman:** ~2 hours (7 subfolders, all re-runnable)
**Docs:** ~1 hour

**Total:** ~10-12 hours of focused implementation

## Recommendation

Given the scope and context limitations, I recommend:

1. **Option A (Systematic):** I continue directly with service fixes → guard replacement → tests → postman → docs (will require multiple conversation turns)

2. **Option B (Delegation):** Create a workflow with the complete specification and let it work through everything systematically with verification at each step

3. **Option C (Hybrid):** I fix the most critical security issues (service + guard) now, then you run tests to see what breaks, and we iterate

**Your choice?**
