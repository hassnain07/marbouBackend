# MARBOU Postman Collection

## Setup

1. Import `MARBOU.postman_collection.json` into Postman.
2. Import `env.local.postman_environment.json` and select it as the active environment.
3. Run the **P00 Foundation** folder to verify Phase 0.

## Environments

| File | Purpose |
|---|---|
| `env.local.postman_environment.json` | Local `docker compose up` stack |
| `env.staging.postman_environment.json` | Staging server |

## Environment variables

| Variable | Description | Local default |
|---|---|---|
| `baseUrl` | API base URL | `http://localhost:3000` |
| `lang` | Accept-Language header | `en` |
| `deviceId` | x-device-id header | `postman-dev-001` |
| `userA_token` | Registered user A JWT | (set by auth requests) |
| `adminSa_token` | Super Admin JWT | (set by admin login) |

## Folder structure

```
MARBOU.postman_collection.json
├── P00 Foundation
│   ├── Health
│   ├── Swagger
│   ├── 404 localization
│   ├── Validation (422)
│   ├── Rate limiting (6 requests)
│   └── BullMQ echo job
├── P01 Platform
│   ├── Config (GET /config + 304)
│   ├── Flags (list, patch+revert, history, last-OTP-channel 422, bootstrap-key 401)
│   ├── Dev flag-test (FlagGuard: OFF→404, ON→200, OFF→404)
│   ├── Media limits (get, patch+revert)
│   ├── App versions (patch+revert)
│   ├── Maintenance (on, banner EN+AR, off)
│   ├── Defaults (list, patch+revert, audit entry check, invalid type 422)
│   └── Audit logs (list+filter, verify-chain valid)
└── ZZ Smoke      (happy-path regression run across all phases)
```

## P01 admin authentication

All `/api/v1/admin/*` requests require the header `x-admin-bootstrap-key: {{adminBootstrapKey}}` (temporary dev admin auth, replaced by TOTP admin auth in Phase 2). Set `adminBootstrapKey` in your environment to match `ADMIN_BOOTSTRAP_KEY` in your `.env`.

## P01 run steps

1. Start the infra: `docker compose -f docker/docker-compose.yml up -d postgres redis`
2. Start the API: `npm run dev`
3. Run the **P01 Platform** folder in the Collection Runner (top-to-bottom).

Or via Newman:
```bash
npx newman run postman/MARBOU.postman_collection.json -e postman/env.local.postman_environment.json --folder "P01 Platform"
```

## Collection-level conventions

- **Pre-request script** (collection level): adds `Accept-Language: {{lang}}` and `x-device-id: {{deviceId}}` to every request.
- **Test script** (collection level): asserts the response envelope (`success`, `data|error`, `meta.requestId`).
- **Request naming**: `[P00][ENDPOINT] Description` — e.g. `[P00][GET /health] Liveness`.
