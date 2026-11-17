# Schema Decisions Log

Record of every fix applied to the PRD §9.2 Prisma specification during implementation. Per the architecture doc (§6, §14): the §9.2 schema is a specification, not machine-validated; Phase 0 runs `prisma validate` / `prisma migrate dev` and fixes issues without changing intent, logging every change here.

## Phase 0 — Foundation

1. **Extensions declared in datasource.** Added `extensions = [postgis, pg_trgm]` to the `datasource db` block and `previewFeatures = ["postgresqlExtensions"]` to the generator. The §9.2 comment said the `location` geography column is "added by SQL migration and queried via raw SQL." To keep the column tracked by Prisma (so future `migrate diff` does not drop it) it is declared as `location Unsupported("geography(Point,4326)")?`, which requires PostGIS to exist *before* the `Listing` table is created. Declaring the extensions in the datasource makes the generated init migration emit `CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS pg_trgm;` at the top, before `Listing`, fixing the extension/column ordering. This absorbs the architecture doc's separate `0002_extensions_postgis_trgm` migration into `0001_init` (functionally equivalent; intent preserved).

2. **`location` column modelled as `Unsupported`.** Added `location Unsupported("geography(Point,4326)")?` to `Listing` (per §3.2: PostGIS uses `Unsupported()` types, written/read only via raw SQL). The §9.2 spec left this as a comment only.

3. **`searchTextNormalized` added.** Added `searchTextNormalized String?` to `Listing` per architecture §6 (normalized text column updated on publish/edit for trigram search). A trigram GIN index on it is created by a later raw-SQL migration.

4. **Auxiliary operational models included.** Added `JobRun` (SYS-15 / SYS-03 job-run records), `MediaAsset` (M19 media records), and `CategorySchemaVersion` (CAT-07 versioned schema + ETag). These are named in the §9.1 catalog and the architecture migration list; defining them now keeps Phase 0 health/queue helpers type-safe. Fields follow §9 conventions (UUID keys, timestamps, indexes on filter/join columns).

5. **Composite-unique on `ListingView` removed.** A draft `ListingView` model with a `date` field in a unique constraint was removed; view counting is implemented in Phase 8 per LST-17 with the correct unique-viewer scheme.

6. **Indexes.** Added `@@index` on `User.status`, `State.countryId`, `City.stateId`, `Category.parentId`, `CategoryAttribute.categoryId`, `ChatThread.sellerId/buyerId`, `Offer.threadId`, `Job.employerId/categoryId`, `JobApplication.candidateId`, `Review.subjectId`, `JobRun.name/startedAt`, `MediaAsset.ownerId/phash` so every filter/join column used by later phases is indexed (§5.10).

7. **Decimal/money kept as specified.** `Decimal(14,2)` for prices/amounts, `Decimal(18,6)` for exchange rates, `Currency {SDG, USD}` per row (no silent conversion) — unchanged from §9.2.

### Deferred to later phases (not changed in Phase 0)
- PostGIS GiST index on `Listing.location` → raw-SQL migration in Phase 8/9.
- `pg_trgm` GIN on `title`/`description`/`searchTextNormalized` and GIN on `dynamicAttributes` → raw-SQL migration in Phase 9.
- Range partitioning of `Listing` by `createdAt` → raw-SQL migration in Phase 9 (after search indexes are settled).
- Expression indexes / generated typed columns for `promoteToIndex` attributes → created/retired at runtime by the catalog promoted-index service in Phase 6.
- All §9.1 "remaining catalog entities" (Report, ModerationAction, Notification, etc.) → added in their phase migrations.

## Verification status (Phase 0, no Docker available on this machine)
- `prisma validate` → schema syntactically valid (run).
- `prisma generate` → client generated (run).
- `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` → emits the init SQL including `CREATE EXTENSION` + tables (run if supported offline).
- Runtime `docker compose up` + `prisma migrate dev` → **deferred**; requires Docker/PostgreSQL, which is not installed on this machine. The `docker-compose.yml` is ready; once Docker is available the full Phase 0 exit criteria (`docker compose up` → API healthy) can be run.


---

## Phase 2: Admin Auth & RBAC (2026-11-15, migration `20261115172821_admin_auth_rbac`)

### AdminUser Extensions

**Decision:** Extended AdminUser with auth/security fields while maintaining the separate AdminUser model (not merged with the customer User model).

| Field | Type | Rationale |
|---|---|---|
| `totpSecret` | `String?` | TOTP secret encrypted with AES-256-GCM (iv+tag+ciphertext, base64). NULL until 2FA setup. Never store plaintext (NFR-SEC-07). |
| `totpEnabledAt` | `DateTime?` | Enrollment completion timestamp. NULL = not enrolled yet; admin must complete enrollment at first login. |
| `lastTotpStep` | `BigInt?` | Highest accepted TOTP time-step counter (RFC 6238, 30s). Prevents replay attacks within the ±1 window. |
| `failedLoginCount` | `Int` | Progressive lockout counter. Reset to 0 on successful login. Triggers lockout at 5 (Appendix C `auth.lockout.maxAttempts`). |
| `lockedUntil` | `DateTime?` | Account lock expiry. NULL = not locked. Progressive delays: 1/5/15/60 minutes. |
| `ipAllowList` | `String[]` | IP address whitelist. Empty array = no restriction. Non-empty = only listed IPs allowed (checked on login and every authenticated request). Super Admin configurable per admin. |
| `lastLoginAt` / `lastLoginIp` | `DateTime?` / `String?` | Last successful login audit trail. |
| `isActive` | `Boolean` | Soft deactivation flag. Deactivated admin fails auth immediately; all sessions remain revoked. Default true. |

**Indexes:** Added `@@index([email])` for login lookups.

### AdminSession

**Decision:** Refresh-token family model with rotation and reuse detection (architecture §5.9, AUTH-20).

| Field | Type | Rationale |
|---|---|---|
| `id` | `String @id` | Session UUID. Embedded in admin JWT `sid` claim for fast lookup. |
| `adminId` | `String` | Foreign key to AdminUser. |
| `familyId` | `String` | Token family ID. All rotated tokens in the same login flow share this ID. On reuse detection, the entire family is revoked. |
| `refreshTokenHash` | `String` | SHA-256 hash of the opaque 256-bit refresh token. Never store the raw token (NFR-SEC-05). |
| `ip` / `userAgent` | `String?` | Client metadata captured at session creation for audit and anomaly detection. |
| `createdAt` / `lastSeenAt` | `DateTime` | Session lifecycle tracking. `lastSeenAt` updated on refresh. |
| `expiresAt` | `DateTime` | Hard expiry from env `ADMIN_JWT_REFRESH_TTL` (default 12h). Expired sessions fail refresh. |
| `revokedAt` / `revokedReason` | `DateTime?` / `String?` | Revocation audit trail. Reasons: "logout", "rotated", "role changed", "deactivated", "refresh token reuse", "revoked by admin". |
| `replacedById` | `String?` | Points to the new session ID after rotation. Forms a linked list of the rotation history. |

**Indexes:** `adminId`, `familyId`, `refreshTokenHash` (all lookups are indexed).

**Reuse detection:** When a refresh token is used, the session is marked `revokedAt` and `replacedById` points to the new session. If a client presents a token whose session is already revoked (but not yet expired), the entire `familyId` is revoked — this detects token theft.

### AdminLoginLog

**Decision:** Immutable append-only log of every login attempt, success or failure (AUTH-20, ADM-18).

| Field | Type | Rationale |
|---|---|---|
| `id` | `BigInt @id` | Auto-increment for chronological ordering and efficient pagination. |
| `adminId` | `String?` | FK to AdminUser. NULL when the email was unknown (failed lookup). |
| `emailHash` | `String?` | SHA-256 hash of the attempted email when `adminId` is NULL. Never log the raw email of unknown accounts (PII minimization). |
| `outcome` | `String` | Enum-like string: SUCCESS, BAD_PASSWORD, BAD_TOTP, LOCKED, IP_BLOCKED, INACTIVE, TOTP_SETUP_REQUIRED. |
| `ip` / `userAgent` | `String?` | Client metadata for security analysis. |
| `createdAt` | `DateTime` | Attempt timestamp. |

**Indexes:** `(adminId, createdAt)` for per-admin history; `(outcome, createdAt)` for security dashboards (e.g., all lockouts in the last 24h).

**Retention:** No automatic deletion. Logs are immutable. A future phase may add partitioning by month for long-term archival.

### Why Separate AdminUser Model?

1. **Different security posture:** Admins have mandatory 2FA, IP allow-lists, and progressive lockout. Customers (Phase 3+) have optional 2FA and different lockout rules.
2. **Different JWT audiences:** Admin JWT (`marbou-admin`) must not be usable for customer routes and vice versa (`marbou-user`). Separate models enforce this at the data layer.
3. **Different RBAC models:** Admins have roles (SUPER_ADMIN, CONTENT_MODERATOR, etc.) with a permission matrix. Customers have capabilities (e.g., "can post jobs") with different rules.
4. **Audit requirements:** Admin actions require higher audit fidelity (logged IP, session ID, role). Customer actions have different audit needs.
5. **Compliance:** Some regulations require admin access to be auditable separately from customer access.

### TOTP Implementation Notes

- **Algorithm:** RFC 6238 HOTP with SHA-1 (industry standard), 6 digits, 30-second step.
- **Validation window:** ±1 step (current, previous, next) to tolerate clock skew. Total window = 90 seconds.
- **Replay protection:** `lastTotpStep` records the highest accepted counter. Any code with step ≤ `lastTotpStep` is rejected, even if it's still within the time window.
- **Secret storage:** Generated as 20-byte random value, encoded as base32 for QR code display. Encrypted with AES-256-GCM using `ADMIN_TOTP_ENC_KEY` before storage. The IV, auth tag, and ciphertext are concatenated and base64-encoded as a single string. Tamper detection is built into GCM.
- **Enrollment flow:** On first login, if `totpEnabledAt` is NULL, the admin receives an MFA-stage token. They call `/2fa/setup` to generate the secret, scan the QR code, then call `/2fa/verify` with their first code. Only after successful verification is `totpEnabledAt` set and a usable admin JWT issued.

### Admin JWT Design

Two JWT types with different audiences to prevent cross-use:

| Type | Audience | Lifetime | Purpose | Claims |
|---|---|---|---|---|
| MFA-stage | `marbou-admin-mfa` | 5 min | Only valid for `/admin/auth/2fa/*` endpoints | `sub=adminId, email, stage=MFA` |
| Admin access | `marbou-admin` | 15 min (env) | Valid for all `/api/v1/admin/*` routes | `sub=adminId, sid=sessionId, role` |

**Issuer:** `marbou` for both.  
**Signing:** `ADMIN_JWT_SECRET` (separate from user JWT secret in Phase 3+).  
**Session validation:** On every request, `AdminJwtGuard` checks that `sid` exists in AdminSession, is not revoked, has not expired, and the admin `isActive` is true. This check is Redis-cached for 30 seconds and invalidated on revoke/deactivate, so revocation takes effect within 30s (not the full 15-minute JWT lifetime).

### Lockout Progression

Per Appendix C `auth.lockout.*` defaults interpreted from PRD text "1/5/15/60":

**OPEN QUESTION FOR OWNER:** The PRD Appendix C specifies lockout delays as "1/5/15/60" but does not specify the exact failure-count thresholds. This implementation interprets it as:

- **Failure count 5:** 1 minute lockout
- **Failure count 6:** 5 minutes lockout  
- **Failure count 7:** 15 minutes lockout
- **Failure count 8+:** 60 minutes lockout

Alternative interpretation: "1 failure → 1 min, 5 failures → 5 min" (but this conflicts with maxAttempts=5). Please clarify the intended progression.

**Current implementation:**
- **Max attempts before first lock:** 5 (configurable via DefaultsService `auth.lockout.maxAttempts`)
- **Delay progression by lock tier:** 1 min (5th failure), 5 min (6th), 15 min (7th), 60 min (8th+)
- **Counter reset:** On successful login completion (after TOTP verification), `failedLoginCount` resets to 0
- **Lock timer:** `lockedUntil` is checked before every password/TOTP attempt; if `lockedUntil > now`, return 423 with `retryAfter` in the error payload
- **No increment while locked:** Failed attempts while account is locked do NOT increment `failedLoginCount`

### IP Allow-List

- **Default:** Empty array = no IP restriction (admin can log in from anywhere)
- **When non-empty:** Only IPs in the list are allowed. Both login and every authenticated request enforce this.
- **IP resolution:** Same logic as `RateLimitGuard`: use `x-forwarded-for` first IP if present and valid, otherwise `req.ip`. Requires trust-proxy configuration in production (see README).
- **Management:** Only Super Admin can set/update `ipAllowList` via PATCH `/admin/admin-users/:id`

### RBAC Permission Map

Table-driven permission enforcement in `src/common/rbac/admin-permissions.ts`:

```typescript
export const ADMIN_PERMISSIONS: Record<AdminPermissionKey, AdminRole[]> = {
  'config.flags.write': [AdminRole.SUPER_ADMIN],
  'audit.read': [AdminRole.FINANCIAL_AUDITOR, AdminRole.SUPER_ADMIN],
  // ... etc
};
```

Every admin route uses `@AdminPermission('permission.key')`. The `AdminJwtGuard` checks the admin's role against the permission map and returns 403 if the role is not in the allowed list.

**Design rationale:** Later phases add new routes but only need to reference existing permission keys (or add new keys to the map). No per-route role checks scattered across controllers. The matrix is the single source of truth and can be tested as a table.

### Last-Super-Admin Guard

**Problem:** Demoting or deactivating the only remaining active Super Admin would lock everyone out of admin management.

**Solution:** `PATCH /admin/admin-users/:id` uses a transaction with a row lock:

1. `SELECT ... FOR UPDATE` on the target admin row (prevents concurrent modifications)
2. If the target is currently `SUPER_ADMIN` and `isActive`, count `SELECT COUNT(*) FROM AdminUser WHERE role = 'SUPER_ADMIN' AND isActive = true`
3. If count ≤ 1 and the patch would demote or deactivate, return 409 `ADM_LAST_SUPER_ADMIN`
4. Otherwise proceed with the update

**Race-safe:** The row lock ensures two concurrent requests cannot both pass the count check.

### Audit Trail

All major admin auth events write to the `AuditLog` table (hash-chained, append-only) with `actorType = ADMIN`:

- `admin.login.success` (on 2FA verify success)
- `admin.totp.enrolled` (first 2FA setup)
- `admin.logout`
- `admin.session.revoked` (by Super Admin)
- `admin.user.created` / `admin.user.patched` (admin management)

**PII in audit:** Only IDs, no emails or IPs in the audit payload. AdminLoginLog stores IPs separately.

### Why AES-256-GCM for TOTP Secrets?

- **Authenticated encryption:** GCM provides both confidentiality and integrity. Any tamper attempt fails decryption with a thrown error.
- **NIST-approved:** AES-GCM is a FIPS 140-2 approved mode.
- **Deterministic IV:** We use a random 12-byte IV per encryption (never reused). The IV is stored with the ciphertext; it does not need to be secret.
- **Key management:** `ADMIN_TOTP_ENC_KEY` is a 32-byte UTF-8 string from the environment. In production, this should come from a secure secret store (e.g., AWS Secrets Manager, HashiCorp Vault) and rotated periodically. Key rotation requires re-encrypting all `AdminUser.totpSecret` values.

### Session Revocation Latency

**Access token lifetime:** 15 minutes (from env `ADMIN_JWT_ACCESS_TTL`, default `15m`).

**Problem:** A revoked session's JWT is still valid until expiry. A deactivated admin could use their token for up to 15 minutes.

**Solution:** `AdminJwtGuard` checks session validity on every request (not just at token issue time). The check is Redis-cached for 30 seconds with a key `admin:session:{sid}`. On session revoke or admin deactivate, the cache key is invalidated via `redis.cacheInvalidate(...)`. This ensures a revoked session fails within 30 seconds, not 15 minutes.

**Trade-off:** Every admin request hits Redis (cache-aside pattern). This is acceptable because admin traffic is low-volume compared to customer traffic. If Redis is down, the guard falls back to the database (graceful degradation with a warning log).

### Refresh Token Design

**Why opaque tokens instead of JWT?**

1. **Revocation:** Opaque tokens can be revoked by deleting the database row. JWT refresh tokens require a deny-list (grows unbounded) or short lifetimes (defeats the purpose).
2. **Rotation:** Opaque tokens are cheap to regenerate. Rotating a JWT refresh token requires re-signing and still doesn't prevent replay attacks without a database lookup.
3. **Size:** A 32-byte random token is smaller than a JWT.

**Storage:** Only the SHA-256 hash is stored in `AdminSession.refreshTokenHash`. The raw token is returned once and never logged or persisted. This prevents a database compromise from revealing usable refresh tokens (the attacker would need to brute-force the SHA-256 preimage).

**Family rotation:** Each refresh creates a new session in the same `familyId` and revokes the old session. If an old (revoked) token is reused, the entire family is revoked. This detects token theft: an attacker who steals a token and uses it causes the legitimate user's next refresh to fail, and vice versa. Both parties are immediately logged out, forcing re-authentication.


---

## Phase 2 Code Fixes (2026-11-17)

Bugs found and fixed during Phase 2 sign-off review. No schema changes; no new migration required.

### A1 — Immediate cache invalidation on PATCH /admin-users

`PATCH /admin/admin-users/:id` now revokes sessions inside the same DB transaction (`revokeAdminSessionsInTx`) and calls `invalidateSessionCache` after the transaction commits. Previously the controller revoked sessions in a separate `updateMany` after the transaction, so a cache entry could survive between the transaction commit and the separate revoke call.

### A5 — Last-SA lock now covers ALL active SA rows

The previous implementation locked only the row being modified (`WHERE id = $id FOR UPDATE`). Two concurrent SA-demotion requests on different rows could both pass the count check simultaneously. Fixed by locking ALL active SA rows first (`WHERE role='SUPER_ADMIN' AND isActive=true ORDER BY id FOR UPDATE`) so only one of two concurrent demotions can proceed; the second sees count ≤ 1 and returns 409.

### A1 — DELETE /admin-sessions/:id returns 404 on unknown id

Previously used a bare `update({where:{id}})` which threw a Prisma `P2025` (record not found) error, surfacing as 500. Added an explicit `findUnique` check first; returns 404 `NOT_FOUND` for unknown ids.

### A11 — GET /admin/admin-users/:id added

The endpoint was listed in the architecture spec but was missing from the controller. Added `GET /api/v1/admin/admin-users/:id` (SA only, same select projection as list, 404 if unknown).

### A11 — Prisma access moved to repository

`AdminUsersController` previously called `PrismaService` for the main admin CRUD and session revocation. Session revocation within the PATCH transaction is now delegated to `AdminAuthRepository.revokeAdminSessionsInTx`. Admin creation uses `AdminAuthRepository.createAdmin`.

### A7 — Argon2 params unified

`argon2-params.ts` previously imported from the `argon2` package using TypeScript types (`Options`, `argon2id`) that do not exist in the installed version. Fixed to use `HashOptions` and the numeric constant `2` (Argon2id). The seed and admin-users controller now share the same `hashPassword` helper, so hash parameters are identical for all admin accounts.

### A10 — DevOnlyGuard and seed block staging

`DevOnlyGuard` previously only blocked `NODE_ENV=production`; staging could reach dev routes. Fixed to block both `production` and `staging`. The admin seed previously only skipped dev accounts in `production`; fixed to skip them in everything that is not `development` or `test`.

### A10 — Env schema staging/production rules extended

`INTEGRATIONS_MODE=mock` and `DEV_EXPOSE_OTP=true` were previously only rejected in `production`; now also rejected in `staging`.

### JWT — `signAccessToken` parameter order fixed

`AdminTokenService.signAccessToken(adminId, sessionId, role)` had the `role` and `sessionId` arguments in the wrong order relative to the service call `signAccessToken(admin.id, admin.role, session.id)`. Corrected to `signAccessToken(adminId, role, sessionId)`.

### JWT — `verifyMfaToken` / `verifyAccessToken` use strict options

Previously these utils called `verify(token, secret)` without strict options. Now both pass `{ algorithms: ['HS256'], issuer: 'marbou', audience: <expected> }` so alg:none, wrong issuer, and cross-audience tokens are rejected.

### OPEN QUESTION — Lockout progression thresholds

**Still outstanding for owner:** PRD Appendix C states lockout delays as "1/5/15/60" minutes but does not specify the exact failure-count thresholds. Current implementation: 5 failures → 1 min, 6 → 5 min, 7 → 15 min, 8+ → 60 min. Alternative: start locking after fewer failures. Owner must confirm the intended progression.

### OPEN QUESTION — Session cache TTL

Current value: 30 seconds. This means a revoked session can still pass guard checks for up to 30 seconds. The requirement says "≤ 30 s" — this is at the upper bound. Owner may wish to lower it (e.g. 10 s) to tighten the revocation window at the cost of slightly higher Redis traffic from admin requests.
