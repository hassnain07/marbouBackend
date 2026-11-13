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
| `ADMIN_JWT_SECRET` | Admin JWT signing (≥ 16 chars) |
| `ADMIN_TOTP_ENC_KEY` | AES key for TOTP secret encryption (≥ 32 chars) |
| `INTEGRATIONS_MODE` | `mock` (dev/test) or `live` (production) |

---

## Migrations

Migrations live in `prisma/migrations/`. Hand-written SQL migrations (PostGIS extensions, GIN indexes, partitioning, expression indexes) follow the same naming convention and are kept in the same history. See `docs/schema-decisions.md` for the Phase 0 schema fixes.

---

## Architecture

See `devDocs/MARBOU_API_ARCHITECTURE.md` for the full module catalogue, security checklist, BullMQ queue definitions, feature flag keys and integration adapter matrix.
