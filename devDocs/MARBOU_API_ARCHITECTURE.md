# MARBOU API — Architecture & Directory Structure

> **Audience:** the coding agent that builds the MARBOU backend API.
> **Source of truth:** `MARBOU_PRD_V3.md` (MARBOU-PRD-2026-V3). Where this file and the PRD differ, **the PRD wins**; where the PRD and the Agreement (MARBOU-AGR-2026-FINAL-M176) differ, the Agreement wins.
> **Companion file:** `MARBOU_API_IMPLEMENTATION_PHASES.md` (build order and Postman test plan).
> **Scope of this effort:** backend API only. Frontends are already designed but are **not** being integrated yet. Everything is verified through **Postman**. No endpoint may depend on a UI to be testable.

Requirement IDs in brackets (e.g. `[AUTH-05]`) refer to PRD V3. Always read the referenced requirement before implementing.

---

## 1. Non-Negotiable Rules (from the PRD)

1. **Instant publication.** Listings publish as `ACTIVE` on submit. Moderation is post-publication. Auto-hide (`AUTO_HIDDEN`) and the optional delayed-visibility mode (TRS-15, **OFF by default in every category**) are the only exceptions. [LST-03, TRS-14, TRS-15]
2. **Everything configurable is data, not code.** Categories, attributes, OTP channels, media limits, feature flags, thresholds (Appendix C), exchange rates, translations: all editable at runtime via admin endpoints with audit-logged before/after values. Flag propagation ≤ 60 s. [SYS-01, ADM-23, AUTH-15]
3. **Dormant engines are built, not stubbed.** Monetization, auctions, barter, wholesale, orders/cart, delivery, hotel reservations, asset rental, AdMob config: real tables, endpoints, admin controllers and tests to the **Appendix B bar**, hidden by flag. Beyond Appendix B = Change Request. [M18]
4. **Admin is a separate identity.** `AdminUser` ≠ `User`. Four roles only: `SUPER_ADMIN`, `CONTENT_MODERATOR`, `SUPPORT_AGENT`, `FINANCIAL_AUDITOR`. Mandatory TOTP 2FA. Only Super Admin manages admins/roles. Finance Auditor has read-only audit access. [ADM-17, AUTH-20, §5]
5. **Customers hold capabilities, not exclusive roles.** `UserCapability` rows (SELLER, DEALER, EMPLOYER, SERVICE_PROVIDER, CANDIDATE); permissions are the union. [PROF-01]
6. **Audit log is append-only, hash-chained, pseudonymous.** No personal data in `before`/`after` payloads so erasure never edits the chain. [TRS-12, SYS-10]
7. **Private documents never get public URLs.** CVs, certificates, verification files, receipts live in private buckets, served via signed URLs ≤ 5 min. [MED-10, JOB-13/14]
8. **Phone numbers are never in public payloads.** Contact reveal goes through a server-mediated endpoint with caps. [DET-13]
9. **Idempotency on retry-prone writes:** messages, media chunks, notifications, payment submissions. [NFR-REL-03, MSG-14]
10. **Arabic + English everywhere.** Every user-facing label has `En`/`Ar`; errors are localized by `Accept-Language`. [§10.1, LOC-*]
11. **No fake data / UI-only mocks / incomplete code** at acceptance. Dev mocks are allowed only behind adapters and only in `development`/`test`. [NFR-QA-04]
12. **Database:** Prisma + hand-written SQL migrations in the same history for PostGIS, pg_trgm, GIN, partitioning and expression indexes. `Unsupported()` columns are written via raw SQL only. [§3.2]

---

## 2. Technology Stack

| Concern | Choice |
|---|---|
| Runtime / framework | Node.js (LTS) + **NestJS** (TypeScript, strict) |
| ORM | **Prisma** (+ raw SQL for PostGIS/trgm/GIN/partitions) |
| DB | PostgreSQL with `postgis`, `pg_trgm`; DBs: `marbou_db` only (never touches `sayaratak_db`) |
| Cache / queues / pubsub | Redis; **BullMQ** for jobs; Redis adapter for Socket.io |
| Realtime | Socket.io (WebSocket + polling fallback) |
| Validation | **Zod** schemas (shared with core package) via a `ZodValidationPipe`; same rules the clients compile from schema JSON |
| Docs | OpenAPI/Swagger generated from decorators (`/api/docs`) |
| Auth | JWT access (≤15 min) + rotating refresh with reuse detection; Argon2id for passwords |
| Media | S3/R2 SDK (S3-compatible), `sharp` (WebP/AVIF), `ffmpeg` worker for video |
| Push / email | FCM adapter; email adapter (SMTP/provider-agnostic) |
| Shared package | `@ahmed-org/marketplace-core`: types, Zod schemas, response wrappers, currency formatters, event contracts, S3 adapter, Socket.io chat engine, FCM wrapper. **If the package is not yet installable, create thin local re-exports under `src/shared/core-bridge/` and import only from there, so swapping is a one-file change.** |
| Observability | Sentry, structured JSON logs (pino), health endpoints |
| Tests | Jest (unit), Supertest (e2e/API); coverage ≥ 70 % on core modules [NFR-QA-02] |
| Containers | Docker + docker-compose (api, postgres+postgis, redis, minio for local S3, mailhog for local email) |

---

## 3. High-Level Architecture

```
Postman / (later) Mobile, Web, Admin
            │  HTTPS  /api/v1   +  WebSocket /chat
┌───────────▼─────────────────────────────────────────────────────┐
│ API GATEWAY LAYER (NestJS global)                               │
│ helmet · CORS · compression · request-id · rate-limit (Redis)   │
│ i18n resolver · auth guards · RBAC guards · flag guards ·       │
│ Zod validation · response envelope · exception filter           │
├─────────────────────────────────────────────────────────────────┤
│ DOMAIN MODULES (modular monolith, one folder per module)        │
│ controller → service → repository(Prisma/raw SQL) → events      │
├───────────────┬──────────────────────┬──────────────────────────┤
│ REAL-TIME     │ ASYNC (BullMQ)       │ INTEGRATION ADAPTERS     │
│ Socket.io     │ scan, expiry, notify │ storage, push, email,    │
│ /chat, /admin │ media, video, export │ sms, whatsapp, maps,     │
│ Redis adapter │ retention, reports   │ classifier, payment,     │
│               │                      │ courier                  │
├───────────────┴──────────────────────┴──────────────────────────┤
│ DATA: PostgreSQL (+PostGIS, trgm, GIN) · Redis · S3/R2 buckets  │
│  public bucket (media)  ·  private bucket (documents, receipts) │
└─────────────────────────────────────────────────────────────────┘
```

**Module rules**
- Modules talk to each other through exported services or domain events (`EventEmitter2`), never by importing another module's repository.
- Every module owns its Prisma access through its own repository classes.
- Cross-cutting concerns live in `common/`, `config/`, `integrations/`, `queues/`, never inside a feature module.
- Provider swaps (SMS, classifier, tile, payment gateway, courier) happen only behind adapter interfaces. [SYS-06, PAY-09]

**Request lifecycle**
`request-id → rate-limit → auth (JWT) → status check (suspended/banned?) → RBAC/capability guard → flag guard → Zod validation → controller → service → repository → event(s) → envelope serializer`

---

## 4. Directory Structure

API lives at `apps/api` inside `marbou-app` (adjust the root only if the repo already fixes another location; internal layout stays the same).

```
apps/api/
├── prisma/
│   ├── schema.prisma                      # §9.2 spec (validate with `prisma validate`)
│   ├── migrations/
│   │   ├── 0001_init/                     # Prisma-generated
│   │   ├── 0002_extensions_postgis_trgm/  # raw SQL
│   │   ├── 0003_listing_location_geography_gist/
│   │   ├── 0004_listing_trgm_gin_indexes/
│   │   ├── 0005_listing_partitioning/     # range-partition by createdAt
│   │   ├── 0006_promoted_attr_indexes/    # created/retired by schema service at runtime too
│   │   └── …                              # one folder per later phase
│   └── seed/
│       ├── index.ts
│       ├── admin.seed.ts                  # first SUPER_ADMIN
│       ├── geography.seed.ts              # Sudan states/cities/neighborhoods (Ar+En)
│       ├── categories/                    # one file per vertical: automotive, real-estate,
│       │   ├── automotive.seed.ts         #   hotels, equipment-solar, livestock-agri, general,
│       │   ├── real-estate.seed.ts        #   jobs, services … (AUTO-*, RE-*, HOT-*, EQP-*, GEN-*)
│       │   └── …
│       ├── flags.seed.ts                  # every feature flag key (see §9)
│       ├── defaults.seed.ts               # Appendix C register
│       ├── translations.seed.ts
│       ├── legal.seed.ts / help.seed.ts
│       └── demo.seed.ts                   # DEV ONLY: users, listings for Postman
├── src/
│   ├── main.ts                            # bootstrap, swagger, global pipes/filters
│   ├── app.module.ts
│   ├── config/
│   │   ├── env.schema.ts                  # Zod-validated env
│   │   ├── configuration.ts
│   │   └── constants.ts
│   ├── common/
│   │   ├── decorators/                    # @Public @CurrentUser @CurrentAdmin @Roles @Capabilities
│   │   │                                  # @RequiresFlag @Idempotent @Audit @RateLimit
│   │   ├── guards/                        # JwtAuthGuard, AdminJwtGuard, CapabilityGuard,
│   │   │                                  # AdminRoleGuard, FlagGuard, AccountStatusGuard, Verified-Email guard
│   │   ├── interceptors/                  # ResponseEnvelope, Idempotency, Etag, AuditInterceptor, Timeout
│   │   ├── filters/                       # AllExceptionsFilter → structured error envelope
│   │   ├── pipes/                         # ZodValidationPipe, CursorPipe, ParseUuid
│   │   ├── middleware/                    # request-id, locale resolver, device-id
│   │   ├── errors/                        # AppError, error-codes per module (AUTH_*, LST_* …)
│   │   ├── dto/                           # PaginationQuery, CursorPage, IdParam
│   │   ├── utils/                         # arabic-normalize, slug, hash, phash-compare, geo, money, ids(MARBOU-NNNNN)
│   │   └── i18n/                          # message catalogs for API errors
│   ├── shared/
│   │   └── core-bridge/                   # re-exports from @ahmed-org/marketplace-core (or local shims)
│   ├── prisma/
│   │   ├── prisma.module.ts
│   │   ├── prisma.service.ts
│   │   └── raw/                           # typed raw-SQL helpers (PostGIS, trgm, promoted columns)
│   ├── redis/                             # redis.module, redis.service, cache helper (cache-aside), counters
│   ├── queues/
│   │   ├── queues.module.ts
│   │   ├── queue-names.ts
│   │   ├── processors/                    # one processor per queue (see §8)
│   │   ├── schedulers/                    # cron registrations (expiry, retention, rates, cleanup)
│   │   └── dead-letter/
│   ├── realtime/
│   │   ├── realtime.module.ts
│   │   ├── redis-io.adapter.ts
│   │   ├── chat.gateway.ts                # namespace /chat
│   │   └── admin.gateway.ts               # namespace /admin (live counters, live listing feed)
│   ├── integrations/                      # ADAPTERS — interface + real impl + dev/mock impl
│   │   ├── storage/      (storage.port.ts, s3.adapter.ts, local-minio.adapter.ts)
│   │   ├── email/        (email.port.ts, smtp.adapter.ts, mailhog.adapter.ts)
│   │   ├── sms/          (sms.port.ts, provider-a.adapter.ts, provider-b.adapter.ts, fallback chain, mock)
│   │   ├── whatsapp/     (whatsapp-otp.port.ts, business-api.adapter.ts, mock)
│   │   ├── push/         (push.port.ts, fcm.adapter.ts, mock)
│   │   ├── social/       (google.verifier.ts, facebook.verifier.ts, apple.verifier.ts)
│   │   ├── maps/         (maps.port.ts, google-places.adapter.ts + gateway cap logic, mock)
│   │   ├── classifier/   (classifier.port.ts, provider adapter, mock) # TRS-16
│   │   ├── phash-source/ (blacklist seed loader)                       # TRS-17
│   │   ├── payment/      (gateway.port.ts, bankak-manual.adapter.ts)
│   │   ├── courier/      (courier.port.ts, mock-courier.adapter.ts)    # MON-10
│   │   ├── cv-generator/ (cv-generator.port.ts, internal-pdf.adapter.ts) # JOB-12, ADM-07
│   │   └── monitoring/   (sentry)
│   └── modules/
│       ├── platform/                      # M26 + M24 foundation
│       │   ├── health/
│       │   ├── feature-flags/
│       │   ├── remote-config/             # min versions, maintenance, media limits
│       │   ├── defaults/                  # Appendix C register + ADM-23
│       │   ├── audit/                     # hash-chain writer + reader
│       │   └── retention/                 # SYS-15 purge engine (Appendix D)
│       ├── admin-auth/                    # AdminUser login, TOTP, sessions, IP log, allow-list
│       ├── admin-users/                   # Super Admin CRUD of admins/roles
│       ├── auth/                          # M01 (register, login, otp, refresh, social, sessions)
│       ├── users/                         # M02 (profile, capabilities, badges, blocks, verification)
│       ├── geography/                     # M20 (admin-editable Sudan geography)
│       ├── maps-gateway/                  # M20 (proxy, caps, usage monitor)
│       ├── localization/                  # M21 (translations, languages)
│       ├── currency/                      # M21 (exchange rates, staleness, convert)
│       ├── country-settings/              # LOC-06/07, CAT-15
│       ├── catalog/                       # M03 (categories, attributes, options, schema versions, other entries)
│       ├── media/                         # M19 (upload URLs, chunked video, signed URLs, phash, cleanup)
│       ├── listings/                      # M04 (+ wanted, edits, lifecycle, quality, duplicates)
│       ├── search/                        # M05 (search, suggest, compare, insights, home, nearby, synonyms)
│       ├── listing-details/               # M06 (detail payload, contact reveal, lead events)
│       ├── messaging/                     # M07 (threads, messages, offers, anti-spam, quick replies)
│       ├── notifications/                 # M16 (feed, prefs, device tokens, broadcasts, dispatcher)
│       ├── trust-safety/                  # M15 (reports, scan, fraud, auto-hide, appeals, blacklists, reviews)
│       ├── automotive/                    # M08 (rentals, service profiles, slots, appointments)
│       ├── real-estate/                   # M09 (projects, area conversion, agents)
│       ├── accommodation/                 # M11 (inquiries, availability, confirmed stay, reservation engine OFF)
│       ├── equipment/                     # M12 (mostly EAV config; installation flags)
│       ├── general-goods/                 # M13 (livestock/agri/general; wholesale engine OFF)
│       ├── jobs/                          # M10 (jobs, applications, candidate profile, CV requests)
│       ├── business/                      # M14 (profile, staff, dashboard, export)
│       ├── payments/                      # M17 (ledger, bankak, invoices, refunds)
│       ├── monetization/                  # M18 (subscriptions, promotions, credits, boosts,
│       │                                  #   auctions, barter, asset-rental, orders, delivery, admob)
│       ├── user-dashboard/                # M22 (favorites, saved searches, export, deletion, deactivation)
│       ├── content/                       # M23 (help, legal, static pages, banners, sitemap, deep-link files, SEO data)
│       ├── analytics/                     # M25 (event ingest, aggregates, reports, CSV)
│       └── admin/                         # M24 aggregation endpoints (KPIs, system health, version mgmt, maintenance)
├── test/
│   ├── e2e/                               # one spec per phase exit-criteria
│   ├── fixtures/
│   └── utils/
├── postman/
│   ├── MARBOU.postman_collection.json     # folder per phase/module, tests in each request
│   ├── env.local.postman_environment.json
│   ├── env.staging.postman_environment.json
│   └── README.md
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml                 # api, postgres(postgis), redis, minio, mailhog
├── .env.example
├── .github/workflows/ci.yml               # lint, typecheck, tests, migration check, dependency scan
└── README.md                              # clean-clone run guide (SYS-13)
```

### 4.1 Standard internal layout of a feature module

```
modules/<name>/
├── <name>.module.ts
├── controllers/
│   ├── <name>.controller.ts               # public/user routes
│   └── <name>-admin.controller.ts         # /admin routes (AdminRoleGuard)
├── services/
├── repositories/                          # only place that touches Prisma / raw SQL
├── dto/                                   # Zod schemas + inferred types (+ Swagger classes)
├── events/                                # domain event names + payload types
├── listeners/                             # @OnEvent handlers
├── jobs/                                  # BullMQ job payloads / producers for this module
├── mappers/                               # entity → response DTO (localized labels)
├── <name>.constants.ts
└── <name>.spec.ts / *.e2e-spec.ts
```

---

## 5. Cross-Cutting Conventions

### 5.1 URLs, versioning, docs
- Base: `/api/v1`. Swagger at `/api/docs`. Admin routes under `/api/v1/admin/**`. Realtime namespace `/chat` (and `/admin`).
- Resource names are plural kebab-case; actions that are not CRUD use a verb sub-route (`POST /listings/{id}/renew`).

### 5.2 Response envelope
```jsonc
// success
{ "success": true, "data": { … }, "meta": { "requestId": "…", "nextCursor": "…", "limit": 20 } }
// error
{ "success": false,
  "error": { "code": "AUTH_OTP_EXPIRED", "message": "<localized>", "details": [ { "field": "code", "issue": "…" } ], "traceId": "…" } }
```
- HTTP status carries the class (400/401/403/404/409/422/429/5xx); `error.code` is the stable machine code. Codes are namespaced per module (`AUTH_*`, `PROF_*`, `CAT_*`, `LST_*`, `SRCH_*`, `MSG_*`, `JOB_*`, `PAY_*`, `TRS_*`, …) and enumerated in `common/errors/`.

### 5.3 Pagination
Cursor-based for feeds, search, messages, notifications, admin lists: `?limit=20&cursor=<opaque>`. Totals only where cheap. [SRCH-15, §10.1]

### 5.4 Idempotency
`Idempotency-Key` header honoured on: `POST /media/*` chunks, message sends, notification creation, payment submission, listing submit. Stored in Redis (TTL 24 h) + DB unique constraints (e.g. `ChatMessage(senderId, idempotencyKey)`). [MSG-14, NFR-REL-03]

### 5.5 Caching & ETag
- `GET /categories/{id}/schema`, `GET /config`, `GET /flags`, public content: `ETag` + `Cache-Control`; return `304` when unchanged. [CAT-07, NFR-NET-04]
- Redis cache-aside for hot reads (schema, flags, home feed, category tree). Invalidate on admin writes.

### 5.6 Localization
`Accept-Language: ar|en` (fallback to user's stored language, then `ar`). Responses include both `labelEn`/`labelAr` for catalog data plus a resolved `label`. Error messages and notification text localized. [NFR-UX-04, NTF-09]

### 5.7 Auth & authorization
| Mechanism | Detail |
|---|---|
| User JWT | `sub=userId`, `sid=sessionId`, 15 min; refresh rotates; **reuse of a rotated refresh token revokes the entire `familyId`** [AUTH-06] |
| Admin JWT | Separate secret/audience; issued only after TOTP; carries `role`; admin sessions revocable by Super Admin [AUTH-20] |
| Account status guard | `SUSPENDED`/`PENDING_DELETION`/`DEACTIVATED` blocked with reason; suspension revokes all sessions immediately [AUTH-19] |
| Email-verified guard | Required to post, message, apply [AUTH-01, AUTH-22] |
| Capability guard | e.g. posting jobs requires `EMPLOYER`; storefront requires `DEALER` |
| Admin role guard | per-route allowed roles per §5 permission matrix |
| Flag guard | `@RequiresFlag('payments.bankak_user_flow')` → 404/`FEATURE_DISABLED` when OFF |
| Rate limiting | Redis counters per IP, per account, per device (`x-device-id`) [AUTH-17, NFR-SEC-05] |

### 5.8 Admin RBAC matrix (implement as a table-driven permission map)
| Capability | MOD | SUP | FIN | SA |
|---|---|---|---|---|
| Hide/suspend/edit/delete listings; suspend/ban users; reports; appeals | ✔ | | | ✔ |
| Support tickets, CV queue, verification queue (staff scope) | | ✔ | | ✔ |
| Bankak approve/reject; payment console | | | ✔ | ✔ |
| Audit logs (read-only) | | | ✔ | ✔ |
| Categories/EAV, flags, media limits, OTP channels, defaults, admin roles & sessions | | | | ✔ |

> A Moderator **must not** reach finance, flags or EAV builder; a Finance Auditor **must not** alter audit logs or admin roles. These are explicit acceptance tests. [M24 acceptance]

### 5.9 Audit
`@Audit({action, entity})` + explicit `AuditService.record()` for: moderation, verification, financial, configuration, flag changes, admin auth events, default changes (before/after). Hash chain: `hash = SHA256(prevHash + canonicalJSON(entry))`. Provide `GET /admin/audit-logs/verify-chain`. Payloads contain IDs only. [TRS-12, SYS-10, ADM-19]

### 5.10 Soft delete & IDs
UUID primary keys. `Listing.publicSeq` rendered `MARBOU-00001` (zero-pad 5, widen automatically). Soft delete via `deletedAt` on User/Listing/etc. Every filter/join column indexed.

### 5.11 Money & currency
`Decimal(14,2)` + `Currency {SDG, USD}` stored per row; no silent conversion [PAY-11]. Conversion indicators computed from `ExchangeRate` with staleness rules (alert 72 h; suppress ≥ 7 d). [LOC-04, Appendix C]

---

## 6. Data Layer Notes

- Start from PRD §9.2 schema. **It is a specification, not yet machine-validated** → Phase 0 must run `prisma validate` and `prisma migrate dev` and fix issues without changing intent.
- PRD §9.2 explicitly leaves these entities for later migrations (follow the same conventions: UUID, timestamps, soft delete where user-removable, indexes for all filters/joins): `Report, ModerationAction, Appeal, Blacklist, VerificationRequest, Notification, DeviceToken, NotificationPreference, Broadcast, Plan, Subscription, Promotion, CountrySetting, Translation, Banner, StaticPage, LegalDocumentVersion, RemoteConfig, ServiceProfile, ServiceSlot, ServiceAppointment, RentalRequest, AccommodationInquiry, AvailabilityBlock, PropertyProject, EmployerProfile, CandidateDocument, BusinessProfile, BusinessStaff, BusinessMetricDaily, SavedSearch, ListingView, WantedListing (may be modeled as `ListingType.WANTED`), OtpCode, LoginEvent, AdminSession, AdminRoleDef/Permission, CategorySchemaVersion, AttributeOption, FraudSignal, Receipt, Invoice, LedgerEntry, CreditBalance, AnalyticsEvent, JobRun, MediaAsset, State/Neighborhood`, plus the Appendix B engine tables (auctions, bids, barter proposals, carts, orders, delivery zones/fees, reservations, wholesale tiers).
- **Raw-SQL migrations required:** PostGIS `geography(Point,4326)` on `Listing.location` + GiST; `pg_trgm` GIN on title/description/custom text; GIN on `dynamicAttributes`; range partitioning of `Listing` by `createdAt`; expression indexes / generated columns for `promoteToIndex` attributes (price, year, mileage, area, KVA, bedrooms…); trigram index for Arabic-normalized search column.
- **Promoted attribute index manager** (`catalog/services/promoted-index.service.ts`): when admin toggles `promoteToIndex`, create/retire the index in a safe, concurrent manner and record it in audit log. [SRCH-19, §4.1(7)]
- **Search document:** maintain a normalized text column (`search_text_normalized`) updated on publish/edit using `arabic-normalize` util; ranking function combines trigram similarity, freshness, `qualityScore`, engagement. [SRCH-02, SRCH-06]

---

## 7. Module Catalogue (endpoints, tables, requirements)

Routes are relative to `/api/v1`. `(A)` = admin route (roles in brackets). `🔒` = auth required. `⚑` = behind a feature flag.

### 7.1 platform (M26 / M24 foundation)
| Area | Endpoints |
|---|---|
| Health | `GET /health`, `GET /health/ready` |
| Config (client) | `GET /config` (min versions, maintenance, media limits, active flags; ETag), `GET /flags` |
| Flags | `(A SA) GET /admin/flags`, `PATCH /admin/flags/{key}`, `GET /admin/flags/{key}/history` |
| Defaults (ADM-23) | `(A SA) GET /admin/defaults`, `PATCH /admin/defaults` (audit before/after) |
| Media limits | `(A SA) GET/PATCH /admin/media-limits` (global, per-category video toggle, duration, size, photo count) |
| Versions / maintenance | `(A SA) PATCH /admin/app-versions`, `PATCH /admin/maintenance` [ADM-15/16] |
| Audit | `(A FIN,SA) GET /admin/audit-logs`, `GET /admin/audit-logs/verify-chain` |
| System health | `(A SA) GET /admin/system-health` (uptime, error rate, queue depth, DB/cache) [ADM-22] |
Requirements: SYS-01/02/09/10/15, ADM-09/10/15/16/19/22/23, NFR-OBS-*.

### 7.2 admin-auth & admin-users
`POST /admin/auth/login`, `POST /admin/auth/2fa/setup` (first login), `POST /admin/auth/2fa/verify`, `POST /admin/auth/refresh`, `POST /admin/auth/logout`, `GET /admin/auth/me`; `(A SA) GET/POST /admin/admin-users`, `PATCH /admin/admin-users/{id}` (role/active), `GET /admin/admin-sessions`, `DELETE /admin/admin-sessions/{id}`, `GET /admin/admin-login-logs`. Never allow disabling the last Super Admin. IP logging + optional allow-list. [AUTH-20, ADM-17/18]

### 7.3 auth (M01)
| Endpoint | Notes |
|---|---|
| `POST /auth/register` | email+password; triggers email OTP; account cannot post/message/apply until verified [AUTH-01] |
| `POST /auth/otp/request` / `POST /auth/otp/verify` | purposes: `REGISTER`, `RESET`, `CHANGE_EMAIL`, `PHONE`; 6 digits, 10 min, ≤5 attempts, 60 s resend cooldown, hash stored, single-use [AUTH-05] |
| `POST /auth/login` | progressive lockout 1/5/15/60 min after 5 failures [AUTH-16] |
| `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/logout-all` | rotation + reuse detection |
| `POST /auth/social/{google|facebook|apple}` | verify provider token server-side; link only after verified email; no-email/Apple-relay → browse-only until real email verified (AUTH-22) [AUTH-02/03/04/08/22] |
| `POST /auth/password/forgot`, `POST /auth/password/reset` | resets revoke other sessions [AUTH-07] |
| `POST /auth/password/change`, `POST /auth/email/change` (+OTP), `PATCH /auth/phone` | phone not unique; unverified unless phone OTP on [AUTH-11/12] |
| `GET /auth/sessions`, `DELETE /auth/sessions/{id}`, `DELETE /auth/sessions` (others) | [AUTH-09] |
| `GET /auth/login-activity` | last 20 events [AUTH-10] |
| `(A SA) GET/PATCH /admin/otp-channels` | per-channel toggle; **refuse disabling the last enabled channel** [AUTH-15] |
| ⚑ `POST /auth/otp/request {channel:'sms'|'whatsapp'}` | handlers built, flag OFF [AUTH-13/14/21] |
| Funnel metrics | event capture for OTP delivery success/time-to-verify/drop-off [AUTH-23] |
Tables: `User, SocialIdentity, Session, OtpCode, LoginEvent`.

### 7.4 users (M02)
`GET/PATCH /me`, `GET /users/{id}` (public seller profile: avatar, name, join date, ratings, active listing count, response rate, badges), `GET /users/{id}/listings`, `POST /me/capabilities` (guided upgrade: dealer/employer/service provider), `PUT /me/contact-preferences`, `PUT /me/language`, `PUT /me/notification-preferences` (delegates to notifications), `POST /users/{id}/block`, `DELETE /users/{id}/block`, `GET /me/blocks`, `POST /me/verification` (docs to private bucket), `GET /me/verification`. `(A MOD,SUP,SA)` users: search/view/edit/suspend/ban/restore/revoke-sessions; `(A SUP,SA) GET /admin/verifications`, `POST /admin/verifications/{id}/approve|reject|request-info`; `(A SA/MOD) POST/DELETE /admin/users/{id}/badges`. Response-rate/time computed from chat activity. Avatars go through the media pipeline + classifier. [PROF-01…12, ADM-02/06]

### 7.5 geography, maps-gateway, localization, currency, country-settings
- Geography: `GET /geo/states`, `GET /geo/states/{id}/cities`, `GET /geo/cities/{id}/neighborhoods`; `(A SA) CRUD /admin/geo/*`. [GEO-06]
- Maps gateway: `GET /geo/places/autocomplete`, `GET /geo/reverse` – proxied to Google, **daily hard cap + per-user/IP limits**, graceful degradation to manual pin when cap hit; `(A SA) GET /admin/maps/usage`, `PATCH /admin/maps/caps`. Billing alert thresholds ($10/$25/$50) stored as config + alert log. Keys never returned to clients. [GEO-02…05, NFR-SEC-11]
- Localization: `GET /i18n/{lang}` (translation bundle, ETag), `(A SA) GET/PATCH /admin/translations`, `GET /admin/translations/missing`. [LOC-02/03]
- Currency: `GET /currency/rates`, `(A SA) POST /admin/exchange-rates` (with effective date), staleness alert job. [LOC-04]
- Country settings: `GET /country-settings/{code}`, `(A SA) GET/PATCH /admin/country-settings/{code}` (category visibility, attribute overrides, payment methods, languages, flags). [LOC-06/07, CAT-15, ADM-14]

### 7.6 catalog (M03) — the EAV engine
- Public: `GET /categories` (tree), `GET /categories/{id}`, `GET /categories/{id}/schema` (versioned + ETag; includes attributes, options, dependencies, validation rules, posting-restricted state), `GET /categories/{id}/filters`.
- Admin (SA): `POST/PATCH /admin/categories`, `POST /admin/categories/{id}/archive|restore`, `POST /admin/categories/reorder`, `POST/PATCH /admin/attributes`, `POST /admin/attributes/{id}/archive`, `POST /admin/attributes/reorder`, `PUT /admin/attributes/{id}/options` (supports `dependsOn`), `GET /admin/categories/{id}/form-preview`, `PATCH /admin/categories/{id}/posting` (restrict + message), `GET /admin/other-entries`, `POST /admin/other/{id}/promote` (optional listing migration).
- Rules: `(categoryId, attributeKey)` unique; keys immutable; archive not delete; required-flag change applies to new/edited listings only; global **Other** auto-present in every picker; schema version bump on every change; promoted-index manager hook.
- Server-side validation of `dynamicAttributes` compiles the **same Zod rules** from the schema (shared compiler in `catalog/services/schema-compiler.service.ts`). [CAT-01…16, §4]
- Seeds define all verticals' attributes (AUTO-*, RE-*, HOT-*, EQP-*, GEN-*) so those modules work without extra code.

### 7.7 media (M19)
`POST /media/upload-url` (presigned PUT for images; validates type/size), `POST /media/confirm`, `POST /media/video/init`, `POST /media/video/chunks` (idempotent, resumable within session), `POST /media/video/complete`, `GET /media/{id}`, `GET /media/signed-url?key=` (private docs; ≤5 min; authorization checked per document type), `DELETE /media/{id}`. Pipeline jobs: sharp → WebP/AVIF, multi-size thumbs, EXIF-GPS strip, pHash, classifier, video ffmpeg transcode (H.264/AAC MP4, capped res/bitrate) + poster, orphan cleanup. Limits read from admin media-limits (global/per-category video toggle, duration, size, photo count default 10). [MED-01…13]

### 7.8 listings (M04)
`POST /listings` (publish instantly, `ACTIVE`), `POST /listings/drafts`, `PATCH /listings/{id}`, `GET /listings/{id}`, `GET /me/listings`, `GET /me/drafts`, `POST /listings/{id}/renew`, `POST /listings/{id}/sold`, `DELETE /listings/{id}` (soft), `POST /listings/{id}/duplicate`, `POST /listings/{id}/media/reorder` (ordered `ListingMedia` + cover), `POST /listings/bulk` (renew/hide/sold/delete; business), `GET /listings/{id}/edits`, `POST /listings/quality-score` (live score preview), `POST /wanted` (Wanted = `ListingType.WANTED`, budget range). 
Logic: quality-score weights (Appendix C), caps (50/500 active; 5/h & 20/day), expiry per category + reminders at 7 d/1 d, currency stored, price optional per category, view counter (unique viewer/24 h, owner excluded), `Other` custom text, edit → re-scan + `ListingEdit` diff, async duplicate detection after publish, status transitions table (DRAFT/ACTIVE/SOLD/EXPIRED/ARCHIVED + HIDDEN/AUTO_HIDDEN/SUSPENDED; "Submitted" is transient and recorded in edit history only). Delayed-visibility hook (TRS-15) consulted at publish. `(A MOD,SA)` listing management in trust-safety module. [LST-01…20]

### 7.9 search (M05)
`GET /search` (keyword, category, dynamic filters, geo radius, sort relevance|newest|price_asc|price_desc|distance, cursor), `GET /search/suggest`, `GET /search/recent`, `GET /search/by-id/{MARBOU-NNNNN}`, `GET /home` (banners, category grid, recent, popular, nearby; sponsored slots hidden), `GET /nearby`, `GET /recommendations`, `GET /compare?ids=` (≤4; Automotive/Real Estate/Electronics), `GET /price-insights?listingId=` (min 8 comparables, ±15 % bands, currency normalization, stale-rate exclusion), `(A SA) GET/POST /admin/search/synonyms`, `GET /admin/search/top-queries`, `GET /admin/search/zero-results`, `(A SA) CRUD /admin/banners` (shared with content). Excludes hidden/auto-hidden/suspended/sold/expired listings; index refresh within seconds of write; zero-result logging; sponsored ranking only when monetization flag ON. [SRCH-01…19]

### 7.10 listing-details (M06)
`GET /listings/{id}/details` (gallery, specs table from attributes, seller card, banners for Sold/Expired/Suspended, similar listings, price indicator, breadcrumb, listing ID, posted date, view count), `POST /listings/{id}/contact-reveal` (server-mediated phone/WhatsApp; policy `guests_with_limit | signed_in_only`; 20/day per device+IP for guests; abnormal patterns → fraud signal), `GET /listings/{id}/whatsapp-link` (wa.me with template per language), `POST /listings/{id}/lead-events` (call/whatsapp/chat taps, no PII), `POST /listings/{id}/view`, SEO/OG endpoint `GET /public/listings/{id}/og`. Admin: `PATCH /admin/whatsapp-template`, `PATCH /admin/contact-reveal-policy`. **Public payloads must never include seller numbers.** [DET-01…13]

### 7.11 messaging (M07)
REST: `GET /threads`, `POST /threads` (anchored to listing + participants, unique `(listingId,buyerId,sellerId)`), `GET /threads/{id}/messages`, `POST /threads/{id}/messages` (idempotent), `POST /threads/{id}/offers`, `PATCH /offers/{id}` (accept/reject/counter), `POST /threads/{id}/read`, `POST /threads/{id}/mute`, `POST /threads/{id}/report`, `GET /quick-replies`, `POST/PUT/DELETE /quick-replies`, business inbox `GET /business/inbox`. Socket `/chat` events: `message:send`, `message:new`, `message:delivered`, `message:read`, `typing`, `thread:update`, `presence`. Unread counters, system banners for sold/expired/removed, block enforcement (blocked user cannot start chat or offer), throttling & spam flagging (20/min user, 10/min/recipient, same text to ≥3 recipients/10 min), push when recipient not in thread, polling fallback endpoint `GET /threads/{id}/messages?after=`. Moderators see only reported conversations. `(A SA) PATCH /admin/messaging/banned-phrases|throttle`. [MSG-01…14]

### 7.12 notifications (M16)
`GET /notifications`, `POST /notifications/read`, `POST /devices` (FCM token), `DELETE /devices/{token}`, `GET/PUT /me/notification-preferences`; `(A SA) POST /admin/broadcasts` (audience: all/role/city/category interest; schedule), `GET /admin/broadcasts/{id}/stats`. Dispatcher service with dedupe + batching, BullMQ retries and failure log, localized templates; transactional email for OTP/reset/expiry/appointment/rental. All NTF-04 triggers wired through domain events. [NTF-01…09]

### 7.13 trust-safety (M15)
`POST /reports` (listing/user/review/conversation; reasons FRAUD, INCORRECT_PRICE, SOLD, DUPLICATE, INAPPROPRIATE, OTHER), `POST /appeals`, `GET /me/appeals`, `GET /trust-center`, reviews: `POST /reviews` (qualifying-interaction check, one per interaction), `GET /users/{id}/reviews`, `POST /reviews/{id}/reply`, `POST /reviews/{id}/report`. Admin: `GET /admin/moderation/live-feed`, `GET /admin/reports`, `POST /admin/reports/{id}/resolve`, `POST /admin/listings/{id}/hide|suspend|restore|delete|edit` (reason code mandatory), `POST /admin/users/{id}/suspend|ban|restore`, `GET /admin/appeals`, `POST /admin/appeals/{id}/decide`, `CRUD /admin/blacklists` (phone/email/device/keyword/image-phash), `GET/PATCH /admin/moderation/delayed-visibility` (per category × trust tier, default OFF), `GET /admin/fraud-signals`, review moderation. 
Engines: scan pipeline (keywords, blacklisted phones, image-hash duplicates, text duplicates, classifier), fraud score 0–100 (alert 70, rate-limit 80, auto-hide 85 or 5 distinct reporters/24 h), report priority queue, JOB-21 scam-pattern scan. All actions → audit log. [TRS-01…18, ADM-05]

### 7.14 automotive (M08)
`POST/PATCH /rental-requests`, `GET /me/rental-requests`, `GET /listings/{id}/rental-requests` (owner), `POST /rental-requests/{id}/accept|decline|counter|cancel|complete`; service profile `POST/PUT/GET /service-profiles`, `GET /providers/{id}`, `PUT /service-profiles/{id}/slots` (slot duration, capacity, working hours), `GET /providers/{id}/slots?date=`, `POST /appointments`, `GET /me/appointments`, `GET /provider/appointments`, `POST /appointments/{id}/confirm|decline|propose-time|reschedule|cancel|complete|no-show|confirm-completion|dispute`, vehicle ownership docs (private) `POST /listings/{id}/vehicle-docs`. Rental terms snapshot stored on request; slot capacity enforced transactionally (no double-booking); reminders at 24 h and 2 h; completion confirmation window 72 h then review opens; `(A SUP,SA)` lookups. Vehicle makes/models are admin option lists in catalog. [AUTO-01…21]

### 7.15 real-estate, accommodation, equipment, general-goods
- real-estate: area-unit conversion + price/m² in response mappers (`?areaUnit=`), `PropertyProject` (developer, stage, completion, unit types, brochure PDF) via listing extension endpoints, agent/agency profiles (verified badge + active counters), approximate-location radius privacy (exact coords never in public payloads). [RE-01…12]
- accommodation: `POST /listings/{id}/inquiries`, `GET /me/inquiries`, `GET /host/inquiries`, `POST /inquiries/{id}/confirm-stay` (host) + `POST /inquiries/{id}/dispute-stay` (guest), `PUT /listings/{id}/availability-blocks`, ⚑ reservation engine `POST /reservations`, `PATCH /reservations/{id}` (Requested/Confirmed/Cancelled/Completed, overlap prevention). [HOT-01…08]
- equipment: no custom controllers beyond EAV seeds (+ `promoteToIndex` for KVA, wattage, Ah, battery chemistry), installation/delivery/warranty attributes. [EQP-01…08]
- general-goods: seeds for livestock, crops, fashion, home, food, general; ⚑ wholesale (MOQ + tier pricing) per Appendix B. [GEN-01…11]

### 7.16 jobs (M10)
`POST/PATCH /jobs`, `GET /jobs`, `GET /jobs/{id}`, `POST /jobs/{id}/renew`, `POST /jobs/{id}/close`, `POST /jobs/{id}/apply` (tier QUICK|FULL; duplicates blocked; 20/day), `GET /me/applications`, `POST /applications/{id}/withdraw`, employer: `GET /employer/jobs/{id}/applications`, `PATCH /applications/{id}` (status: SUBMITTED→VIEWED→SHORTLISTED→INTERVIEW→REJECTED/HIRED + notes), `GET /applications/{id}/documents/{docId}/signed-url` (only if candidate applied to that employer's job; ≤5 min), candidate: `GET/PUT /me/candidate-profile`, `POST /me/candidate-profile/documents`, `DELETE …/documents/{id}`, `POST /me/cv-requests`, `GET /me/cv-requests`, `POST /me/cv-requests/{id}/approve|request-revision`, `POST /me/cv/export-pdf`, job alerts `CRUD /me/job-alerts`. Admin/Support: `GET /admin/cv-requests`, `GET /admin/cv-requests/{id}`, `PATCH …/assign`, `POST …/deliver`, `POST …/handle-revision`. Candidate profiles never public/searchable; CV status enum `PENDING|IN_PROGRESS|DELIVERED|REVISION_REQUESTED|APPROVED`. Verified Employer badge; scam-pattern scan; deadline expiry. [JOB-01…21]

### 7.17 business (M14)
`POST/PUT /business/profile`, `GET /business/{id}` (public), `GET /business/{id}/listings`, `POST /business/staff/invite`, `PATCH/DELETE /business/staff/{id}` (Manager/Editor/Support; scoped to business), `GET /business/dashboard` (views, unique viewers, leads, conversion; ranges), `GET /business/dashboard/top-listings`, `GET /business/export.csv`, storefront deep link metadata. `BusinessMetricDaily` rollup job. Aggregated numbers only. [BIZ-01…09]

### 7.18 payments (M17)
`POST /payments/bankak` ⚑`payments.bankak_user_flow` (reference + receipt upload; idempotent), `GET /me/payments`, `GET /me/invoices`, `GET /invoices/{id}/download`; `(A FIN,SA) GET /admin/payments?state=`, `GET /admin/payments/{id}` (user data + receipt signed URL for zoom/pan/rotate), `POST /admin/payments/{id}/approve`, `POST /admin/payments/{id}/reject {reason}`, `GET /admin/payments/export.csv`, ⚑ refunds `POST /admin/payments/{id}/refund`. Duplicate reference + receipt-hash detection → fraud flag; sequential invoice numbering; ledger entries per state change; gateway port (`PaymentGateway`) with Bankak-manual adapter. **Staging runs with user flow ON; production OFF.** [PAY-01…13]

### 7.19 monetization (M18) — all ⚑ OFF in production
Per-engine flag keys; all share `ENABLE_MONETIZATION` as master. Implement to Appendix B only:
subscriptions (plans, quota, renewal job, cancel-at-period-end) · promotions (featured/top-boost/badge/banner slot, impressions/clicks) · credits (ledger, no negative balance, admin adjust) · paid boosts/badges · auctions (atomic bids, winner job) · barter · asset rental (availability + terms snapshot) · order & cart (Created/Confirmed/Fulfilled/Cancelled) · delivery (zone fee matrix, tracking states, mock courier) · AdMob placeholders from remote config. Admin: toggle each engine, `(A SA) CRUD /admin/plans|promotions|delivery-zones|…`. Public endpoints return `FEATURE_DISABLED` when OFF. [MON-01…14]

### 7.20 user-dashboard (M22)
`GET /me/dashboard`, favorites `POST/DELETE /favorites/{listingId}`, `GET /favorites` (price-drop tracking via `priceAtSave`), saved searches `POST/GET/PATCH/DELETE /saved-searches` (alert frequency), `GET /me/listing-performance`, `POST /me/data-export` (BullMQ → JSON; status + signed URL), `GET /me/data-export/{id}`, `POST /me/account/delete` (re-auth + email confirm; 30-day grace), `POST /me/account/delete/cancel`, `POST /me/account/deactivate`, `POST /me/account/reactivate`. Deletion job anonymizes chat/review authorship, removes CVs/docs/contact data; audit entries untouched (pseudonymous). [DASH-01…08]

### 7.21 content (M23)
Public: `GET /help`, `GET /help/{slug}`, `GET /legal/{type}` (current + versions), `GET /pages/{slug}`, `GET /banners`, `GET /announcements`, `GET /sitemap.xml`, `GET /robots.txt`, `GET /.well-known/apple-app-site-association`, `GET /.well-known/assetlinks.json`, `GET /public/account-deletion` (CMS-09), `POST /support/tickets`, `GET /me/support/tickets`. Admin: CRUD for help, legal (versioned + effective date + acceptance flag), static pages, banners (schedule + language/country targeting), `(A SUP,SA) /admin/support/tickets`, `POST /legal/{type}/accept`. [CMS-01…09]

### 7.22 analytics (M25)
`POST /analytics/events` (anonymized, consent-aware batch), `(A SA) GET /admin/analytics/{retention|active-users|listings-by-category|search-trends|zero-results|conversion|posting-funnel|other-entries}`, `GET /admin/analytics/export.csv`, scheduled report jobs. No personal data in payloads; retention per Appendix D. [ANL-01…06]

### 7.23 admin aggregation (M24)
`GET /admin/dashboard/kpis` (new users, new listings, active chats, open reports, pending verifications, pending payments; live via `/admin` socket), plus the controllers declared in the modules above. [ADM-01…23]

---

## 8. Queues & Workers (BullMQ)

| Queue | Jobs | Notes |
|---|---|---|
| `scan` | keyword/blacklist/dup-image/dup-text/classifier scan after publish/edit | retries; failure ⇒ listing stays published, flagged for manual review (graceful degradation) |
| `search-index` | refresh normalized search text / promoted columns | within seconds |
| `expiry` | expire listings/jobs; reminders 7 d & 1 d | cron |
| `notifications` | push/email/in-app dispatch, dedupe, batching | retries + dead-letter |
| `media` | image processing, thumbs, pHash, EXIF strip, orphan cleanup | |
| `video` | ffmpeg transcode, poster | |
| `exports` | user data export, CSV exports, scheduled reports | |
| `metrics` | BusinessMetricDaily rollups, analytics aggregates | |
| `rates` | exchange-rate staleness check/alerts | cron |
| `maps` | daily cap reset, billing alert evaluation | cron |
| `lifecycle` | appointment reminders/completion-window lapse, subscription/promotion expiry, auction closing, deletion grace expiry | cron |
| `retention` | Appendix D purge engine; writes `JobRun` | SYS-15 |
| `broadcast` | scheduled admin broadcasts | |

All processors: idempotent, retry with backoff, dead-letter after max attempts, `JobRun` record, Sentry on failure. [SYS-03]

---

## 9. Feature Flag Keys (seed all)

```
otp.email  (cannot disable last channel)   otp.sms    otp.whatsapp
payments.bankak_user_flow  (staging ON / prod OFF)  payments.refunds  payments.invoices
media.video_uploads (global)  (+ per-category override in config)
moderation.delayed_visibility (config per category × trust tier; default OFF)
contact.reveal_policy (config: guests_with_limit | signed_in_only)
posting.restricted.<categoryId>
ENABLE_MONETIZATION  monetization.subscriptions  .promotions  .credits  .boosts
monetization.auctions  .barter  .asset_rental  .orders_cart  .delivery  .admob
wholesale.enabled   hotel.reservations
```
Flags are DB-backed, Redis-cached, propagate ≤ 60 s, every change audited. [SYS-01, MON-12]

---

## 10. Integration Adapter Matrix

| Port | Production impl | Dev/test impl (must exist) |
|---|---|---|
| Storage | S3 / R2 | MinIO (docker) |
| Email | provider SMTP/API | Mailhog |
| SMS | multi-provider fallback chain (flag OFF) | console/mock |
| WhatsApp OTP | Business API (flag OFF) | console/mock |
| Push | FCM | mock (logs payload) |
| Social | Google/Facebook/Apple token verification | **sandbox verifier that accepts signed test tokens, dev only** |
| Maps | Google Places/Geocoding via capped gateway | canned responses |
| Classifier | provider chosen at M2 (OD-04) | mock returning configurable verdict |
| Payment | Bankak manual adapter | same |
| Courier | — | mock courier |
| CV generator | internal PDF renderer | same |

Mocks are selected by env (`INTEGRATIONS_MODE=mock|live`) and **never** loaded in production.

---

## 11. Environment Variables (`.env.example` must include)

`NODE_ENV, PORT, DATABASE_URL, REDIS_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, ADMIN_JWT_SECRET, ADMIN_TOTP_ENC_KEY, S3_ENDPOINT, S3_REGION, S3_PUBLIC_BUCKET, S3_PRIVATE_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, CDN_BASE_URL, SMTP_*, FCM_CREDENTIALS_JSON, GOOGLE_CLIENT_IDS, FACEBOOK_APP_ID/SECRET, APPLE_CLIENT_ID/TEAM/KEY, GOOGLE_MAPS_SERVER_KEY, MAPS_DAILY_CAP, SMS_PROVIDER_*, WHATSAPP_*, CLASSIFIER_*, SENTRY_DSN, INTEGRATIONS_MODE, DEV_EXPOSE_OTP (dev only), CORS_ORIGINS, RATE_LIMIT_*`

---

## 12. Security Checklist (implement in Phase 0 + verify at the end)

HTTPS/HSTS, helmet, CORS allow-list, CSRF protection for admin web cookies (if used), Argon2id, hashed OTP/refresh tokens, parameterized queries only (raw SQL via tagged templates), Zod validation on every input, output sanitization, per-endpoint rate limits, no unrestricted third-party keys, secrets only in env, dependency scanning in CI (fail on critical), private-bucket + signed URL for documents, TOTP secrets encrypted at rest, IDOR checks on every `{id}` route (ownership or role), no PII in logs/audit. [NFR-SEC-01…11]

---

## 13. Testing & Postman Conventions

- **Postman collection layout:** one folder per phase → sub-folder per module → request. Name pattern: `[P07][LST-03] Publish listing instantly`.
- **Environments:** `baseUrl`, `adminBaseUrl`, `lang`, `userAToken`, `userBToken`, `adminSaToken`, `adminModToken`, `adminFinToken`, `adminSupToken`, plus IDs saved by scripts (`listingId`, `threadId` …).
- **Every request has a Tests tab** asserting: status code, envelope shape, key fields, and (where relevant) negative cases (401/403/409/422/429). Chain via `pm.environment.set`.
- **Dev helpers (disabled in production):** `GET /dev/otp/{email}` returns latest OTP when `DEV_EXPOSE_OTP=true` (otherwise read from Mailhog); `POST /dev/social-token` mints sandbox social tokens; `POST /dev/clock/advance` optional for expiry tests; `POST /dev/jobs/run/{name}` to trigger cron jobs on demand. Guard with `NODE_ENV !== 'production'`.
- **Collection runner:** a "smoke" folder running the happy path across phases must pass before a phase is accepted.
- Jest/Supertest e2e specs mirror the Postman folders so CI protects every phase's exit criteria.

---

## 14. Known PRD Gaps the Agent Must Resolve Conservatively

1. §9.2 schema is un-validated — fix syntax/relations in Phase 0, preserve intent, log changes in `docs/schema-decisions.md`.
2. Several entities are only named in the catalog (§9.1); define fields from the module requirements and the Appendix B/C/D tables.
3. Third-party providers (SMS, classifier, tile, hash source) are open decisions OD-01…OD-11; build to the **port**, ship mock + one real adapter where the PRD defines a default, and do not block phases on them.
4. If a requirement appears to exceed Annex A (flagged ◆ in Appendix A: LST-19, DET-13, TRS-15/16/17), still implement as written in PRD V3 but isolate it so it can be removed cleanly if a Change Request rejects it.
