# Phase 2 Security & Correctness Fix Plan

## Status Tracker
- [x] A6: Client IP utility with tests
- [x] Environment schema updates (TRUSTED_PROXY_HOPS, staging/production safety)
- [ ] A7: Timing attack protection (dummy hash, lowercase+trim emails)
- [ ] A3: TOTP brute-force protection (lockout progression)
- [ ] A4: Atomicity (refresh rotation, TOTP replay with conditional updates)
- [ ] A5: Last Super Admin protection (row locking)
- [ ] A1: Immediate session revocation (Redis cache invalidation)
- [ ] A2: Deny-by-default AdminJwtGuard with @AdminAuthenticated decorator
- [ ] A8: Strict JWT validation (algorithms, issuer, audience)
- [ ] A9: Audit improvements (IDs only, no IP/email in logs)
- [ ] A10: Dev-only seeds and routes (NODE_ENV checks)
- [ ] A11: Repository pattern (move Prisma out of controllers/guards)
- [ ] B: Unit tests (totp, aes, admin-jwt, admin-permissions, client-ip, lockout, env)
- [ ] B: E2E tests (new admin-auth.e2e-spec.ts file)
- [ ] C: Postman P02 rewrite (7 subfolders, correct API contract)
- [ ] D: Cleanup (grep bootstrap, remove stale code)
- [ ] E: Acceptance (docker down/up, seed, tests, Newman, SQL verification)

## Implementation Order
1. Core utilities and constants
2. Repository layer
3. Service layer fixes
4. Guard and decorators
5. Controller updates
6. Tests
7. Postman collection
8. Documentation
9. Final verification

## Open Questions for Owner
1. Lockout progression interpretation: 1/5/15/60 minutes at failures 5/6/7/8+ (need confirmation)
2. IP allow-list format: array of CIDR strings or exact IPs?
3. Should TOTP setup/verify check IP allow-list?
4. Refresh token TTL: 30 days or 12 hours? (Phase doc says 30d, current code says 12h)
