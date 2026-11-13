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
