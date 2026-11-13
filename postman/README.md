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
│   ├── Rate limiting
│   └── BullMQ echo job
├── P01 Platform  (Phase 1+)
└── ZZ Smoke      (happy-path regression run across all phases)
```

## Collection-level conventions

- **Pre-request script** (collection level): adds `Accept-Language: {{lang}}` and `x-device-id: {{deviceId}}` to every request.
- **Test script** (collection level): asserts the response envelope (`success`, `data|error`, `meta.requestId`).
- **Request naming**: `[P00][ENDPOINT] Description` — e.g. `[P00][GET /health] Liveness`.
