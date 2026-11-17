# Phase 2 Security Fixes - Progress Tracker

## Completed ✅

1. **Client IP utility (A6)**
   - ✅ Created `src/common/utils/client-ip.ts`
   - ✅ Created `src/common/utils/client-ip.spec.ts` with comprehensive tests
   - ✅ Added TRUSTED_PROXY_HOPS to env.schema.ts
   - ✅ Updated .env and .env.example

2. **Environment Safety (A10)**
   - ✅ Added staging/production checks to env.schema.ts
   - ✅ Rejects insecure secrets containing "change-me"
   - ✅ Rejects default ADMIN_SEED_PASSWORD in staging/production
   - ✅ Updated ADMIN_JWT_SECRET minimum to 32 chars
   - ✅ Updated ADMIN_JWT_REFRESH_TTL to 30d (was 12h)

3. **Argon2 Parameters (A7)**
   - ✅ Created `src/modules/admin-auth/argon2-params.ts`
   - ✅ Generated real dummy hash for timing attack protection
   - ✅ Centralized parameters for seed, create-admin, and login

4. **Lockout Configuration (A3)**
   - ✅ Created `src/modules/admin-auth/lockout-config.ts`
   - ✅ Created `src/modules/admin-auth/lockout-config.spec.ts`
   - ✅ Defined progression: 5→1min, 6→5min, 7→15min, 8+→60min

5. **@AdminAuthenticated Decorator (A2)**
   - ✅ Created `src/common/decorators/admin-authenticated.decorator.ts`

6. **New AdminJwtGuard (A1, A2, A6, A7, A8)**
   - ✅ Created `src/common/guards/admin-jwt.guard.new.ts`
   - ✅ Implements deny-by-default
   - ✅ Uses getClientIp with TRUSTED_PROXY_HOPS
   - ✅ Strict JWT validation (HS256, issuer, audience)
   - ✅ Uses DB role from cache (not JWT claim)
   - ✅ invalidateSessionCache function for bulk invalidation

7. **AdminAuthRepository Methods (A1, A4, A5, A11)**
   - ✅ validateSessionAndAdmin (for guard)
   - ✅ claimSessionForRefresh (atomic refresh rotation)
   - ✅ updateTotpStepIfFresh (atomic TOTP replay prevention)
   - ✅ getActiveSessionIds (for bulk invalidation)
   - ✅ revokeAllAdminSessions (returns IDs for cache invalidation)
   - ✅ lockActiveSuperAdmins (row locking for last-SA protection)

## In Progress 🔄

8. **AdminAuthService Updates** - NEXT
   - [ ] Update login to use argon2-params and timing protection
   - [ ] Update login to apply lockout progression
   - [ ] Update 2fa/verify to apply lockout and clear failures on success
   - [ ] Update refresh to use claimSessionForRefresh (atomic)
   - [ ] Update TOTP setup/verify to use updateTotpStepIfFresh
   - [ ] Update logout/revoke to call invalidateSessionCache
   - [ ] Lowercase+trim emails everywhere
   - [ ] Check IP allow-list in TOTP setup/verify/refresh

9. **Replace Old Guard with New**
   - [ ] Rename admin-jwt.guard.new.ts → admin-jwt.guard.ts
   - [ ] Update imports in all modules
   - [ ] Add @AdminAuthenticated to /auth/me and /auth/logout

10. **Remove Duplicate IP Resolution Code**
    - [ ] Update RateLimitGuard to use getClientIp
    - [ ] Remove resolveIp functions from guards
    - [ ] Update DevController to use getClientIp

## TODO 📋

11. **Audit Improvements (A9)**
    - [ ] Update audit entries to use IDs only
    - [ ] Remove ipAllowList values from before/after
    - [ ] Add admin.refresh.reuse_detected event
    - [ ] Add admin.account.locked event
    - [ ] Add admin.login.failed event (counts only)

12. **Dev-Only Protection (A10)**
    - [ ] Update seed to check NODE_ENV (skip dev accounts in staging/production)
    - [ ] Update DevOnlyGuard to treat staging like production
    - [ ] Add NODE_ENV checks to /dev/admin/* routes

13. **Controller Updates**
    - [ ] Move Prisma access out of admin-users.controller
    - [ ] Move Prisma access out of admin-sessions.controller
    - [ ] Move Prisma access out of admin-login-logs.controller
    - [ ] Add GET /admin/admin-users/:id
    - [ ] Fix DELETE /admin-sessions/:id to return 404 on unknown

14. **Unit Tests (B)**
    - [x] client-ip.spec.ts
    - [x] lockout-config.spec.ts
    - [ ] totp.spec.ts (RFC 6238 vectors, replay, ±1 window)
    - [ ] aes.spec.ts (round trip, tamper, wrong key)
    - [ ] admin-jwt.spec.ts (A8 validation tests)
    - [ ] admin-permissions.spec.ts (role x permission matrix)
    - [ ] env.schema.spec.ts (staging/production safety)

15. **E2E Tests (B)**
    - [ ] Create test/admin-auth.e2e-spec.ts
    - [ ] Full login → setup → verify flow
    - [ ] Wrong password/unknown email timing
    - [ ] Refresh rotation and reuse detection
    - [ ] Logout → immediate 401
    - [ ] Session revoke → immediate 401
    - [ ] Deactivate admin → immediate 401
    - [ ] Role change → old token 401
    - [ ] IP allow-list 403
    - [ ] Lockout then unlock
    - [ ] MFA token on admin routes → 401
    - [ ] Role x route matrix
    - [ ] Last-SA concurrency test
    - [ ] TOTP/refresh concurrency tests
    - [ ] Dev routes 403/404 in staging/production

16. **Postman Collection (C)**
    - [ ] Rewrite P02 folder structure (7 subfolders)
    - [ ] Fix API contract (mfaToken vs code, Bearer placement)
    - [ ] Make re-runnable
    - [ ] Test twice in a row with 0 failures

17. **Documentation (D)**
    - [ ] Update docs/schema-decisions.md with all Phase 2 decisions
    - [ ] Fix date (2024 → 2026)
    - [ ] Update README.md (TRUSTED_PROXY_HOPS, secret lengths, staging rules)
    - [ ] Update postman/README.md
    - [ ] Remove bootstrap references

18. **Final Acceptance (E)**
    - [ ] docker compose down -v; up; migrate; generate; seed twice
    - [ ] Seed with NODE_ENV=staging (verify no dev accounts)
    - [ ] npm run lint
    - [ ] npm run typecheck
    - [ ] npm test (all pass)
    - [ ] npm run test:e2e (all pass, matrix printed)
    - [ ] Newman run P00+P01+P02 twice (0 failures)
    - [ ] SQL verification (totpSecret encrypted, chain valid)
    - [ ] grep proof (no bootstrap, no "as any")

## Open Questions for Owner

1. Lockout progression: Confirmed 1/5/15/60 minutes at 5/6/7/8+ failures?
2. IP allow-list: Exact IP match or CIDR support needed?
3. TOTP setup/verify: Should they also check IP allow-list? (Currently: yes in new design)
4. Refresh token TTL: 30 days (Phase doc) or 12 hours (old code)? → Using 30d now
5. Dev accounts in test environment: Allowed or blocked like staging/production?
