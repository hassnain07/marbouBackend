# MARBOU Postman Collection

## Setup

1. Import `MARBOU.postman_collection.json` into Postman.
2. Import `env.local.postman_environment.json` and select it as the active environment.
3. **Run P02 Login first** to populate admin tokens, then run other folders.

## Environments

| File | Purpose |
|---|---|
| `env.local.postman_environment.json` | Local `docker compose up` stack with dev admin accounts |
| `env.staging.postman_environment.json` | Staging server (set `adminSa_email` and `adminPassword` manually) |

## Environment variables

| Variable | Description | Local default |
|---|---|---|
| `baseUrl` | API base URL | `http://localhost:3000` |
| `lang` | Accept-Language header | `en` |
| `deviceId` | x-device-id header | `postman-dev-001` |
| `adminSa_email` | Super Admin email | `sa@dev.marbou.test` |
| `adminMod_email` | Moderator email | `mod@dev.marbou.test` |
| `adminSup_email` | Support Agent email | `sup@dev.marbou.test` |
| `adminFin_email` | Financial Auditor email | `fin@dev.marbou.test` |
| `adminPassword` | Admin password (dev accounts) | `ChangeMe!2026#` |
| `adminSa_token` | Super Admin JWT | (set by P02 login) |
| `adminMod_token` | Moderator JWT | (set by P02 login) |
| `adminSup_token` | Support Agent JWT | (set by P02 login) |
| `adminFin_token` | Financial Auditor JWT | (set by P02 login) |
| `adminSa_refresh` | SA refresh token | (set by P02 login) |
| `userA_token` | Customer user JWT | (set by Phase 3+ auth) |

## Folder structure

```
MARBOU.postman_collection.json
├── P00 Foundation
│   ├── Health, Swagger, 404 localization
│   ├── Validation (422)
│   ├── Rate limiting
│   └── BullMQ echo job
├── P02 Admin Auth & RBAC
│   ├── 00 Login all roles (run this FIRST to populate tokens)
│   ├── Login flow (wrong password, 2FA, MFA-stage isolation)
│   ├── Refresh & logout
│   ├── Account lockout (using locktest@ admin)
│   ├── Super Admin management (create, deactivate, last-SA guard)
│   └── RBAC matrix (403 tests for MOD/SUP/FIN on SA-only routes)
├── P01 Platform (requires admin tokens from P02)
│   ├── Public: Config, Flags
│   ├── Admin: Flags, Media limits, App versions, Maintenance, Defaults
│   └── Audit logs (list, filter, verify-chain)
└── ZZ Smoke (happy-path regression across all phases)
```

## Run order

**Important:** Admin routes require JWT tokens. Run folders in this order:

1. **P00 Foundation** — no auth required
2. **P02 Admin Auth & RBAC → 00 Login all roles** — populates `adminSa_token`, `adminMod_token`, etc.
3. **P01 Platform** — now uses `{{adminSa_token}}` Bearer tokens
4. Other phase folders as implemented

## Running manually

1. Start infra: `docker compose -f docker/docker-compose.yml up -d postgres redis`
2. Migrate + seed: `npx prisma migrate deploy && npm run prisma:seed`
3. Start API: `npm run dev`
4. In Postman Collection Runner: **P02 → 00 Login**, then **P01 Platform**

## Running via Newman

```bash
# Full collection
npx newman run postman/MARBOU.postman_collection.json \
  -e postman/env.local.postman_environment.json

# Specific folder (after login)
npx newman run postman/MARBOU.postman_collection.json \
  -e postman/env.local.postman_environment.json \
  --folder "P01 Platform"
```

## Collection-level conventions

- **Pre-request script** (collection level): adds `Accept-Language: {{lang}}` and `x-device-id: {{deviceId}}` to every request.
- **Test script** (collection level): asserts the response envelope (`success`, `data|error`, `meta.requestId`).
- **Request naming**: `[PXX][ENDPOINT] Description` — e.g. `[P02][POST /admin/auth/login] Wrong password`.
- **Admin auth**: All `/api/v1/admin/*` requests (except `/admin/auth/login` and `/admin/auth/2fa/*`) require `Authorization: Bearer {{adminXX_token}}`.

## Dev admin accounts (local only)

The seed creates these dev-only accounts with known TOTP secrets (never in production):

| Email | Role | Token var |
|---|---|---|
| `sa@dev.marbou.test` | SUPER_ADMIN | `{{adminSa_token}}` |
| `mod@dev.marbou.test` | CONTENT_MODERATOR | `{{adminMod_token}}` |
| `sup@dev.marbou.test` | SUPPORT_AGENT | `{{adminSup_token}}` |
| `fin@dev.marbou.test` | FINANCIAL_AUDITOR | `{{adminFin_token}}` |
| `lock@dev.marbou.test` | SUPPORT_AGENT | (lockout tests only) |

The P02 login folder uses `/dev/admin/totp` to fetch the current TOTP code automatically.
