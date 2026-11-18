# MARBOU Backend API

Multi-vertical marketplace platform backend — NestJS · Prisma · PostgreSQL (PostGIS) · Redis · BullMQ · Socket.io.

> **Source of truth:** `devDocs/MARBOU_PRD_V3.md`. Build order and Postman tests: `devDocs/MARBOU_API_IMPLEMENTATION_PHASES.md`.

---

## Quick start (clean clone)

```bash
# 1. Clone and install
git clone <repo-url> marbouBackend
cd marbouBackend
npm ci

# 2. Configure
cp .env.example .env
# Edit .env — set JWT secrets, ADMIN_TOTP_ENC_KEY (≥ 32 chars), and any real API keys.

# 3. Start services (PostgreSQL/PostGIS, Redis, MinIO, Mailhog)
docker compose -f docker/docker-compose.yml up -d

# 3b. (Alternative) Start ONLY the infrastructure (no api container) and run
#     the API on the host with `npm run dev` — useful when iterating on code:
#     docker compose -f docker/docker-compose.yml up -d postgres redis minio minio-init mailhog

# 4. Apply migrations + seed
npx prisma migrate deploy
npm run prisma:seed

# 4b. Re-seeding is safe and idempotent: it never overwrites admin-changed flag
#     `enabled`/`config` or admin-changed defaults.

# 5. Start the development server (watch mode)
npm run dev
```

The API is now running at **http://localhost:3000**.

> **Postgres host port is `5433`** (mapped to the container's 5432) so it does not
> clash with a locally-installed PostgreSQL that binds 5432. The `api` container
> connects to Postgres on the internal port 5432 via the `postgres` hostname, so
> the host-side remap only affects host tooling (`prisma migrate`, `npm run dev`).

---

## URLs

| Resource | URL |
|---|---|
| REST API | http://localhost:3000/api/v1/ |
| OpenAPI / Swagger | http://localhost:3000/api/docs |
| Health (liveness) | http://localhost:3000/health |
| Readiness (DB + Redis + storage) | http://localhost:3000/health/ready |
| Mailhog web UI | http://localhost:8025 |
| MinIO console | http://localhost:9001 (user: `marbou`, pass: `marbou-secret`) |

---

## npm scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start in watch/reload mode |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm run start:prod` | Run the compiled binary |
| `npm run lint` | ESLint check (no auto-fix) |
| `npm run lint:fix` | ESLint with auto-fix |
| `npm run typecheck` | Type-check only (no emit) |
| `npm test` | Jest unit tests |
| `npm run test:cov` | Unit tests with coverage |
| `npm run test:e2e` | Supertest e2e suite |
| `npm run prisma:validate` | Validate `prisma/schema.prisma` |
| `npm run prisma:migrate` | Create + apply a dev migration |
| `npm run prisma:deploy` | Apply pending migrations (CI/prod) |
| `npm run prisma:generate` | Regenerate Prisma client |
| `npm run prisma:seed` | Run the seed script |
| `npm run prisma:studio` | Open Prisma Studio |
| `npm run format` | Prettier auto-format |

---

## Project layout

```
marbouBackend/
├── docker/
│   ├── Dockerfile            # Multi-stage Node 22 Alpine image
│   └── docker-compose.yml    # api + postgres + redis + minio + mailhog
├── docs/
│   └── schema-decisions.md   # Prisma schema fix log (Phase 0)
├── postman/
│   ├── MARBOU.postman_collection.json
│   ├── env.local.postman_environment.json
│   ├── env.staging.postman_environment.json
│   └── README.md
├── prisma/
│   ├── schema.prisma         # Data model (PRD §9.2)
│   ├── migrations/           # Prisma + hand-written SQL migrations
│   └── seed/index.ts         # Idempotent seed runner
├── src/
│   ├── app.module.ts         # Root module
│   ├── bootstrap.ts          # Shared app wiring (used by main.ts + e2e)
│   ├── main.ts               # Production entry point
│   ├── config/               # Env schema (Zod) + constants
│   ├── common/               # Cross-cutting: guards, filters, pipes,
│   │                         #   decorators, middleware, i18n, envelope
│   ├── prisma/               # PrismaService + raw SQL helpers
│   ├── redis/                # RedisService (cache-aside + rate counters)
│   ├── queues/               # BullMQ bootstrap + JobRunService
│   ├── integrations/         # Adapter interfaces + mock/live impls
│   ├── shared/core-bridge/   # Re-exports from @ahmed-org/marketplace-core
│   └── modules/
│       └── platform/         # Health · Dev helpers
│           ├── health/
│           └── dev/          # /dev/* routes (non-production only)
└── test/
    ├── setup-env.ts          # Safe env defaults for e2e
    └── app.e2e-spec.ts       # Phase 0 Postman-equivalent smoke tests
```

---

## URL prefix convention

**API controllers carry the `/api/v1/` prefix themselves** in their `@Controller()` decorator (e.g. `@Controller('api/v1/users')`). We do **not** use `setGlobalPrefix` because Nest mounts the not-found handler only under the prefix, which would cause unmatched root paths to bypass the global `AllExceptionsFilter` and return a plain Express "Cannot GET ..." instead of the structured error envelope. Health and dev routes live at the root.

---

## Environment variables

See `.env.example` for the full list. Key required variables:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection (supports `redis://`, `rediss://`, auth, DB) |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | User JWT signing (≥ 16 chars) |
| `ADMIN_JWT_SECRET` | Admin JWT signing (**≥ 32 chars**; must not contain "change-me" in staging/production) |
| `ADMIN_JWT_ACCESS_TTL` / `ADMIN_JWT_REFRESH_TTL` | Admin token lifetimes (default 15m / 30d) |
| `ADMIN_TOTP_ENC_KEY` | AES-256-GCM key for TOTP secret encryption (**≥ 32 chars**; must not contain "change-me" in staging/production) |
| `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` | First Super Admin credentials (seeded by `prisma:seed`; must enroll TOTP at first login; `ADMIN_SEED_PASSWORD` must differ from default in staging/production) |
| `TRUSTED_PROXY_HOPS` | Integer (default `0`). Set to `1` when behind one trusted proxy (nginx, cloud LB). With `0`, `x-forwarded-for` is ignored and `req.ip` is used directly — prevents IP spoofing. With `N > 0`, takes the Nth IP from the right of `x-forwarded-for`. |
| `INTEGRATIONS_MODE` | `mock` (dev/test only) or `live` (staging/production — `mock` is **rejected** in staging and production) |
| `RATE_LIMIT_AUTH_PER_MINUTE` | Per-IP rate limit on admin auth endpoints (login, 2fa/setup, 2fa/verify, refresh). **Production default: 10.** Set to `200` in `.env.example` for local dev so Newman collection runs pass without flushing Redis between runs. |
| `RATE_LIMIT_DEFAULT_PER_MINUTE` | Per-IP rate limit on all other endpoints (default: 60). |

**Staging / production rules (enforced at boot):**
- `ADMIN_JWT_SECRET` must not contain `"change-me"`.
- `ADMIN_TOTP_ENC_KEY` must not contain `"change-me"`.
- `ADMIN_SEED_PASSWORD` must not be the default `ChangeMe!2026#`.
- `INTEGRATIONS_MODE` must be `live`.
- `DEV_EXPOSE_OTP` must be `false`.
- Dev seeds (`sa@dev.marbou.test` etc.) are **never created** in staging or production.
- `/dev/*` routes return **403 Forbidden** in staging and production.

---

## Admin Authentication (Phase 2)

All `/api/v1/admin/*` routes (except login and 2FA endpoints) require a valid admin JWT Bearer token with audience `marbou-admin`. Admin auth flow:

1. **POST /api/v1/admin/auth/login** `{email, password}` → Returns MFA-stage token + `mfaStage` ("SETUP_REQUIRED" or "VERIFY")
2. **If not enrolled:** POST /api/v1/admin/auth/2fa/setup (MFA-stage token) → Returns TOTP secret + QR code URI
3. **POST /api/v1/admin/auth/2fa/verify** `{code, mfaToken}` → Returns `{accessToken, refreshToken}` (usable admin JWT)
4. **Use accessToken** as `Authorization: Bearer <token>` for admin routes
5. **POST /api/v1/admin/auth/refresh** `{refreshToken}` when access token expires → New access + refresh tokens
6. **POST /api/v1/admin/auth/logout** to revoke the session

**Security features:**
- Argon2id password hashing
- Mandatory TOTP 2FA (RFC 6238, 30s step, ±1 window, replay protection)
- TOTP secrets encrypted at rest (AES-256-GCM)
- Refresh token rotation with reuse detection (revokes entire session family on reuse)
- Progressive account lockout (5 failed attempts → 1/5/15/60 min delays)
- IP allow-list per admin (optional, Super Admin configurable)
- Session revocation takes effect immediately (Redis-cached validation)
- All login attempts logged (AdminLoginLog) + major events audited

**Dev admin accounts (seeded in dev/test only, never in production):**
| Email | Role | TOTP |
|---|---|---|
| `sa@dev.marbou.test` | SUPER_ADMIN | Pre-enrolled (known secret) |
| `mod@dev.marbou.test` | CONTENT_MODERATOR | Pre-enrolled |
| `sup@dev.marbou.test` | SUPPORT_AGENT | Pre-enrolled |
| `fin@dev.marbou.test` | FINANCIAL_AUDITOR | Pre-enrolled |
| `lock@dev.marbou.test` | SUPPORT_AGENT | Pre-enrolled (lockout tests) |

Password: `ChangeMe!2026#` (from `ADMIN_SEED_PASSWORD`)

Postman uses `/dev/admin/totp?email=<email>` to fetch current TOTP codes automatically in the P02 login folder.

---

## RBAC (Role-Based Access Control)

Four admin roles with table-driven permissions (architecture §5.8):

| Role | Permissions |
|---|---|
| **SUPER_ADMIN** | All permissions (config, flags, defaults, audit, admin management, analytics) |
| **CONTENT_MODERATOR** | Moderation only (hide/delete listings, suspend users, reports, appeals) |
| **SUPPORT_AGENT** | Support queues (tickets, CV queue, verification queue, user search) |
| **FINANCIAL_AUDITOR** | Payments console, audit logs (read-only), refunds |

Permission enforcement:
- `@AdminPermission('permission.key')` decorator on routes
- `AdminJwtGuard` validates JWT + checks session validity + enforces RBAC
- Missing/invalid token → 401; valid token but wrong role → 403

---

## Phase 1 & 2 Endpoints

| Method | Path | Permission | Purpose |
|---|---|---|---|
| **Public** ||||
| GET | `/api/v1/config` | — | Client config (ETag + 304) |
| GET | `/api/v1/flags` | — | Public flags |
| GET | `/health`, `/health/ready` | — | Health checks |
| **Admin Auth** ||||
| POST | `/api/v1/admin/auth/login` | — | Email + password → MFA-stage token |
| POST | `/api/v1/admin/auth/2fa/setup` | MFA-stage | Generate TOTP secret (if not enrolled) |
| POST | `/api/v1/admin/auth/2fa/verify` | MFA-stage | Verify TOTP → access + refresh tokens |
| POST | `/api/v1/admin/auth/refresh` | — | Rotate refresh token |
| POST | `/api/v1/admin/auth/logout` | Any admin | Revoke current session |
| GET | `/api/v1/admin/auth/me` | Any admin | Current admin info |
| **Platform Config** ||||
| GET | `/api/v1/admin/flags` | `config.flags.read` | All flags (SA) |
| PATCH | `/api/v1/admin/flags/:key` | `config.flags.write` | Toggle flag (SA) |
| GET | `/api/v1/admin/flags/:key/history` | `config.flags.read` | Flag history (SA) |
| GET | `/api/v1/admin/media-limits` | `config.media-limits.read` | Media limits (SA) |
| PATCH | `/api/v1/admin/media-limits` | `config.media-limits.write` | Update limits (SA) |
| PATCH | `/api/v1/admin/app-versions` | `config.app-versions.write` | Min app versions (SA) |
| PATCH | `/api/v1/admin/maintenance` | `config.maintenance.write` | Maintenance mode (SA) |
| GET | `/api/v1/admin/defaults` | `config.defaults.read` | Appendix C defaults (SA) |
| PATCH | `/api/v1/admin/defaults` | `config.defaults.write` | Update default (SA) |
| **Audit** ||||
| GET | `/api/v1/admin/audit-logs` | `audit.read` | Audit log (FIN, SA) |
| GET | `/api/v1/admin/audit-logs/verify-chain` | `audit.read` | Verify hash chain (FIN, SA) |
| **Admin Management** ||||
| GET | `/api/v1/admin/admin-users` | `admin.users.manage` | List admins (SA) |
| POST | `/api/v1/admin/admin-users` | `admin.users.manage` | Create admin (SA) |
| GET | `/api/v1/admin/admin-users/:id` | `admin.users.manage` | Get admin by ID (SA; 404 if unknown) |
| PATCH | `/api/v1/admin/admin-users/:id` | `admin.users.manage` | Update admin (SA, last-SA guard) |
| GET | `/api/v1/admin/admin-sessions` | `admin.sessions.manage` | List sessions (SA) |
| DELETE | `/api/v1/admin/admin-sessions/:id` | `admin.sessions.manage` | Revoke session (SA) |
| GET | `/api/v1/admin/admin-login-logs` | `admin.login-logs.read` | Login logs (SA) |
| **Dev Only** ||||
| GET | `/dev/flag-test` | — | FlagGuard test route |
| GET | `/dev/admin/totp` | — | Current TOTP code for dev admin |
| POST | `/dev/admin/unlock` | — | Clear lockout for dev admin |

---

## Migrations

Migrations live in `prisma/migrations/`. Hand-written SQL migrations (PostGIS extensions, GIN indexes, partitioning, expression indexes) follow the same naming convention and are kept in the same history. See `docs/schema-decisions.md` for the Phase 0 schema fixes.

---

## Helper scripts (`scripts/`)

| Script | Purpose |
|---|---|
| `docker-up-infra.ps1` | Start Postgres + Redis containers |
| `docker-up-all-infra.ps1` | Start Postgres + Redis + MinIO + Mailhog |
| `docker-ps.ps1` | List running MARBOU containers |
| `docker-psql.ps1` | Open a psql session in the Postgres container |
| `flush-redis.ps1` | Flush the Redis cache (use after manual DB edits to refresh cached flags/config/defaults) |
| `start-dev.ps1` | Start the compiled API on port 3099 (for Newman testing) |

These are Windows PowerShell helpers (Docker Desktop is not on the default PATH on this machine; the scripts use the full Docker path).

---

## Architecture

See `devDocs/MARBOU_API_ARCHITECTURE.md` for the full module catalogue, security checklist, BullMQ queue definitions, feature flag keys and integration adapter matrix.
