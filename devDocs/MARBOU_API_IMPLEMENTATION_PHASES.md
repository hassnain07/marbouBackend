# MARBOU API — Phased Implementation Plan (Postman-Testable)

> **Audience:** the coding agent building the API. Read `MARBOU_API_ARCHITECTURE.md` first; it defines structure, conventions and module endpoints. This file defines **build order**, **what to deliver per phase**, and **how each phase is verified in Postman**.
> **Source of truth:** `MARBOU_PRD_V3.md`. Requirement IDs in brackets must be read before implementing.
> **Constraint:** frontends are not integrated. Each phase must be fully verifiable via Postman alone and must leave the system in a working, demonstrable state.

---

## 0. Global Rules for Every Phase

1. **Definition of Done per phase (PRD §12.3 adapted):** API implemented · Zod validation · DB migrations + indexes · Swagger docs updated · admin control + audit logging where configurable/moderated · automated tests (Jest/Supertest) · Postman requests with Tests-tab assertions · exit criteria demonstrated.
2. **Do not start phase N+1 until phase N's exit criteria pass.** Re-run the Postman smoke folder of all previous phases (regression) at the end of each phase.
3. **No stubs presented as done.** If a provider is open (SMS, classifier, tiles), implement the port + a working dev adapter and mark the live adapter clearly in the README.
4. **Every admin-configurable value goes through the flags/defaults/config services** from Phase 1; never hard-code thresholds listed in Appendix C.
5. **Every write that matters emits an audit entry** (config, moderation, verification, financial). IDs only, no PII.
6. **Localization:** every phase's responses and errors work with `Accept-Language: ar` and `en`.
7. **Negative tests are mandatory:** 401 (no token), 403 (wrong role/capability), 404, 409 (conflict/duplicate), 422 (validation), 429 (rate limit) wherever applicable.
8. **Phase commit hygiene:** one PR/branch per phase; update `postman/MARBOU.postman_collection.json`, `.env.example`, seeds and README in the same PR.
9. Keep the dependency order below. Reviews, notifications and analytics hooks that depend on later modules are implemented via **domain events** with listeners added in the phase where the consumer exists.

### Dependency Overview
```
P0 Foundation
 └ P1 Platform (flags, config, defaults, audit) ─ P2 Admin Auth/RBAC
     └ P3 User Auth ─ P4 Profiles
         ├ P5 Geography/i18n/Currency/Country
         └ P6 Catalog (EAV) ─ P7 Media ─ P8 Listings ─ P9 Search ─ P10 Details & Contact
                                                           ├ P11 Messaging ─ P12 Notifications
                                                           ├ P13 Trust & Safety (+Reviews)
                                                           └ P14 User Dashboard (favorites, saved searches, export, deletion)
                P15 Automotive ─ P16 Real Estate/Hotels/Equipment/General ─ P17 Jobs ─ P18 Business
                P19 Payments ─ P20 Monetization engines ─ P21 Content/CMS ─ P22 Analytics & Admin consolidation
                P23 Ops, retention, hardening, handover
```

---

## Postman Setup (do once in Phase 0, extend every phase)

**Environment variables:** `baseUrl`, `lang`, `userA_email/password/token/refresh`, `userB_*`, `adminSA_token`, `adminMOD_token`, `adminSUP_token`, `adminFIN_token`, plus chain IDs (`categoryId`, `listingId`, `threadId`, `offerId`, `paymentId` …).

**Folder structure:** `P00 Foundation` … `P23 Hardening`, each with sub-folders per module. Final folder `ZZ Smoke` = one happy-path run covering all phases.

**Collection-level pre-request script:** adds `Accept-Language: {{lang}}`, `x-device-id`, and auto-attaches `Authorization` from the right variable using a request-level `auth` tag. **Collection-level test:** asserts the envelope (`success`, `data|error`, `meta.requestId`).

**Dev helper endpoints (non-production only):** `GET /dev/otp/:email`, `POST /dev/social-token`, `POST /dev/jobs/run/:name`, `POST /dev/seed/demo`, optional clock-advance. Also usable via Mailhog (`http://localhost:8025`).

---

# PHASE 0 — Foundation & Project Scaffolding

**Goal:** a runnable, documented, containerized NestJS API with DB, Redis and the shared conventions every later phase relies on.
**Covers:** SYS-04, SYS-07, SYS-08, SYS-13, SYS-14, NFR-MNT-01, NFR-SEC-01/04/08/09, NFR-NET-03, §3.2, §3.5

### Tasks
1. Scaffold `apps/api` per the directory structure; strict TypeScript, ESLint, Prettier, path aliases, Husky optional.
2. `docker-compose.yml`: api, PostgreSQL **with PostGIS**, Redis, MinIO, Mailhog. `.env.example` with all variables; Zod env validation fails fast.
3. Prisma: load §9.2 schema → run `prisma validate` and `prisma migrate dev`; fix issues (record in `docs/schema-decisions.md`). Add raw-SQL migration for extensions `postgis`, `pg_trgm`.
4. Common layer: response envelope interceptor, exception filter + error-code registry, `ZodValidationPipe`, cursor pagination helper, request-id middleware, locale resolver, device-id middleware, compression (gzip/Brotli), helmet, CORS allow-list, Swagger at `/api/docs`.
5. Redis module + cache-aside helper + rate-limit guard (per IP/account/device).
6. BullMQ bootstrap (queues module, one trivial processor, `JobRun` write helper).
7. Sentry + pino structured logging; `GET /health`, `GET /health/ready` (DB, Redis, storage).
8. Core-bridge (`@ahmed-org/marketplace-core` or local shims).
9. CI: lint, typecheck, unit tests, `prisma migrate diff` check, dependency audit (fail on critical).
10. Seed runner skeleton; Postman collection + environments created.

### Postman tests
| Request | Assertion |
|---|---|
| `GET /health`, `/health/ready` | 200; DB/Redis/storage ok |
| `GET /api/docs-json` | OpenAPI JSON valid |
| `GET /nonexistent` | 404 envelope with code `NOT_FOUND`, localized for `ar` and `en` |
| `POST /dev/echo` with invalid body (dev-only route) | 422 with `details[]` |
| Hit a test route 100× fast | 429 with `RATE_LIMITED` |
| Response header check | `Content-Encoding` gzip/br on large JSON; security headers present |

### Exit criteria
`docker compose up` from a clean clone → API healthy; migrations applied; Swagger live; CI green; Postman Phase 0 folder passes.

---

# PHASE 1 — Platform Services: Flags, Remote Config, Defaults, Audit Log

**Goal:** the runtime-control backbone everything else depends on.
**Covers:** SYS-01, SYS-02, SYS-10, ADM-09/10/15/16/19/23, MON-12 (toggle mechanism), NFR-OBS-03, TRS-12

### Tasks
1. `FeatureFlag` service (DB + Redis cache, ≤60 s propagation, per-country override column, change history). Seed **all** keys listed in the architecture file §9.
2. `RemoteConfig`: min app versions (iOS/Android), maintenance mode window + localized banner text, media limits (global video toggle, per-category override, duration 30 s, size 15 MB, photos 10).
3. `Defaults` register service: load Appendix C defaults into DB, typed accessor `defaults.get('listing.rate.perHour')`, update endpoint writes audit with before/after.
4. `AuditService`: append-only, hash-chained (`prevHash`/`hash`), `record()` API, `verifyChain()`; DB-level protection (revoke UPDATE/DELETE via migration/trigger) so records cannot be edited.
5. `@RequiresFlag` guard + `@Audit` decorator + `AuditInterceptor`.
6. Temporary dev-only "bootstrap admin" header/seed (replaced by real admin auth in Phase 2). Seed first SUPER_ADMIN row now.

### Endpoints
`GET /config`, `GET /flags`, `GET /admin/flags`, `PATCH /admin/flags/{key}`, `GET /admin/flags/{key}/history`, `GET/PATCH /admin/media-limits`, `PATCH /admin/app-versions`, `PATCH /admin/maintenance`, `GET/PATCH /admin/defaults`, `GET /admin/audit-logs`, `GET /admin/audit-logs/verify-chain`.

### Postman tests
- `GET /config` returns ETag; second call with `If-None-Match` → **304**.
- Toggle a flag via PATCH → `GET /flags` reflects within ≤60 s (poll with a Postman `setTimeout` loop or use cache-bust on write; assert ≤60 s).
- Change a default (e.g. photos per listing 10→12) → audit entry exists with before/after; revert.
- Maintenance mode PATCH → `GET /config` shows banner in `ar` and `en`.
- `GET /admin/audit-logs/verify-chain` → `valid: true`; (dev test) tamper with a row directly in DB → `valid: false` (document in README, not a Postman step).
- Attempt `PATCH /admin/flags/*` with MOD token (after Phase 2) → 403 (re-run later in regression).

### Exit criteria
Flags, config, defaults and audit are operational; chain verifies; no hard-coded Appendix C values remain in code.

---

# PHASE 2 — Admin Authentication, 2FA & RBAC

**Goal:** secure admin identities so every later admin endpoint can be tested with real roles.
**Covers:** AUTH-20, ADM-17, ADM-18, NFR-SEC-07, §5 (admin rows)

### Tasks
1. `AdminUser` auth: email + password (Argon2id), **mandatory TOTP** (setup → verify), admin JWT (separate secret/audience), refresh, logout, admin session table, IP logging, optional per-admin IP allow-list.
2. `AdminRoleGuard` with table-driven permission map implementing the §5 matrix in the architecture file.
3. Super Admin management: create admin, change role, deactivate, list/revoke admin sessions; prevent removing/deactivating the last Super Admin; only SA can create admins or change roles.
4. Wire Phase 1 admin routes to the correct roles (flags/media/defaults/maintenance → SA; audit read → FIN+SA).
5. Seed 4 admin test accounts (SA, MOD, SUP, FIN) with known TOTP secrets for dev; dev helper to generate a TOTP code.

### Endpoints
`POST /admin/auth/login`, `/2fa/setup`, `/2fa/verify`, `/refresh`, `/logout`, `GET /admin/auth/me`, `GET/POST /admin/admin-users`, `PATCH /admin/admin-users/{id}`, `GET /admin/admin-sessions`, `DELETE /admin/admin-sessions/{id}`, `GET /admin/admin-login-logs`.

### Postman tests
- Login without 2FA completion → no usable token (cannot call admin routes).
- Complete 2FA → token; `GET /admin/auth/me` returns role.
- Matrix tests: **MOD → flags/EAV/payments = 403**; **FIN → audit read 200, audit write/role change 403**; **SUP → CV/verification allowed, payments 403**; **SA → all 200**.
- SA revokes an admin session → that token immediately fails 401.
- Try to demote the only SA → 409.
- Login IP appears in `admin-login-logs`; wrong TOTP 5× → temporary lock.

### Exit criteria
Four roles enforced by tests; audit log records admin logins/role changes; Phase 1 admin endpoints now properly protected.

---

# PHASE 3 — Customer Authentication & Sessions (M01)

**Goal:** complete user auth lifecycle.
**Covers:** AUTH-01…12, 15…19, 21, 22, 23 (13/14/21 handlers built, flag OFF), NFR-SEC-02/03, NFR-SEC-05

### Tasks
1. Register + login with Argon2id; email OTP service (6 digits, 10 min expiry, ≤5 attempts, 60 s resend cooldown, hashed, single-use, purpose-bound).
2. JWT access (≤15 min) + rotating refresh with `familyId`; **reuse detection revokes family**; session records with device/OS/approx location; `AccountStatusGuard` (suspend/ban ⇒ immediate session invalidation + reason message).
3. Forgot/reset password (OTP; revokes other sessions); change password; change email (OTP re-verify); contact phone (validated, +249 priority via libphonenumber; non-unique; unverified).
4. Social auth: Google, Facebook, Apple token verification adapters + dev sandbox verifier. Link by verified email only; handle **no-email / Apple relay** → browse-only until a real email is verified (AUTH-22).
5. Sessions list/revoke one/revoke all others; login-activity (last 20).
6. Lockout with progressive delays (5 failures → 1/5/15/60 min) by account and IP; Redis rate limits on all auth endpoints.
7. OTP channel admin: `GET/PATCH /admin/otp-channels` with **last-channel rule**; SMS/WhatsApp handlers + provider fallback built (mock) and flag OFF; phone OTP adds `verifiedPhoneNumber`.
8. Funnel events for AUTH-23 (OTP sent/delivered/verified, time-to-verify, drop-off step).
9. Guest browsing: public routes require no token; email-verified guard on posting/messaging/applying routes (applied in later phases).

### Postman tests
- Register → OTP via Mailhog/dev route → verify → login ok.
- OTP wrong ×5 → blocked; resend < 60 s → 429; resend after cooldown OK; expired code (use dev clock or wait) → `AUTH_OTP_EXPIRED`; reused code → fail.
- Refresh rotates; **replaying the old refresh token revokes the whole family** (next refresh with the new token also fails).
- Duplicate email register → 409; social login with email already registered but unverified-by-provider → no duplicate account.
- Social token with no email → account created in browse-only state; calling a "requires verified email" test route → 403 `EMAIL_VERIFICATION_REQUIRED`; after adding/verifying email → 200.
- Phone: two users submit the same unverified phone → both accepted (non-unique).
- Admin disables Email OTP while it is the only channel → **422 refusal**; enable SMS flag then disabling Email succeeds (re-enable after).
- Suspend user (use temporary admin route or dev helper) → existing access token fails immediately with reason.
- 6th failed login → lockout response with retry-after.

### Exit criteria
A new user registers and verifies in < 2 min via API; revoked session cannot call any authenticated endpoint; last-channel rule enforced; auth funnel events stored.

---

# PHASE 4 — Profiles, Capabilities, Verification, Blocking (M02)

**Covers:** PROF-01…12, ADM-02 (user mgmt basics), ADM-06 (verification queue)

### Tasks
1. `GET/PATCH /me` (name, avatar ref, city, bio, languages, contact methods); language persistence (`AR|EN`) across devices.
2. `UserCapability` grants + guided upgrade endpoints (DEALER, EMPLOYER, SERVICE_PROVIDER; CANDIDATE auto-created on first candidate action); capability guard.
3. Public seller profile `GET /users/{id}` (avatar, name, join date, rating placeholder aggregated later, active listing count placeholder, response rate/time placeholder, badges) — fields populated by later phases via events; schema in place now.
4. Block/unblock (+ list). Enforcement hooks exposed as `BlockService.isBlocked(a,b)` for messaging/offers (PROF-07 rules).
5. Verification requests: upload to **private bucket** (storage adapter available now for documents; full media pipeline in Phase 7), queue with approve / reject(reason) / request-info; badge grant/revoke (audited). Badge types: VERIFIED_SELLER/DEALER/BUSINESS/EMPLOYER/SERVICE_PROVIDER.
6. Account status admin ops: suspend / ban (reason, duration) / restore → revokes sessions (Phase 3 integration).
7. Admin user search/list/view/edit.

### Postman tests
- Same user becomes seller + candidate + employer (union of capabilities visible in `/me`).
- Language PATCH persists; new login on another "device" returns same language.
- Block B→A: B tries `POST /_test/can-chat` (dev route using `BlockService`) → denied; A's profile/listings still visible to B.
- Submit verification with docs → doc URL is **not** publicly retrievable; staff-only signed URL works; reject without reason → 422; approve → badge visible on public profile; revoke badge → audit entry.
- MOD suspends user → user's token dead; restore → can log in again.
- SUP can handle verification queue; FIN cannot (403).

### Exit criteria
Identity model works end-to-end; verification documents never public; audit entries for badge/status changes.

---

# PHASE 5 — Geography, Localization, Currency, Country Settings (M20/M21 foundations)

**Covers:** GEO-02…07, LOC-02…08, ADM-11, ADM-12 (translations), ADM-14, NFR-SEC-11, CAT-15 (storage)

### Tasks
1. Geography: country/state/city/neighborhood (En+Ar) with admin CRUD; seed Sudan.
2. Maps gateway: Google Places autocomplete + reverse geocode **proxy** with daily hard cap, per-user and per-IP limits, usage counters, alert log with $10/$25/$50 thresholds, graceful degradation response (`MAPS_CAP_REACHED` → client falls back to manual pin/city). Mock adapter for dev. Keys never returned to clients.
3. Translation store: key/value per language, `GET /i18n/{lang}` with ETag, admin edit, missing-keys report with fallback to English.
4. Currency: `ExchangeRate` with effective dates, `POST /admin/exchange-rates`, `GET /currency/rates`, conversion util, staleness job (alert 72 h; suppress ≥ 7 d), `convert()` returns `null` when stale.
5. Country settings matrix (categories visibility/attribute overrides/payment methods/languages/flags per country) CRUD + read.
6. Phone validation util with +249 priority exposed for reuse.

### Postman tests
- Cascading geography fetch (states → cities → neighborhoods) in `ar` and `en`.
- Autocomplete mock returns results; hit cap (set cap=3 via admin) → 4th returns degrade code; per-IP limit → 429; usage monitor shows counts.
- Translations: ETag/304; edit a key → bundle changes; missing-key report lists a key.
- Exchange rate: add rate → convert works; backdate effective date > 7 d (dev helper) → converted indicator suppressed; alert record created at 72 h.
- Country settings: change per-country flag → `GET /country-settings/SD` reflects.

### Exit criteria
Maps proxy cannot be bypassed or overspent; currency staleness rules enforced; translation/country config editable without release.

---

# PHASE 6 — Category Management & Dynamic EAV Engine (M03)

**Covers:** CAT-01…16, §4.1, ADM-04, SRCH-19 (index manager), AUTO-01/…, RE-*, HOT-*, EQP-*, GEN-* (via seeds)

### Tasks
1. Category tree CRUD (infinite depth, Ar/En, slug, icon, order, active, archive, posting restriction + message, expiry days).
2. `CategoryAttribute` CRUD: 8 data types, required/filterable/searchable/`promoteToIndex`/archived, validation rules (min/max/regex), options with `dependsOn` (Make→Model, Region→City); unique `(categoryId, attributeKey)`; keys immutable.
3. **Other fallback engine**: system "Other" in every picker; `OtherEntry` counting; admin analytics list + one-click promote (optionally migrate matching listings).
4. **Schema service**: build schema JSON per category (inherits parent attrs where designed), version bump + **ETag**; `GET /categories/{id}/schema` returns 304 when unchanged; unknown-type safe handling info.
5. **Schema compiler**: server-side Zod from schema (reused by Listings in Phase 8).
6. **Promoted-index manager**: toggle `promoteToIndex` → create/retire expression index or generated typed column (price, year, mileage, area, KVA, bedrooms…); audited.
7. Admin form preview endpoint; posting restriction; country attribute overrides (consumes Phase 5 config).
8. **Seed all verticals** from the PRD: Automotive (AUTO-01…06, 09, 14, 19, 20), Real Estate (RE-01…09), Hotels (HOT-01/02), Equipment & Solar (EQP-01…08, promoted indexes on KVA/wattage/Ah/battery), Livestock/Agri/Electronics/Fashion/Children/Home/Food/General (GEN-01…10), Jobs & Services categories. Native Arabic names with English equivalents (GEN rules). Vehicle makes/models as dependent option lists.

### Postman tests
- `GET /categories` tree contains "Other" under every node (assert for each top-level and a sample of leaves).
- `GET /categories/{carsId}/schema` → ETag; repeat with `If-None-Match` → 304; admin adds attribute → version changes → 200 with new field.
- Duplicate `attributeKey` → 409; edit label keeps key; delete attempt on in-use attribute → archived instead, still readable.
- Dependent options: model list changes by selected make (via options endpoint filter).
- Toggle `promoteToIndex` on `year` → audit entry; verify index exists (admin diagnostic endpoint `GET /admin/diagnostics/indexes`).
- Promote an Other entry → appears as official option.
- Required-flag change: create listing later (Phase 8) proves old listings aren't invalidated (note for regression).
- MOD token on EAV endpoints → 403.

### Exit criteria
Adding an attribute through the admin API shows in the schema on next fetch with no deployment; all PRD verticals seeded and fetchable.

---

# PHASE 7 — Media Pipeline (M19)

**Covers:** MED-01…13, NFR-NET-01/02, NFR-SEC-06, MED-10

### Tasks
1. Presigned upload flow for images (validate type/size by admin limits) → `confirm` triggers `media` queue: sharp → WebP (+AVIF), multi-size thumbnails, **EXIF-GPS strip**, pHash, classifier hook (adapter port; mock).
2. Chunked, **idempotent, resumable** video upload (init/chunks/complete); `video` queue: ffmpeg validation, transcode H.264/AAC MP4 capped res/bitrate, poster frame, reject with localized message if outside limits.
3. Limits from Phase 1 media-limits (global & per-category video toggle, duration, size, photo count).
4. Dynamic thumbnail variants + Data-Saver query param (`?quality=saver` → small variants; ≥50 % byte reduction target).
5. Private bucket + `GET /media/signed-url` (≤5 min; authorization by document type/ownership); public media via CDN base URL.
6. Orphan cleanup cron (unreferenced files).
7. `MediaAsset` records link to owners; hash-blacklist check API for later phases.

### Postman tests
- Upload large JPEG (use pre-request to attach a test file) → returns WebP URL + thumbs; EXIF GPS absent (inspect via test file with GPS; assert via `GET /media/{id}` metadata flag `gpsStripped: true`).
- Upload an unsupported type → 422; oversize → 422.
- Video: upload 3 chunks; repeat chunk 2 with same idempotency key → no duplicate; complete → poster URL; over-duration clip → rejected with localized message; admin sets per-category video OFF → init returns 403 `VIDEO_DISABLED`; change duration limit → effective without deploy.
- Private doc signed URL works then expires (wait/clock helper); other user's doc → 403.
- Run orphan job via `POST /dev/jobs/run/media-cleanup` → unreferenced file removed.

### Exit criteria
A 15 MB/30 s video flow completes; over-limit is rejected cleanly; no private file is reachable without a short-lived signed URL.

---

# PHASE 8 — Listings: Creation, Lifecycle & Quality (M04)

**Covers:** LST-01…20, CAT-16, TRS-01 (enqueue only), TRS-15 (hook)

### Tasks
1. `POST /listings` validates `dynamicAttributes` with the compiled schema; **publishes instantly as ACTIVE**; assigns `publicSeq` (`MARBOU-NNNNN`); currency stored; price optional where category says; Wanted listings with budget range; `Other` text; contact options; ordered `ListingMedia` + cover; location (lat/lng → PostGIS via raw SQL; approx-radius option).
2. Server **drafts** (create/update/resume), `GET /me/drafts`; (local autosave is client-side, LST-19 — nothing to build except draft endpoints being resilient).
3. Edit with `ListingEdit` diff + re-scan enqueue; mark Sold; soft delete; duplicate-as-template; renew/repost; bulk actions (business).
4. Quality score engine (Appendix C weights) + `POST /listings/quality-score` preview.
5. Status machine with allowed transitions incl. HIDDEN/AUTO_HIDDEN/SUSPENDED (written by Phase 13), `Submitted` transient only in edit history.
6. Caps and rate limits from defaults (50 individual / 500 business; 5/h, 20/day); category posting restriction enforced; capability checks.
7. Expiry: per-category `expiresAt`; cron to EXPIRE; reminders 7 d / 1 d (events emitted; delivery in Phase 12).
8. View counter (unique viewer per 24 h via Redis/DB; owner excluded).
9. Async duplicate detection job (same phone + identical image hash, or trigram ≥ 0.85) emitting a flag event (consumed Phase 13).
10. Delayed-visibility **hook**: consult moderation config (default OFF) before setting visibility.
11. Domain events: `listing.published|edited|status_changed|expired|sold`.

### Postman tests
- Create listing in 3 categories (car, apartment, solar inverter) with correct dynamic attributes → 201, `status: ACTIVE`, id like `MARBOU-00001`.
- Missing required attribute → 422 with field detail; invalid number range → 422.
- Wanted listing with budget range and no price → 201.
- Edit → `GET /listings/{id}/edits` shows diff; quality score updates.
- Draft → resume from "another device" (different token session) → same draft.
- Rate limit: 6th listing in one hour → 429 `LISTING_RATE_LIMIT`; active cap test using admin-lowered default.
- Mark sold; soft delete → disappears from `GET /me/listings` default view; renew expired (dev job to expire) → ACTIVE again.
- Category posting restricted by admin → 403 with admin message.
- Change attribute to required later → existing listing still readable and editable; first edit prompts missing field (422 with `missingRequired`).
- Unverified-email user posting → 403.

### Exit criteria
Listing visible via `GET /listings/{id}` immediately; `listing.published` event observable in logs; renewal and expiry jobs verified.

---

# PHASE 9 — Search, Discovery, Comparison & Insights (M05)

**Covers:** SRCH-01…19, GEO-08, NFR-PERF-02

### Tasks
1. Normalized-text column + Arabic normalization util (alef/hamza, ya/alef maqsura, ta marbuta, diacritics, basic stemming) + admin **synonyms**.
2. `GET /search`: keyword (trigram + FTS ranking), category, dynamic filters (single/multi/range/bool/date generated from filterable attributes), geo radius + distance sort via PostGIS, sorts, cursor pagination, filtering out non-visible statuses; promoted-column/expression-index path for numeric filters.
3. Ranking = relevance + freshness + quality + engagement; sponsored boost only when monetization flag ON.
4. Suggest/autocomplete, recent searches, search by listing ID, query & zero-result logging.
5. Home feed (banners, category grid, recent, popular, nearby), Nearby, Recommendations.
6. Compare (≤4; Automotive/Real Estate/Electronics) and Price Insights (≥8 comparables, same leaf category + key attributes, currency normalization using Phase 5 rates, stale-rate exclusion, ±15 % labels).
7. Index refresh via `search-index` queue (seconds) on publish/edit/hide/delete.
8. Seed ≥ 1,000 demo listings (dev) and a **load script** (k6/autocannon) for p95 verification at 100k.

### Postman tests
- Arabic variants (e.g. أ/ا/إ, ة/ه) return same results; typo returns fuzzy match.
- Filters: cars by make+year range+price; inverter KVA range; apartments by bedrooms + area; verify result set correctness against seeded data.
- Radius search: listings within 5 km vs 50 km; `sort=distance` ascending.
- Newly created listing appears in search ≤ 10 s; hidden/sold/expired excluded (use dev status setters or Phase 13 routes later → re-run).
- Cursor pagination returns no duplicates across pages.
- Compare 4 vehicles → aligned specs; 5 → 422.
- Price insight returns Below/Fair/Above when ≥ 8 comparables; returns "insufficient data" otherwise; cross-currency comparables excluded when rate stale.
- Zero-result query logged and visible in admin top-queries (SA token).
- Search by `MARBOU-00001` returns the listing.

### Exit criteria
Range filters on promoted attributes meet p95 < 500 ms on the seeded dataset (record results in `docs/perf.md`); Arabic normalization suite passes.

---

# PHASE 10 — Listing Details & Lead Channels (M06)

**Covers:** DET-01…13

### Tasks
1. Details payload: gallery (ordered media), video + poster, specs table from attributes (localized labels), seller card (badges, rating, response indicators), status banners (Sold/Expired/Suspended), similar listings, market-price indicator, breadcrumbs, ID/date/view count; **no phone numbers in payload**.
2. `POST /listings/{id}/contact-reveal`: server-mediated number reveal honoring seller contact options; policy (guests with limit | signed-in only); 20/day per device+IP guest cap; abnormal-volume → fraud signal event.
3. WhatsApp link builder (`wa.me` with admin-editable per-language template containing title, ID, price).
4. Lead events endpoint (chat/WhatsApp/call taps) → counters for dashboards (no PII).
5. OG/SEO data endpoint for server-rendered preview cards; deep-link verification files served (Phase 21 consolidates).
6. Admin: edit WhatsApp template, set reveal policy and caps.

### Postman tests
- Details JSON contains **no** `phone`/`whatsapp` fields anywhere (script scans recursively and fails the test on match).
- Guest reveal ×20 OK, 21st → 429; switch policy to signed-in-only → guest 401, user OK; seller hid phone → reveal returns only allowed channels.
- WhatsApp link contains encoded title/ID/price in `ar` and `en`.
- Lead event increments counters (checked in Phase 18).
- Status banners reflect Sold/Expired after state change.

### Exit criteria
Scripted bulk fetch of detail and list endpoints yields zero seller numbers; reveal caps enforced.

---

# PHASE 11 — Messaging & Negotiation (M07)

**Covers:** MSG-01…14, PROF-07 enforcement, NFR-PERF-05, NFR-REL-03

### Tasks
1. Threads anchored to listing (`unique(listingId,buyerId,sellerId)`); create/list; unread counters; mute; business inbox hook (staff replies, Phase 18 completes roles).
2. Messages: idempotent send (`senderId+idempotencyKey`), image attachments (media refs), delivery receipts (`sentAt/deliveredAt/readAt`), typing indicators.
3. Structured offers: make/accept/reject/counter with `Offer` linked to message; one active offer rule.
4. Socket.io gateway `/chat` (JWT handshake, rooms per thread, Redis adapter), polling fallback endpoint, reconnect-safe delivery (missed messages via `after=`).
5. Anti-spam: per-user/per-recipient throttles, repeated-text and link-spam flagging, banned phrases (admin).
6. System banners on listing sold/expired/removed; block enforcement; report conversation (creates report event for Phase 13); moderator access limited to reported conversations.
7. Push trigger events (`message.new`, `offer.*`) consumed in Phase 12.
8. Quick replies CRUD; Open-in-WhatsApp context link.
9. Response-rate/time computation job feeding profiles (PROF-11).

### Postman tests
- REST: A creates thread on B's listing; send message with `Idempotency-Key`, retry ×3 → exactly **one** message.
- Postman **Socket.IO request** (Postman supports it): two connections, send → receive within 2 s; typing event; delivered/read receipts update timestamps.
- Offer flow: make → counter → accept; final price visible to both; accepting twice → 409.
- Blocked user cannot start a thread or offer (403) while the blocked user can still view the listing.
- Throttle: 21 messages/min → 429; identical text to 3 recipients → flagged (admin flags list in Phase 13).
- Listing marked sold → thread shows system banner message.
- Non-participant fetches thread → 403.

### Exit criteria
Idempotent sends proven; offer state machine verified; receipts visible; reconnect/poll fallback works.

---

# PHASE 12 — Notifications & Communication (M16)

**Covers:** NTF-01…09, NTF-04 triggers wired, NFR-REL-04

### Tasks
1. Device token registry; in-app feed with read/unread; preferences per category and channel.
2. Dispatcher: dedupe + batching, BullMQ retries, failure logging, FCM adapter (mock in dev), email adapter + localized templates (AR/EN).
3. Wire **all NTF-04 triggers** present so far: new message, new offer, listing published/expiring/hidden/suspended, saved search match & price drop (final hookup Phase 14), verification outcome, report outcome; stubs for job/CV/rental/appointment filled in their phases through the same event bus.
4. Transactional emails: OTP, reset, expiry reminders, account events.
5. Admin broadcast composer (audience: all/role/city/category interest; scheduling; delivery stats).

### Postman tests
- Register device token; trigger a message → push mock log + in-app entry within 5 s when recipient not in thread; no push if recipient is active in thread (simulate presence).
- Preferences: disable push for messages → no push, in-app remains if configured.
- Expiry reminders: dev-run `expiry` job for a listing set to expire in 7 d/1 d → notifications created once (dedupe).
- Broadcast to `city=Khartoum` with schedule → delivered only to matching users; stats endpoint shows counts.
- Language: Arabic user receives Arabic text.

### Exit criteria
Notification pipeline resilient (failures retried and logged); localization verified.

---

# PHASE 13 — Trust, Safety, Moderation & Reviews (M15)

**Covers:** TRS-01…18, PROF-12 (avatar scan), ADM-05, JOB-21 (hook), DET-13 fraud signals

### Tasks
1. **Scan pipeline**: banned keywords, blacklisted phones/emails/devices, duplicate image pHash, duplicate text, **classifier adapter** (TRS-16), pHash blacklist seeded from named source loader (TRS-17); scans triggered by `listing.published|edited`, avatar uploads.
2. **Fraud score** (0–100) from signals: rapid listing rate, duplicates, new-account behavior, suspicious pricing, abnormal contact-reveal volume, receipt fraud flags; thresholds from defaults (alert 70, rate-limit 80, auto-hide 85).
3. **Auto-hide**: ≥5 distinct reporters/24 h or score ≥85 ⇒ `AUTO_HIDDEN` (distinct from moderator `HIDDEN`), owner notified; never blocks initial publication.
4. **Delayed-visibility mode (TRS-15)**: config per category × trust tier; OFF everywhere by default; when ON, hold listing until scan completion/moderator release.
5. Reports (listing/user/review/conversation) with priority queue; moderator actions edit/hide/suspend/restore/delete with mandatory reason code + owner notification; appeals + decision queue + notifications.
6. Blacklist CRUD; user suspend/ban with reason & duration (reuses Phase 4).
7. **Reviews & ratings**: qualifying-interaction logic (TRS-08) — chat thread with ≥2 messages from each party now; rental/appointment/hotel contexts plug in via the same `ReviewEligibility` interface in Phases 15/16; one review per interaction; seller responses; reports; rating averages auto-update (profile fields).
8. Trust & Safety Center content endpoint; JOB-21 scam-pattern scanner registered for Jobs category (activated in Phase 17).
9. Admin live feed (new listings stream) via `/admin` socket + REST.
10. All moderation actions audited with reason codes.

### Postman tests
- Publish listing with banned keyword → listing **stays ACTIVE** but appears in flagged queue ≤ 1 min.
- 5 distinct users report → status `AUTO_HIDDEN`; absent from search; owner still sees it with reason; moderator restores.
- Duplicate-image listing from same account → flagged duplicate.
- Mock classifier returns "nsfw" → flagged; classifier down → listing still publishes; flagged "scan_failed".
- Fraud score threshold behaviours: rapid posting → alert at 70, rate-limit at 80 (use dev signal injector).
- Moderator hides with no reason → 422; with reason → owner notified; appeal → admin decides → user notified; audit entries present.
- Enable delayed visibility for Jobs category → new listing from new account is held; release → visible; disable → instant again.
- Reviews: after chat with 2+ messages each → review allowed; second review for same thread → 409; third party → 403; seller reply works; rating average updates on `GET /users/{id}`.
- Admin-role matrix retest (MOD allowed, FIN/SUP blocked on moderation).

### Exit criteria
Post-moderation workflow works with instant publication preserved; delayed mode toggle works and defaults OFF; audit complete.

---

# PHASE 14 — User Dashboard, Favorites, Saved Searches, Data Rights (M22)

**Covers:** DASH-01…08, SRCH-09, NTF saved-search/price-drop triggers, PROF-08, TRS-12 (erasure compat), NFR-PRV-02

### Tasks
1. Favorites (with `priceAtSave`), price-drop & status-change notification events.
2. Saved searches (filters JSON, alert frequency) + matcher job on new listings → notifications.
3. `GET /me/dashboard` aggregating listings, drafts, favorites, saved searches, applications, rentals, appointments, notifications, reviews (modules that don't exist yet return empty arrays but keep the shape).
4. Listing performance summaries (views/favorites/chats/WhatsApp taps).
5. **Data export**: BullMQ builds structured JSON (profile + activity), status endpoint, signed URL download.
6. **Account deletion**: re-auth + email confirmation → `PENDING_DELETION`, 30-day grace (configurable), cancel allowed; purge job anonymizes chat/review authorship, removes CVs/docs/contact data, leaves audit chain intact (pseudonymous IDs).
7. Deactivate/reactivate account.

### Postman tests
- Favorite → lower price via owner edit → price-drop notification created.
- Saved search → publish matching listing → notification; non-matching → none.
- Export: request → poll until `READY` → download JSON contains profile & activity; includes no other users' private data.
- Deletion: request (wrong password → 403) → grace state; cancel → ACTIVE; accelerate via dev clock/job → data anonymized; `GET /admin/audit-logs/verify-chain` still `valid:true`; login impossible.
- Deactivate → listings hidden from search; reactivate → restored.

### Exit criteria
Users self-serve export/deletion; audit chain verifies after erasure.

---

# PHASE 15 — Automotive Vertical: Rentals & Service Appointments (M08)

**Covers:** AUTO-01…21 (seeded categories already done in Phase 6)

### Tasks
1. **Rental requests**: create (dates, driver option, pickup, notes), owner accept/decline/counter, renter cancel, complete; status set `REQUESTED|ACCEPTED|DECLINED|COUNTERED|CANCELLED|COMPLETED`; **terms snapshot** stored; notifications; review eligibility context `RENTAL` (Accepted→Completed).
2. **Service provider profile**: services, rates, working hours, slot duration, capacity per slot; slot generation + availability endpoint.
3. **Appointments**: book (service type, vehicle details, issue, diagnostic images), transactional capacity enforcement (no overbooking), provider confirm/decline/propose time/complete/no-show, user cancel/reschedule within provider rules, **user completion confirmation or 72 h lapse** → review window opens (lifecycle job); reminders at 24 h and 2 h (push, email fallback).
4. Towing/diagnostics attributes via EAV (already seeded) + optional live-location tag field; vehicle ownership documents (private; staff-only).
5. Support/admin lookups of rentals and appointments.
6. Comparison/filters for vehicles already served by Phase 9 — add regression tests for AUTO-06/07.

### Postman tests
- Renter submits rental request; owner receives notification; accept → status change; renter cannot edit snapshot; owner edits listing rates after request → snapshot unchanged.
- Fully book a slot (capacity 2) with 3 concurrent-style requests (Postman runner with 3 users) → third gets 409 `SLOT_FULL`.
- Provider marks Completed → no review yet; user confirms (or dev job lapses 72 h) → review allowed; review before → 403.
- Reminders: dev-run lifecycle job at T-24h/T-2h → notifications.
- Vehicle docs not accessible publicly; SUP can view.
- Vehicle filters (make/model/year/mileage/transmission/fuel/duty-paid/spec/price) return correct sets; compare 4 vehicles.

### Exit criteria
Rental request < 2 min via API; no double-booking possible; review gating works.

---

# PHASE 16 — Real Estate, Hotels & Furnished Accommodation, Equipment & Solar, General Goods (M09, M11, M12, M13)

**Covers:** RE-01…12, HOT-01…08, EQP-01…08, GEN-01…11

### Tasks
1. **Real estate**: transaction types (sale/rent/wanted-buy/wanted-rent), rent periods, area unit conversion & price/m², approximate-location radius (exact coords never public), `PropertyProject` extension (developer, stage, completion, unit types, starting price, brochure PDF), floor-plan media type, agent/agency profile + active counters, compare ≤4, Wanted postings.
2. **Accommodation**: inquiries (dates, guests, message) → host notification; host availability blocks; **Confirmed Stay** (host) + guest dispute → review eligibility `HOTEL_INQUIRY`; filters (price/night|month, amenities, capacity, rating). ⚑ **Reservation engine** (Appendix B: Requested/Confirmed/Cancelled/Completed; overlap prevention; no payment) behind `hotel.reservations`.
3. **Equipment & solar**: verify promoted indexes & specialized filters (inverter KVA, battery chemistry, panel wattage, installation included); installation/delivery/warranty flags.
4. **General goods**: verify livestock/crop/fashion/etc. schemas and filters. ⚑ **Wholesale** (MOQ + tiered price; Appendix B) behind `wholesale.enabled`.

### Postman tests
- Post Villa For Sale and Wanted-to-Rent apartment via same engine; search + compare.
- Area filter in sq ft vs sq m returns consistent results; price per m² computed.
- Approx-location listing: public payload has radius-obscured coordinates; owner sees exact.
- Inquiry → host sees it → Confirmed Stay → guest can review; review before confirmation → 403; guest dispute path.
- Reservation engine OFF → 404 `FEATURE_DISABLED`; ON in staging flag → overlapping dates → 409; OFF again.
- Inverter KVA & battery chemistry filters return only matching listings.
- Livestock listing shows breed/weight/health tags; wholesale OFF hides tier fields; ON validates MOQ.

### Exit criteria
All vertical acceptance criteria in PRD §7.9, 7.11, 7.12, 7.13 pass via Postman.

---

# PHASE 17 — Jobs, Candidate Profiles & CV Builder (M10)

**Covers:** JOB-01…21, ADM-07, NTF job/CV events, NFR-PRV-03

### Tasks
1. Employer job CRUD (title, category, type, salary range optional, location, requirements, benefits, deadline, screening questions); expiry/renew; Verified Employer badge; JOB-21 scam-pattern scan (upfront fee, off-platform payment, messaging-only contact) + optional delayed visibility.
2. **Candidate profile** (Tier B): personal info, driving/transport, education[], experience[], skills, languages (NATIVE/FLUENT/INTERMEDIATE/BASIC), certificates (private), CV upload; documents delete anytime; encrypted at rest; never public.
3. **Apply**: Quick Apply (name, phone, email, city + optional photo/summary/PDF) and Full Profile; `JobApplication.snapshot` shares data for that job only; one application per job; 20/day limit; withdraw; status updates → notifications.
4. **Employer dashboard**: applicants list/filter, statuses (SUBMITTED/VIEWED/SHORTLISTED/INTERVIEW/REJECTED/HIRED), notes; **signed URLs scoped to the application** (≤5 min).
5. **Create-CV-for-me**: step-by-step payload → `CvBuildRequest` (`PENDING→IN_PROGRESS→DELIVERED→REVISION_REQUESTED→APPROVED`), Support queue (assign, structured JSON view, deliver PDF in-app, revision handling), candidate approve/request revision; in-app CV builder export PDF with selectable layouts.
6. Job alerts (category/location/keywords) + matcher job.

### Postman tests
- Quick Apply with minimal fields → success in a single call; duplicate apply → 409; 21st application/day → 429.
- Employer B tries to open candidate A's document without A applying to B's job → **403**; after applying → signed URL works then expires.
- Public/search endpoints never expose candidate data.
- CV flow: candidate submits → SUP assigns → delivers → candidate requests revision → redelivers → approves; each transition valid only from the right state (invalid → 409).
- Scam-pattern job text → flagged to moderators.
- Job alert triggers notification on matching new job.
- Withdraw application; employer status change notifies candidate.

### Exit criteria
Privacy guarantees proven by negative tests; CV queue lifecycle matches enum exactly.

---

# PHASE 18 — Companies, Stores & Business Dashboard (M14)

**Covers:** BIZ-01…09, LST-15, MSG-11, MSG-13

### Tasks
1. Business profile (logo, cover, hours, location, channels, verification), catalog listing, shareable storefront link metadata.
2. Staff invites with roles Manager/Editor/Support, scoped to the business; business-scoped permission guard.
3. `BusinessMetricDaily` rollup job (views, unique viewers, lead events: chat/WhatsApp/call, conversion, top listings, search impressions, audience location summary — **aggregated only**).
4. Dashboard endpoints with date ranges; CSV export.
5. Shared business inbox + staff replies; quick replies; bulk listing actions (completes LST-15).
6. Verified Business badge flow via verification queue (Phase 4).

### Postman tests
- Owner invites staff; staff Editor can edit listings but cannot invite; staff of business X cannot access business Y (403).
- Generate leads (Phase 10 lead events) → dashboard counts match after running the rollup job.
- CSV export downloads with correct headers.
- Staff replies from business inbox; customer sees reply from the business.
- Dashboard payload contains no individual viewer identifiers.

### Exit criteria
Business scope isolation proven; metrics reconcile with raw events.

---

# PHASE 19 — Payments, Bankak Manual Verification & Ledger (M17)

**Covers:** PAY-01…13, TRS-05 (receipt fraud signal), ADM-08, NFR-REL-03

### Tasks
1. Payment ledger (`Payment`, `LedgerEntry`, `Receipt`, `Invoice`), state machine `PENDING→APPROVED|REJECTED→REFUNDED`, currency per transaction, no silent conversion.
2. User flow ⚑ `payments.bankak_user_flow`: submit reference + receipt (private bucket), idempotent; duplicate reference / duplicate receipt hash ⇒ fraud flag.
3. Admin Verification Console API: pending/approved/rejected lists with user context, signed receipt URL (for zoom/pan/rotate client), **approve (activates the related service via event + issues sequential invoice)** / **reject (mandatory reason)**; only FIN & SA; CSV export; every state change audited.
4. Invoices: sequential numbering, downloadable PDF.
5. ⚑ Refunds/reversals as ledger entries with reasons.
6. `PaymentGateway` abstraction + Bankak-manual adapter; environment rule: **staging seeds flag ON, production OFF**.

### Postman tests
- With flag OFF: `POST /payments/bankak` → 404 `FEATURE_DISABLED`; admin queue endpoints still reachable (empty).
- Flag ON: submit → appears in pending immediately; approve → invoice issued, related-service event fired (visible in log/test consumer); reject without reason → 422; reject with reason → user push.
- Same reference reused / same receipt image reused → flagged as receipt fraud.
- MOD/SUP tokens → 403 on approve/reject; FIN allowed.
- Retry submit with same `Idempotency-Key` → single payment.
- Refund (flag ON) creates reversing ledger entry; totals reconcile.

### Exit criteria
Queue testable end-to-end in staging config; audit complete; invoice numbers sequential with no gaps under concurrent approvals.

---

# PHASE 20 — Monetization & Feature-Flagged Engines (M18, Appendix B)

**Covers:** MON-01…14, GEN-11/HOT-08 (already built), MON-11 AdMob

### Tasks (build each engine to **Appendix B only**, behind flags)
1. `ENABLE_MONETIZATION` master gate: when false, all pricing/paywall endpoints return `FEATURE_DISABLED` and listing payloads omit promotion badges; client config reports false.
2. **Subscriptions** (plans monthly/yearly, quota enforcement on posting, expiry/renewal job, cancel-at-period-end).
3. **Promotions** (featured, top-boost, badge, banner slot; schedule; impressions/clicks) feeding search ranking only while active.
4. **Credits** (ledger, spend rules, no negative balance, admin adjust) and **paid boosts/badges** (time-boxed, per-country pricing).
5. **Auctions** (start/end/reserve/increment, atomic bids, winner job, notifications).
6. **Barter** (proposals, accept/reject/counter, reserve both listings, open chat).
7. **Asset rental** (availability + terms snapshot, request flow, no payment).
8. **Order & cart** (Created/Confirmed/Fulfilled/Cancelled; seller confirms; no online payment).
9. **Delivery** (zone fee matrix, tracking states, courier port + mock).
10. **AdMob** config via remote config; hidden when OFF.
11. Per-country pricing/plans/gateway availability (Phase 5 country settings).
12. Admin CRUD for plans/promotions/zones; per-engine toggles with audit.

### Postman tests (run each engine with flag OFF then ON)
- OFF: every engine endpoint → `FEATURE_DISABLED`; `GET /config` shows engines disabled; no promotion badge in search payloads.
- ON: subscription quota blocks the N+1 listing; promotion boosts ranking only within its window; credits cannot go negative (409); two simultaneous bids → atomic highest wins; auction end job selects winner/reserve not met handled; barter acceptance reserves both listings; cart→order transitions valid only in order; delivery fee matches zone matrix; courier mock tracking transitions.
- Toggling flags takes effect ≤ 60 s without restart; audited.

### Exit criteria
Every engine meets its Appendix B row and is hidden when OFF; no cross-engine regression in search/listing endpoints.

---

# PHASE 21 — Content, Help Center, Legal, SEO & Deep Links (M23)

**Covers:** CMS-01…09, SRCH-10 (banners), ADM-12, LOC-08

### Tasks
1. Help Center/FAQ CRUD (Ar/En); static pages; announcement banners; home banners with schedule + language/country targeting.
2. **Legal docs** versioned with effective date and acceptance tracking (`POST /legal/{type}/accept`).
3. Support ticket entry + admin ticket handling (SUP/SA) with notes and rental/appointment lookups.
4. SEO data: server-rendered preview payloads (OG tags, canonical, structured data JSON-LD) for listings/business/job/category; **sitemap.xml** generation (cached, chunked), robots.txt.
5. Deep-link files: `apple-app-site-association`, `assetlinks.json` (configurable from env).
6. **Public account-deletion information/request page data** (`GET /public/account-deletion`, request path routed to Phase 14 flow) (CMS-09).

### Postman tests
- Publish legal v2 → `GET /legal/privacy` returns v2 with effective date; acceptance recorded.
- Banner scheduled in future not returned; targeted to `ar`/`SD` only.
- Sitemap includes new listing within the refresh interval; excludes hidden/expired.
- OG endpoint for a listing returns title/description/image and JSON-LD.
- Deep-link files return valid JSON with correct content-type.
- Ticket created by user visible to SUP; MOD denied.

### Exit criteria
Content, legal and SEO assets manageable by admin with no release; store-compliance endpoints reachable without authentication.

---

# PHASE 22 — Analytics, Reporting & Admin Consolidation (M25, M24)

**Covers:** ANL-01…06, ADM-01, ADM-20/21/22, M24 acceptance

### Tasks
1. Consent-aware anonymized event ingest (sessions, searches, views, favorites, leads, applications, requests, posting-funnel steps).
2. Aggregations/jobs: retention, active users, listings by category, search trends, zero-result queries, conversion, **posting funnel drop-off**, Other-entry analytics; scheduled + on-demand CSV exports.
3. Admin KPI endpoint + live counters via `/admin` socket (new users, listings, active chats, open reports, pending verifications, pending payments).
4. System health endpoint (uptime, error rates, queue depth, DB/cache metrics).
5. Support tools: impersonation-free user context view, ticket notes, rental/appointment lookups.
6. Review of the admin RBAC matrix: complete route-by-route permission test suite.

### Postman tests
- Post analytics batch → aggregates visible after job run; payload containing PII fields rejected (422).
- Funnel report shows step counts consistent with test activity.
- KPIs match counts from underlying tables.
- Matrix suite: for each admin route × each role, expected 200/403 table passes (one Postman folder generated from the matrix).
- CSV export content-type and header row validated.

### Exit criteria
Admin acceptance criteria in PRD §7.24 pass: Moderator cannot reach finance/flags/EAV; Finance cannot alter audit/roles; config changes show before/after in audit log.

---

# PHASE 23 — Operations, Retention, Hardening & Handover (M26)

**Covers:** SYS-09…16, NFR-SEC-*, NFR-PERF-*, NFR-REL-*, NFR-QA-*, NFR-MNT-*, Appendix D

### Tasks
1. **Retention engine** implementing Appendix D (chat 24 mo, analytics 13 mo, login/sessions 12 mo, OTP 24 h, job applications 12 mo after closure, verification docs 90 d after decision, listings soft-deleted 90 d then purge, payments/audit 7 yr, deleted accounts per Phase 14); every run recorded in `JobRun`; dry-run mode.
2. **Backups**: automated daily snapshots to off-site object storage, documented restore procedure, executed **restore test** with evidence.
3. **Performance**: load tests (k6) against NFR targets — cached reads p95 < 300 ms (median < 100 ms), search p95 < 500 ms @100k listings with promoted filters, listing submit p95 < 800 ms, chat < 2 s; 3G-profile checks for payload sizes; document in `docs/perf.md`.
4. **Security review**: OWASP checklist, authorization/IDOR sweep of every `{id}` route, rate-limit audit, key-restriction review (NFR-SEC-11), dependency scan, secrets scan, CORS/CSP/headers.
5. **Resilience drills**: Maps cap hit, FCM down, classifier down, email down, Redis restart, message/upload retry idempotency — core browsing/posting must continue.
6. Monitoring: Sentry, uptime checks, queue-backlog/Maps/exchange-rate alerts (NFR-OBS-02).
7. **Handover package**: README (clean-clone run), `.env.example`, docker-compose, Prisma migrations (incl. hand-written SQL), Swagger specs, runbooks, architecture docs, store-account/signing-key/Firebase transfer checklist (SYS-16), integration cost responsibilities table.
8. Final regression: run the whole Postman collection (`ZZ Smoke` + every phase folder) in CI via Newman against staging; fix residual defects.

### Postman / verification
- Newman run of the full collection: 0 failures.
- Retention: seed expired data → `POST /dev/jobs/run/retention` → purged per schedule; `JobRun` row present; audit chain valid.
- Chaos drills documented with outcomes.
- Fresh-clone test: `git clone` → `docker compose up` → seed → Postman smoke passes.

### Exit criteria
All NFR targets recorded as met (or deviations documented), restore test evidence stored, handover checklist complete.

---

## Appendix — Requirement Coverage Map (quick check)

| Module | Phase(s) | Module | Phase(s) |
|---|---|---|---|
| M01 Auth | 3 (+2 admin) | M14 Business | 18 |
| M02 Profiles | 4 | M15 Trust & Safety | 13 |
| M03 EAV | 6 | M16 Notifications | 12 |
| M04 Listings | 8 | M17 Payments | 19 |
| M05 Search | 9 | M18 Monetization | 20 |
| M06 Details | 10 | M19 Media | 7 |
| M07 Messaging | 11 | M20 Maps/Geo | 5 |
| M08 Automotive | 6 (schema), 15 | M21 Localization/Currency | 5 |
| M09 Real Estate | 6, 16 | M22 Dashboard/Data rights | 14 |
| M10 Jobs | 17 | M23 Content/SEO | 21 |
| M11 Hotels | 16 | M24 Admin | 1, 2, 22 |
| M12 Equipment | 6, 16 | M25 Analytics | 22 |
| M13 General Goods | 6, 16 | M26 Platform/Ops | 0, 1, 23 |

**Order of acceptance within each phase:** schema/migration → service logic + events → controllers + guards → audit/admin controls → unit/e2e tests → Postman requests + Tests-tab scripts → regression run → mark phase complete.
