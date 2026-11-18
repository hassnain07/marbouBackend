# MARBOU Postman Collection

## Setup

1. Import `MARBOU.postman_collection.json` into Postman.
2. Import `env.local.postman_environment.json` and select it as the active environment.
3. **Run P02 → 00 Login all roles first** to populate admin tokens, then run other folders.

## Environments

| File | Purpose |
|---|---|
| `env.local.postman_environment.json` | Local `docker compose up` stack with dev admin accounts |
| `env.staging.postman_environment.json` | Staging server — no dev accounts; set email/password manually |

## Environment variables

All env variable names are identical between both env files.

| Variable | Description | Local default |
|---|---|---|
| `baseUrl` | API base URL | `http://localhost:3000` |
| `lang` | Accept-Language header | `en` |
| `deviceId` | x-device-id header | `postman-dev-001` |
| `adminSa_email` | Super Admin email | `sa@dev.marbou.test` |
| `adminMod_email` | Moderator email | `mod@dev.marbou.test` |
| `adminSup_email` | Support Agent email | `sup@dev.marbou.test` |
| `adminFin_email` | Financial Auditor email | `fin@dev.marbou.test` |
| `adminPassword` | Shared dev account password | `ChangeMe!2026#` |
| `adminSa_token` | Super Admin access JWT | *(set by P02 00 Login)* |
| `adminSa_refreshToken` | Super Admin refresh token | *(set by P02 00 Login)* |
| `adminMod_token` | Moderator access JWT | *(set by P02 00 Login)* |
| `adminMod_refreshToken` | Moderator refresh token | *(set by P02 00 Login)* |
| `adminSup_token` | Support Agent access JWT | *(set by P02 00 Login)* |
| `adminSup_refreshToken` | Support Agent refresh token | *(set by P02 00 Login)* |
| `adminFin_token` | Financial Auditor access JWT | *(set by P02 00 Login)* |
| `adminFin_refreshToken` | Financial Auditor refresh token | *(set by P02 00 Login)* |
| `userA_token` | Customer user JWT | *(set by Phase 3+ auth)* |

## Folder structure

```
MARBOU.postman_collection.json
├── P00 Foundation
│   ├── Health, Swagger, 404 localization
│   ├── Validation (422)
│   ├── Rate limiting
│   └── BullMQ echo job
├── P02 Admin Auth & RBAC
│   ├── 00 Login all roles   ← RUN THIS FIRST
│   ├── 01 Negative auth     (wrong pw, unknown email, bad TOTP, MFA-stage isolation)
│   ├── 02 Refresh           (rotation, reuse kills family)
│   ├── 03 Session revoke    (DELETE /admin-sessions/:id → 401 immediately)
│   ├── 04 RBAC matrix       (200/403 for each role on each route)
│   ├── 05 Admin management  (create, GET :id, deactivate, duplicate-409)
│   ├── 06 Lockout           (5 wrong passwords → 423, /dev unlock, login again)
│   └── 07 Login logs + SA logout (audit outcomes; never touches main SA session)
├── P01 Platform (requires admin tokens from P02 00)
│   ├── Public: Config, Flags
│   ├── Admin: Flags, Media limits, App versions, Maintenance, Defaults
│   └── Audit logs (list, filter, verify-chain)
└── ZZ Smoke (happy-path regression across all phases)
```

## API contract (Phase 2)

```
POST /api/v1/admin/auth/login
  Body:    { "email": "...", "password": "..." }
  Returns: { "data": { "mfaToken": "...", "mfaStage": "VERIFY|SETUP_REQUIRED" } }

POST /api/v1/admin/auth/2fa/setup
  Body:    { "mfaToken": "..." }          ← no Bearer header
  Returns: { "data": { "secret": "...", "otpauthUri": "..." } }

POST /api/v1/admin/auth/2fa/verify
  Body:    { "mfaToken": "...", "code": "123456" }   ← no Bearer header
  Returns: { "data": { "accessToken": "...", "refreshToken": "...", "admin": { "id":"...", "role":"..." } } }

POST /api/v1/admin/auth/refresh
  Body:    { "refreshToken": "..." }
  Returns: { "data": { "accessToken": "...", "refreshToken": "..." } }

GET  /dev/admin/totp?email=sa@dev.marbou.test
  Returns: { "data": { "code": "123456", "email": "..." } }
```

## Run order

1. **P00 Foundation** — no auth required
2. **P02 → 00 Login all roles** — populates all 8 token/refreshToken vars
3. **P01 Platform** — uses `{{adminSa_token}}`
4. **P02 folders 01–07** — use the tokens from step 2

## Running via Newman

```bash
# Full collection (run twice for idempotency)
npx newman run postman/MARBOU.postman_collection.json \
  -e postman/env.local.postman_environment.json

# P00 + P02 only
npx newman run postman/MARBOU.postman_collection.json \
  -e postman/env.local.postman_environment.json \
  --folder "P00 Foundation" --folder "P02 Admin Auth & RBAC"
```

## Dev admin accounts (dev/test only — never in production or staging)

| Email | Role | Token var |
|---|---|---|
| `sa@dev.marbou.test` | SUPER_ADMIN | `{{adminSa_token}}` / `{{adminSa_refreshToken}}` |
| `mod@dev.marbou.test` | CONTENT_MODERATOR | `{{adminMod_token}}` / `{{adminMod_refreshToken}}` |
| `sup@dev.marbou.test` | SUPPORT_AGENT | `{{adminSup_token}}` / `{{adminSup_refreshToken}}` |
| `fin@dev.marbou.test` | FINANCIAL_AUDITOR | `{{adminFin_token}}` / `{{adminFin_refreshToken}}` |
| `lock@dev.marbou.test` | SUPPORT_AGENT | lockout tests only |

Password for all: `ChangeMe!2026#` (from `ADMIN_SEED_PASSWORD`).

The P02 login folder uses `GET /dev/admin/totp?email=...` to fetch the current TOTP code automatically.

**Note:** `adminSa_token` is the **long-lived main SA session** used throughout the collection.
Never call `POST /admin/auth/logout` on it except as the very last request (folder 07 uses a throwaway session for the logout test).
