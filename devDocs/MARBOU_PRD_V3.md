# MASTER PRODUCT REQUIREMENTS DOCUMENT & SYSTEM ARCHITECTURE

# MARBOU

**Next-Generation Enterprise Multi-Vertical Marketplace Platform**
Functional Requirements • Non-Functional Requirements • Module-Wise Specification

**Code Club (SMC-Private) Limited** — Office 50, 2nd Floor, Liberty Mall, University Road, Opp Airport Runway, Peshawar • +92-314-1334484 • https://codeclub.tech/ • info@codeclub.tech

| Item | Detail |
|---|---|
| Document Reference | MARBOU-PRD-2026-V3 (corrected revision of MARBOU-PRD-2026-V2) |
| Date | October 12, 2026 (V2 dated October 4, 2026) |
| Status | **DRAFT FOR CLIENT REVIEW.** Changes against V2 are tagged **[V3]** and listed in Appendix A. |
| Related Agreement | MARBOU-AGR-2026-FINAL-M176 (Annex A is the contractual scope; the Agreement prevails in any conflict) |
| Prepared By | Code Club (SMC-Private) Limited — Abdullah Qureshi, CEO |
| Prepared For | Ahmed Musa, Founder, Sayaratak & Project Owner, MARBOU |
| Target Platforms | iOS & Android (React Native CLI), Web (Next.js App Router), Admin Control Dashboard |
| Architecture Pattern | Multi-tenant modular monolith with shared core library (@ahmed-org/marketplace-core), EAV dynamic schema engine, Node.js/NestJS API, PostgreSQL, Socket.io, Redis |

> **How to read the [V3] tag.** **[V3-FIX]** corrects an error or contradiction in V2. **[V3-CLARIFY]** makes an ambiguous requirement testable without changing its intent. **[V3-ADD]** adds a requirement that V2 implied or omitted; additions that may exceed Annex A are flagged in Appendix A for Change Request review. Where this PRD and the Agreement differ, the Agreement prevails.

---

## Table of Contents

1. Introduction & Scope
2. Product Overview, Goals & Personas
3. System Architecture
4. Dynamic EAV & Engine Architecture
5. User Roles & Permission Matrix
6. Key User Journeys
7. Functional Requirements — Module by Module (M01–M26)
8. Non-Functional Requirements
9. Data Model & Entity Architecture
10. API & Integration Specification
11. Launch Configuration Matrix
12. Delivery Plan, Testing & Definition of Done
13. Out of Scope, Assumptions, Dependencies, Risks & Open Decisions
14. Traceability Matrix (Annex A Sections 1–114)
- Appendix A — Corrections Register (V2 → V3)
- Appendix B — Minimum Acceptance Bar for Flag-OFF Engines
- Appendix C — Configurable Defaults Register
- Appendix D — Data Retention Schedule

---

# 1. Introduction & Scope

## 1.1 Purpose

This Product Requirements Document (PRD) defines what MARBOU is, who it serves, and exactly what it must do. It specifies every functional requirement, every non-functional requirement, and the full feature set of each module, together with the system architecture and data model needed to build them. It is the working engineering and acceptance reference for the Master Agreement MARBOU-AGR-2026-FINAL-M176. Annex A of the Agreement is the contractual scope; where this PRD and the Agreement differ, the Agreement prevails.

## 1.2 Product Scope

MARBOU is an all-in-one open marketplace engine for the Sudanese market, structured for regional expansion across North/East Africa and the Middle East. It unifies buying, selling, renting, equipment sourcing, job recruitment, accommodation inquiry, livestock and agricultural commerce, real estate, and automotive services in a single ecosystem delivered through five deliverables:

- **Mobile applications:** native cross-platform iOS and Android apps (React Native CLI).
- **Web application:** Next.js App Router site with server-side rendering for SEO and link previews.
- **Admin Dashboard:** a secure Next.js control panel for operators, moderators, support and finance staff.
- **Backend platform:** NestJS REST API, Socket.io real-time layer, PostgreSQL, Redis, media pipeline and background workers.
- **Shared core package:** @ahmed-org/marketplace-core, consumed by both MARBOU and Sayaratak, with fully isolated databases.

## 1.3 Intended Audience

Project owner and stakeholders (scope confirmation and UAT), Code Club engineering (design, build, test), and any future third-party team taking over the codebase after handover.

## 1.4 Document Conventions

- **Requirement IDs:** each requirement has a stable ID of the form PREFIX-NN (for example AUTH-05). Non-functional requirements use NFR-CATEGORY-NN. IDs are never reused; requirements added in V3 take the next free number in their module.
- **Keywords:** "must" denotes a mandatory requirement; "should" denotes a strong recommendation; "may" denotes an option.
- **Launch column:** "Active" means live and visible at initial release. "Flag OFF" means fully built in backend, database and admin controls, but hidden or disabled by default and switchable by the Admin without a release.
- **Targets:** numeric targets in this document are engineering targets, measured in staging and production monitoring, not service-level guarantees.
- **Defaults:** every threshold, cap and limit named in this PRD has a default value in Appendix C. Defaults are admin-configurable at runtime unless stated otherwise. **[V3-CLARIFY]**

## 1.5 Definitions

| Term | Meaning |
|---|---|
| EAV | Entity-Attribute-Value: a schema pattern where category-specific fields are defined as data, so new fields need no database migration or app release. |
| Listing | Any posted item, property, vehicle, service, job or accommodation offer. A Wanted listing is a buyer or tenant request. |
| Post-moderation | Listings publish instantly; review, reports and admin action happen after publication. |
| Auto-hide | A temporary, automatic, post-publication hide triggered by report volume or risk score; it never delays initial publication. **[V3-CLARIFY]** |
| Feature flag | A runtime switch in the Admin Dashboard that enables or disables a module without code deployment. |
| OTP | One-time passcode used to verify an email address (and, when enabled, a phone number). |
| Bankak | Bank of Khartoum mobile banking transfers, handled through a manual receipt verification queue. |
| Quick Apply / Full Profile | The two job application tiers: zero-friction application versus a complete candidate profile with CV. |
| Capability | A role-like ability (Seller, Dealer, Employer, Service Provider, Candidate) held by a single user account. A user may hold several at once. **[V3-CLARIFY]** |
| Admin account | A separate staff account (AdminUser) with mandatory two-factor authentication and exactly one admin role. **[V3-CLARIFY]** |
| RBAC | Role-Based Access Control, including admin sub-roles. |
| UAT | User Acceptance Testing performed by the client on a live test environment. |
| SDG / USD | Sudanese Pound and US Dollar, supported natively as listing currencies. |
| MOQ | Minimum order quantity, used by the wholesale engine (Flag OFF). |
| Core | The shared package @ahmed-org/marketplace-core. |

---

# 2. Product Overview, Goals & Personas

## 2.1 Vision

"Everything you need, you can find inside MARBOU." MARBOU brings all vertical trade into one fast, safe, organized, Arabic-first ecosystem built for variable-network conditions, with a Golden Rule of being production-ready for every user need.

## 2.2 Product Goals

1. **Unify trade:** one account, one search, one chat across vehicles, real estate, jobs, equipment, livestock, accommodation, services and general goods.
2. **Reduce friction:** listing goes live instantly; Quick Apply for jobs; WhatsApp one-tap leads; email, Google, Facebook and Apple sign-in at launch.
3. **Stay flexible without releases:** categories, attributes, video limits, OTP channels and monetization are all admin-controlled at runtime.
4. **Build trust:** verification badges, reports, automated scanning, duplicate and fraud detection, audit logs and verified reviews.
5. **Work in constrained networks:** client-side compression, WebP delivery, thumbnails scaled to connection speed and Data Saver Mode.
6. **Own the code:** repositories live in the client GitHub account from day one with Docker, Prisma migrations and Swagger docs for independent maintenance.

## 2.3 Indicative Success Metrics

These KPIs are baselined after launch and used to guide post-launch tuning. They are not contractual commitments.

| Metric | Indicative Target |
|---|---|
| Listing creation completion rate (started to published) | 60% or higher |
| Median time to publish a listing | Under 3 minutes |
| Search zero-result rate | Under 10% of queries |
| Listing contact rate (chat, WhatsApp or call per detail view) | 5% or higher |
| Report-to-action resolution time (admin) | Under 24 hours for 90% of reports |
| App crash-free sessions | 99% or higher |
| Day-30 user retention | Tracked and trended; target set after baseline |

## 2.4 Target Users & Personas

| Persona | Description | Primary Needs |
|---|---|---|
| Buyer / Browser | Anyone searching for items, vehicles, homes, jobs or services | Fast search, trustworthy listings, easy contact via WhatsApp or chat |
| Individual Seller | A person selling or renting a single item or property | Quick posting, price guidance, instant publishing, renewal reminders |
| Dealer / Business | Showrooms, shops, agencies and companies with inventory | Verified storefront, staff accounts, analytics, bulk management |
| Job Seeker | Candidate looking for work, often without a CV | Quick Apply, in-app CV builder, privacy of documents, status tracking |
| Employer | Company or individual hiring | Job posting, candidate queue, shortlisting, verified employer badge |
| Service Provider | Workshop, towing operator, diagnostics, freelancer | Service profile, appointment scheduling, reviews |
| Property / Hotel Owner | Landlord, agent, hotel or furnished-apartment host | Rich property listings, inquiries, amenity display |
| Farmer / Livestock Trader | Seller of livestock and agricultural produce | Breed, weight and health tags, bulk quantities |
| Admin / Moderator / Finance / Support | Platform operators with scoped permissions | Control without developers: categories, flags, moderation, payments, support |

---

# 3. System Architecture

## 3.1 Architectural Vision

MARBOU is a high-performance, scalable, multi-vertical marketplace built for variable-network environments, including low-bandwidth regions. The platform targets sub-100ms API response latency on cached reads, real-time lead propagation, and complete dynamic schema extensibility without client-side updates.

## 3.2 Core Technology Stack

1. **Mobile Application:** React Native CLI (TypeScript), React Navigation v6, Zustand + TanStack Query v5, MMKV (fast local key-value storage), React Native Reanimated, Gesture Handler, Socket.io-client. **[V3-FIX]** State boundaries are fixed to avoid three competing stores: *TanStack Query* owns all server state (caching, optimistic updates); *Zustand* owns small UI and session state; *MMKV* is the persistence layer for drafts, preferences and the schema cache. Redux Toolkit is **not** used unless a specific complex-local-state need is approved at design sign-off and documented.
2. **Web Portal:** Next.js (App Router, server-driven UI patterns), Tailwind CSS, Lucide Icons, Shadcn UI base components, Framer Motion.
3. **Backend API Layer:** Node.js / NestJS (TypeScript), **Prisma ORM** **[V3-FIX]** (V2 listed "Prisma ORM / TypeORM"; Prisma is selected because handover assets assume Prisma migrations), Redis (cache-aside, session invalidation, rate-limiting, Pub/Sub, job queues), Socket.io with WebSocket transport fallback.
4. **Database Layer:** PostgreSQL with partitioned listing tables, PostGIS spatial indexes for proximity queries, trigram indexes for fuzzy text search, GIN indexes on JSONB dynamic attributes, and expression or promoted-column indexes for hot numeric attributes (see SRCH-19). **[V3-CLARIFY]** Prisma does not natively model PostGIS, partitioning, trigram or GIN indexes; these are delivered as hand-written SQL migrations kept in the same Prisma migration history and use `Unsupported()` column types.
5. **Media & Storage:** AWS S3 / Cloudflare R2 object storage with zero-egress CDN distribution, sharp.js image optimization (WebP/AVIF), chunked video upload parser, and server-side video transcoding (ffmpeg worker). **[V3-ADD]**
6. **Shared Core Package (@ahmed-org/marketplace-core):** strictly typed package with shared TypeScript interfaces, Zod validation schemas, EAV type definitions, API response wrappers, currency and pricing formatters, global event contracts, authentication, S3 upload adapters, Socket.io chat engine and FCM push wrappers.

## 3.3 Logical Architecture

- **Client tier:** React Native apps and Next.js web; both render category forms from schema JSON.
- **API gateway tier:** NestJS REST API with OpenAPI/Swagger, global validation, rate limiting, RBAC guards and structured error codes.
- **Domain services:** auth, users, categories/EAV, listings, search, messaging, jobs, appointments, rentals, notifications, payments, moderation, media, admin and analytics modules inside the modular monolith.
- **Real-time tier:** Socket.io namespaces for chat and live admin counters, with Redis adapter for horizontal scaling.
- **Async tier:** Redis-backed job queues for scanning, expiry, notifications, media cleanup, transcoding and exports.
- **Data tier:** PostgreSQL primary store, Redis cache, S3/R2 for media and private documents.
- **Integration layer:** payment, notification, content-classification, maps-proxy and core functions are separated behind adapters so providers can be swapped without touching business logic. **[V3-CLARIFY]**

## 3.4 Listing Data Flow

Category selection, then dynamic schema fetch, then form completion with media and location, then immediate publication, then asynchronous automated scanning, then indexing for search and notification of watchers. There is no blocking approval step; moderation is post-publication. Auto-hide and moderator action may remove a listing from view after publication. Per-category or per-trust-tier delayed visibility is an optional, admin-controlled mode that is OFF by default (see TRS-15). **[V3-CLARIFY]**

## 3.5 Repositories, Environments & Ownership

- **Repositories:** sayaratak-app, marbou-app and marketplace-core, hosted in the client GitHub account with the client holding root administrative ownership from Day One.
- **Database isolation:** marbou-app connects only to marbou_db and sayaratak-app only to sayaratak_db. No cross-database queries or shared runtime state.
- **Versioning:** core updates are published as package versions and consumed through standard version bumps.
- **Environments:** Development, Staging (live UAT environment) and Production, each deployed by GitHub Actions pipelines.
- **Handover readiness:** Prisma migration scripts, Swagger specifications, .env.example and docker-compose.yml so any team can run the stack independently.
- **Store accounts and signing assets:** the Apple Developer account is owned by the Client. The Google Play Console account is registered by Code Club; at handover the Play app, signing keys (Play App Signing) and the Firebase project must be transferred to Client-owned accounts. Account type (organization versus personal) and Play testing prerequisites are confirmed in Milestone 1. **[V3-FIX]**
- **Hosting scope:** API, PostgreSQL, Socket.io, Redis, SSL and daily backups are hosted under the agreed allocation for the first 8 months post-launch. The allocation and its limits are stated in the Agreement; Section 13.5 requires a cost model to be shared at Milestone 2. **[V3-CLARIFY]**

---

# 4. Dynamic EAV & Engine Architecture

## 4.1 Hybrid Relational + JSONB/EAV Schema

To avoid database migrations whenever a category or field is introduced, MARBOU uses a hybrid architecture: relational tables for stable entities, and category-defined attributes stored as validated JSONB payloads described by a meta-registry.

1. **Category Hierarchy Engine:** infinite nested parent-child category tree through a self-referencing parent_id.
2. **Dynamic Attributes Meta-Registry:** each attribute defines attribute_key, English and Arabic labels, data_type (TEXT, NUMBER, BOOLEAN, SINGLE_SELECT, MULTI_SELECT, DATE, RANGE, FILE_URL), is_required, is_filterable, is_searchable, is_archived, promote_to_index, validation_rules (min, max, regex) and options_list. **[V3-FIX]** (archive and index-promotion fields were missing).
3. **Global "Other" Fallback Engine:**
   - Every main category and subcategory enforces a system-level "Other" option in UI pickers.
   - Selecting "Other" reveals a text input (custom_attribute_entry) where the seller types the item, vehicle or service name.
   - From analytics and flags the Admin can promote a popular "Other" entry into an official attribute or subcategory in one click.
4. **Zero-App-Update Schema Hydration:**
   - On app launch or category selection the client fetches the category schema JSON, versioned with an ETag so unchanged schemas are not re-downloaded.
   - The React Native and Web form builders render TextField, Dropdown, Slider, Checkbox and DatePicker components with Zod rules compiled at runtime.
   - When an Admin adds or changes an attribute or subcategory, it appears on Mobile and Web at the next fetch, with no store release.
   - **Limit [V3-CLARIFY]:** zero-update applies to the eight existing data types and their renderers. Introducing a *new* data type requires a client release. Clients must ignore unknown schema fields safely and show a "please update the app" notice only for unsupported data types.
5. **Automatic propagation:** new attributes automatically flow into dynamic forms, filters, search indexing and comparison matrices according to their is_filterable and is_searchable flags.
6. **Safe evolution:** attributes are archived rather than deleted when listings already use them; renamed labels keep the same attribute_key so historical data stays valid. **Required-flag changes [V3-CLARIFY]:** making an attribute required applies to new listings and to edits only; existing listings are never invalidated, and owners are prompted to complete the field the next time they edit.
7. **Filter performance [V3-ADD]:** attributes flagged `promote_to_index` (for example price, year, mileage, area, KVA, bedrooms) get a PostgreSQL expression index or a generated typed column maintained by the schema service, so numeric range filters do not rely on GIN containment alone.

---

# 5. User Roles & Permission Matrix

**Identity model [V3-FIX].** Customer roles are *capabilities* on one account: one person may be Buyer, Seller, Candidate, Employer and Service Provider at once. In the matrix below the USR, BUS and EMP columns describe what each capability grants; a user holding several capabilities receives the union. Admin roles are **separate staff accounts (AdminUser)** with mandatory two-factor authentication; each admin account has exactly one admin role.

GST = Guest, USR = Registered User, BUS = Dealer/Business capability, EMP = Employer capability, MOD = Content Moderator, SUP = Support Agent, FIN = Financial Auditor, SA = Super Admin.

| Capability | GST | USR | BUS | EMP | MOD | SUP | FIN | SA |
|---|---|---|---|---|---|---|---|---|
| Browse, search and view listings | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Post listings and wanted listings | — | Yes | Yes | Yes | — | — | — | Yes |
| Chat, make offers, favorite, save searches | — | Yes | Yes | Yes | — | — | — | Yes |
| Request rental or service appointment | — | Yes | Yes | Yes | — | — | — | Yes |
| Apply to jobs (Quick Apply / Full Profile) | — | Yes | Yes | Yes | — | — | — | Yes |
| Post jobs and manage applicants | — | — | — | Yes | — | — | — | Yes |
| Business storefront, staff, analytics | — | — | Yes | — | — | — | — | Yes |
| Report listings and users | — | Yes | Yes | Yes | Yes | Yes | — | Yes |
| Hide, suspend, edit, delete listings | — | — | — | — | Yes | — | — | Yes |
| Suspend or ban users | — | — | — | — | Yes | — | — | Yes |
| Reply to support tickets, handle CV requests | — | — | — | — | — | Yes | — | Yes |
| Approve or reject Bankak receipts | — | — | — | — | — | — | Yes | Yes |
| Manage categories and EAV attributes | — | — | — | — | — | — | — | Yes |
| Toggle feature flags, media limits, OTP methods | — | — | — | — | — | — | — | Yes |
| **Manage admin roles and admin sessions [V3-FIX]** | — | — | — | — | — | — | — | Yes |
| **View audit logs (read-only) [V3-FIX]** | — | — | — | — | — | — | Yes | Yes |

*V2 combined "Manage admin roles, view audit logs" in one row and granted both to Finance Auditor, which let Finance manage admin roles and conflicted with AUTH-20. The row is split: only Super Admin manages roles; Finance Auditor has read-only audit access.*

---

# 6. Key User Journeys

These end-to-end flows define how modules combine. Each step maps to requirements in Section 7.

## 6.1 Post a Listing

1. User taps Add Listing, signs in if needed (email OTP, Google, Facebook or Apple).
2. User picks a category and subcategory, or "Other" and types a custom name.
3. The app renders the dynamic form from schema JSON; the quality score updates in real time; entered data is autosaved locally. **[V3-CLARIFY]**
4. User adds photos and optional video; media is compressed on device and uploaded.
5. User sets price and currency, pins the location, and chooses contact options (chat, WhatsApp, call).
6. User submits; the listing is published instantly and the user receives a confirmation with share link.
7. Background scanning checks keywords, blacklisted numbers, duplicate image hashes, duplicate text and image content classification; suspicious listings are flagged to moderators.

## 6.2 Find and Contact a Seller

1. Buyer searches by keyword or category and applies dynamic filters, radius and sort.
2. Buyer opens a listing: gallery, video, specs, map, price insight, seller badges.
3. Buyer taps WhatsApp (pre-filled message), Call, or in-app Chat (contact reveal follows the policy in DET-13).
4. In chat the buyer can send a structured offer; the seller accepts, rejects or counters.
5. After a qualifying interaction (TRS-08) the buyer can leave a verified review.

## 6.3 Request a Vehicle Rental

1. Renter filters vehicle rentals by type, price per day or month, mileage cap and location.
2. Renter reviews pricing, deposit and terms breakdown on the listing.
3. Renter submits a rental request with dates, driver option and notes.
4. Owner is notified, then accepts, declines or counters; renter tracks status in the dashboard.

## 6.4 Book an Automotive Service Appointment

1. User selects a service center or workshop and a service type.
2. User enters vehicle details and issue description and uploads diagnostic images.
3. User picks an available date and time slot and confirms the request.
4. Provider confirms, reschedules or declines; both parties receive reminders; the provider marks the appointment Completed and the user confirms (or the confirmation window lapses); the user then reviews the service. **[V3-FIX]**

## 6.5 Apply for a Job

1. Candidate opens a job and chooses Quick Apply or Full Profile.
2. Quick Apply submits name, phone, email and location (plus optional photo, summary, PDF CV).
3. Full Profile uses the structured builder; candidates without a CV choose "Create one for me for free".
4. Support prepares the CV, delivers it in-app, and the candidate approves or requests revisions.
5. On Apply, the employer gains access to that candidate's documents for that job only; status updates are pushed to the candidate.

## 6.6 Admin Moderation

1. Reports and automated flags arrive in the Post-Moderation Audit Center.
2. Moderator opens the listing, reviews evidence, and edits, hides, suspends or permanently deletes it.
3. Seller is notified with the reason and may appeal; the decision lands in the audit log.

## 6.7 Manual Payment Verification (Flag OFF at launch)

1. When enabled, the user enters the Bankak reference and uploads the receipt image.
2. The transaction enters the pending queue; the finance auditor inspects the receipt with zoom, pan and rotation.
3. Approve activates the service and issues an invoice; Reject requires a reason and notifies the user.
4. **UAT note [V3-FIX]:** the verification queue is Active but is empty unless user-side submission (PAY-02/03) is enabled. The staging environment must run with the Bankak user flag ON so the queue can be accepted at UAT; production keeps it OFF.

---
# 7. Functional Requirements — Module by Module

This section specifies each module in detail: purpose, launch status, actors, scope reference, every functional requirement with a stable ID, the governing business rules, admin controls and acceptance criteria. Modules M01 to M26 together with Sections 2–3 and 11–13 cover all 114 sections of Annex A (see Section 14).

| Module | Name | Launch Status (summary) |
|---|---|---|
| M01 | Accounts, Authentication & Session Security | Active |
| M02 | User Profiles, Roles & Verification | Active |
| M03 | Category Management & Dynamic EAV Engine | Active |
| M04 | Listing Creation, Lifecycle & Quality | Active |
| M05 | Search, Discovery, Comparison & Insights | Active |
| M06 | Listing Details & Lead Channels | Active |
| M07 | Messaging, Negotiation & Anti-Spam | Active |
| M08 | Automotive Vertical (Vehicles, Rentals, Parts, Service Appointments) | Active |
| M09 | Real Estate Vertical | Active |
| M10 | Jobs, Candidate Profiles & In-App CV Builder | Active |
| M11 | Hotels & Furnished Accommodation | Active for listings and inquiries |
| M12 | Equipment, Solar & Power Solutions | Active |
| M13 | Livestock, Agriculture & General Goods | Active |
| M14 | Companies, Stores & Business Dashboard | Active |
| M15 | Trust, Safety, Moderation & Reviews | Active |
| M16 | Notifications & Communication | Active |
| M17 | Payments, Bankak Manual Verification & Ledger | Fully built in backend and Admin queue; user-facing payment UI is hidden at launch and switched on by the Admin |
| M18 | Monetization & Feature-Flagged Engines | All engines are Flag OFF at launch |
| M19 | Media Processing, Photo & Video Pipeline | Active |
| M20 | Maps, Location & Geography | Active |
| M21 | Localization, Multi-Currency & Regional Expansion | Active for Sudan; additional countries are configuration-driven |
| M22 | User Dashboard, Favorites, Saved Searches & Data Rights | Active |
| M23 | Content, Help Center, Legal, SEO & Deep Linking | Active |
| M24 | Admin Dashboard & Control Engine | Active |
| M25 | Analytics & Reporting | Active |
| M26 | Platform Services, Infrastructure & Operations | Active |

---

## 7.1 M01 — Accounts, Authentication & Session Security

| | |
|---|---|
| **Purpose** | Let users register, sign in, verify identity channels and manage devices securely, with admin-controlled OTP channels. |
| **Launch Status** | Active. Email OTP, Google, Facebook and Apple sign-in are active. SMS OTP and WhatsApp OTP are built and integrated but disabled by default. |
| **Primary Actors** | Guest, Registered User, all Admin roles |
| **Scope Reference** | Annex A index items 7, 8, 49, 50, 77, 78, 109 |

### Functional Requirements

| ID | Requirement | Launch |
|---|---|---|
| AUTH-01 | The system must allow registration with email and password, and require email OTP verification before the account can post, message or apply. | Active |
| AUTH-02 | The system must support Google Sign-In through the native OAuth2 flow on mobile and the web OAuth flow on the web portal. | Active |
| AUTH-03 | The system must support Facebook Login through the Meta SDK / OAuth2 on mobile and web. | Active |
| AUTH-04 | The system must support Apple Sign-In on iOS as required for App Store compliance when other social providers are offered. | Active |
| AUTH-05 | Email OTP must be a 6-digit code, expire after 10 minutes, allow at most 5 verification attempts, allow resend after a 60-second cooldown, and store only a hash of the code. | Active |
| AUTH-06 | The system must authenticate sessions with short-lived JWT access tokens (15 minutes or less) and rotating refresh tokens; reuse of a rotated refresh token must revoke that session family. | Active |
| AUTH-07 | Users must be able to reset a forgotten password through an emailed OTP, after which all other sessions are revoked. | Active |
| AUTH-08 | Social sign-in with an email already registered must link to the existing account only after the email is verified by the provider or by OTP, never creating a duplicate account. **[V3-CLARIFY]** | Active |
| AUTH-09 | Users must be able to view active sessions (device, operating system, approximate location, last active) and revoke one or all other sessions. | Active |
| AUTH-10 | The system must keep a login activity log (time, device, outcome) visible to the user for the most recent 20 events. | Active |
| AUTH-11 | Users must be able to change password, change email (re-verified by OTP) and manage their contact phone number. | Active |
| AUTH-12 | A contact phone number must be validated against international dialing rules with +249 (Sudan) prioritized; at launch it is stored as a contact field, is **not required to be unique**, and is marked unverified unless a phone OTP channel is enabled. Uniqueness is enforced only on *verified* phone numbers. **[V3-FIX]** | Active |
| AUTH-13 | The system must include a complete SMS OTP handler with a multi-provider fallback adapter (international and local SMS providers) behind the integration layer. | Flag OFF |
| AUTH-14 | The system must include a complete WhatsApp Business OTP handler behind the integration layer. | Flag OFF |
| AUTH-15 | The Admin must be able to enable or disable each OTP method (Email, SMS, WhatsApp) from the Admin Dashboard; changes take effect within 60 seconds with no developer action or app release. **At least one registration-verification channel must always remain enabled; the dashboard must refuse a change that would disable the last one. [V3-FIX]** | Active |
| AUTH-16 | The system must lock an account or IP temporarily after repeated failed sign-in or OTP attempts using progressive delays (defaults in Appendix C). | Active |
| AUTH-17 | All authentication endpoints must be rate-limited per IP, per account and per device using Redis counters. | Active |
| AUTH-18 | Guests must be able to browse, search and view listings without an account; sign-in is required only to post, chat, favorite, apply, request or review. Contact-reveal for guests follows DET-13. | Active |
| AUTH-19 | Suspending or banning an account must immediately invalidate all of its sessions and block sign-in with a clear reason message. | Active |
| AUTH-20 | All Admin accounts (a separate AdminUser model, not customer accounts) must use mandatory two-factor authentication (TOTP), have sign-in IP addresses logged, and be subject to admin session revocation by a Super Admin. **[V3-CLARIFY]** | Active |
| AUTH-21 | Phone OTP verification, when enabled, must add a Verified Phone indicator to the profile and must be reusable for Quick Apply verification. | Flag OFF |
| AUTH-22 | **[V3-ADD]** If a social provider returns no email (for example a phone-only Facebook account) or an Apple private-relay address, the user must be asked to add and verify a real email by OTP before posting, messaging or applying; the account is otherwise browse-only. | Active |
| AUTH-23 | **[V3-ADD]** Account sign-up funnel metrics (OTP delivery success, time-to-verify, drop-off by step) must be captured so the email-only launch assumption can be validated against Sudanese users; see Open Decision OD-01. | Active |

### Business Rules
- One account per verified email; social identities are linked, not duplicated.
- OTP codes are single-use and tied to a purpose (register, reset, change email).
- All third-party charges for SMS and WhatsApp OTP are paid by the Client when those channels are enabled.

### Admin Controls
- Toggle Email, SMS and WhatsApp OTP independently (subject to AUTH-15 last-channel rule).
- View and revoke admin sessions; view admin sign-in IP logs.

### Acceptance Criteria
- A new user can register and verify by email OTP in under two minutes.
- Disabling a channel in the dashboard stops new codes on that channel within 60 seconds without a release, and the last enabled channel cannot be disabled.
- A revoked session cannot call any authenticated endpoint.
- A Facebook user without an email cannot post until an email is verified.

---

## 7.2 M02 — User Profiles, Roles & Verification

| | |
|---|---|
| **Purpose** | Provide one flexible account with public seller identity, role capabilities, verification badges and privacy controls. |
| **Launch Status** | Active |
| **Primary Actors** | Registered User, Dealer/Business, Employer, Admin |
| **Scope Reference** | Annex A index items 7, 38, 49, 50 |

### Functional Requirements

| ID | Requirement | Launch |
|---|---|---|
| PROF-01 | A single account must be able to act as Buyer, Seller, Service Provider, Candidate and Employer without separate registrations. Capabilities are stored as separate grants on the account, not as one exclusive role. **[V3-FIX]** | Active |
| PROF-02 | Profiles must hold full name, avatar, city, short bio, languages, preferred contact methods and notification preferences. | Active |
| PROF-03 | The public Seller Profile must show avatar, name, join date, rating history, total active listings, response rate and trust badges, and list the seller's active listings. | Active |
| PROF-04 | The system must support admin-granted badges: Verified Seller, Verified Dealer, Verified Business, Verified Employer and Verified Service Provider. | Active |
| PROF-05 | Users must be able to submit a verification request with identity or business registration documents stored in a private bucket and routed to the verification queue. | Active |
| PROF-06 | Users must be able to choose which contact options appear on listings: phone call, WhatsApp number, in-app chat only. | Active |
| PROF-07 | Users must be able to block and unblock other users. A blocked user cannot message the blocker; the blocker's public listings remain visible to everyone, including the blocked user, but the blocked user cannot start a chat or make an offer on them. **[V3-CLARIFY]** | Active |
| PROF-08 | The system must track account status: Active, Suspended, Deactivated, Pending Deletion. | Active |
| PROF-09 | Users must be able to choose interface language (Arabic or English) and the system must persist it across devices. | Active |
| PROF-10 | Users must be able to upgrade capabilities through guided setup flows: become a Dealer/Business, an Employer, or a Service Provider. | Active |
| PROF-11 | The system must show response-time and response-rate indicators computed from chat activity. | Active |
| PROF-12 | Avatars and cover images must pass the media pipeline (compression, format conversion, safe-content checks by perceptual-hash blacklist and the image-classification adapter in TRS-16). **[V3-CLARIFY]** | Active |

### Business Rules
- Verification documents are visible only to authorized verification staff and are never public.
- Badges can be revoked by admins; revocation is logged.

### Admin Controls
- Verification queue with approve, reject (with reason) and request-more-information actions.
- Grant or revoke badges; suspend or restore accounts with reason.

### Acceptance Criteria
- A user can hold seller and candidate capabilities in the same account.
- A rejected verification returns a reason to the user and keeps documents private.

---

## 7.3 M03 — Category Management & Dynamic EAV Engine

| | |
|---|---|
| **Purpose** | Define categories, subcategories, attributes, filters and the universal Other option so the catalog can evolve without developers or releases. |
| **Launch Status** | Active |
| **Primary Actors** | Admin (Super Admin), Seller, Buyer |
| **Scope Reference** | Annex A index items 23, 24, 25, 105 |

### Functional Requirements

| ID | Requirement | Launch |
|---|---|---|
| CAT-01 | The system must store an unlimited-depth category tree with English and Arabic names, slug, icon, display order, active flag and archive state. **[V3-FIX]** | Active |
| CAT-02 | Every main category and subcategory must include a system-level Other option in its picker. | Active |
| CAT-03 | When a user selects Other, a text input must appear so the user can type the item, vehicle or service name; the entry is stored with the listing as a custom value. | Active |
| CAT-04 | The Admin must be able to promote a frequent Other entry into an official subcategory or attribute value in one click, optionally migrating matching listings. | Active |
| CAT-05 | The Admin must be able to add, edit, reorder, archive and restore categories and subcategories from the dashboard without developer intervention or an app release. | Active |
| CAT-06 | The Admin must be able to define custom attributes per category with data type, labels in both languages, required flag, filterable flag, searchable flag, index-promotion flag, validation rules and option lists. `(category, attribute_key)` must be unique. **[V3-FIX]** | Active |
| CAT-07 | The system must serve category schema JSON to clients with versioning and ETag caching so clients refresh only when the schema has changed. | Active |
| CAT-08 | Mobile and Web form builders must render fields dynamically from the schema and validate input with the same Zod rules as the server. | Active |
| CAT-09 | New or changed categories, attributes and options must automatically appear in forms, filters, search and comparison matrices at the next fetch. | Active |
| CAT-10 | Attributes in use by listings must be archived, not deleted; archived attributes remain readable on existing listings. | Active |
| CAT-11 | The Admin must be able to restrict posting per category (disable posting while keeping browsing) with a message. | Active |
| CAT-12 | The system must support attribute option lists with dependencies, for example Make then Model, and Region then City. | Active |
| CAT-13 | The Admin must be able to preview the generated listing form for a category before publishing a schema change. | Active |
| CAT-14 | Category landing pages must expose breadcrumbs, subcategory shortcuts and top filters derived from filterable attributes. | Active |
| CAT-15 | Country Settings must allow category visibility and attribute overrides per country without code changes. | Active |
| CAT-16 | **[V3-ADD]** Changing an attribute to Required must not invalidate existing listings; it applies to new listings and subsequent edits (see Section 4.1 item 6). | Active |

### Business Rules
- Attribute keys are immutable; labels may change.
- Required attributes are enforced on submit on both client and server.
- Archived categories disappear from pickers but stay visible on existing listings.

### Admin Controls
- EAV Schema Builder with drag-and-drop ordering, validation editor and form preview.
- Other-entry analytics list with one-click promote.

### Acceptance Criteria
- Adding a new attribute in the dashboard shows it in the post form and filters on the next app open without a release.
- Every category and subcategory shows an Other option that stores the typed name.

---

## 7.4 M04 — Listing Creation, Lifecycle & Quality

| | |
|---|---|
| **Purpose** | Create, edit and manage listings of every type with instant publication, quality guidance, duplicate control and renewal. |
| **Launch Status** | Active. Offline composing, offline queueing and background offline sync are out of scope. Drafts are saved on the server while online and the in-progress form is autosaved locally on the device (not synced) so it survives app termination. **[V3-CLARIFY]** |
| **Primary Actors** | Registered User, Dealer/Business, Moderator, Admin |
| **Scope Reference** | Annex A index items 22, 26, 28, 29, 30, 46, 72 |

### Functional Requirements

| ID | Requirement | Launch |
|---|---|---|
| LST-01 | The listing flow must guide the user through category, dynamic details, media, price and currency, location and contact options, then review and publish. | Active |
| LST-02 | Common fields must include title, description, price, currency (SDG or USD), negotiable flag, condition where relevant, location and contact options. Price is optional for categories that define it as optional (for example jobs, some services), and Wanted listings use a budget range instead of a price. **[V3-FIX]** | Active |
| LST-03 | Listings must publish instantly upon submission with status Active; there is no mandatory pre-publication approval queue. | Active |
| LST-04 | The stored lifecycle statuses must be Draft, Active, Sold, Expired, Archived, plus moderator and system states Hidden (moderator action), Auto-Hidden (system, report or risk threshold) and Suspended. Submitted is a transient step that resolves to Active within the same request and is recorded in the edit history, not stored as a status. Deletion is a soft delete (`deleted_at`) applied on top of any status. **[V3-FIX]** | Active |
| LST-05 | Users must be able to save an in-progress listing as a Draft on the server while connected, and resume it from any device. | Active |
| LST-06 | A real-time Listing Quality Score (percentage) must guide the user based on title and description completeness, photo count, required and optional attributes, location accuracy, video presence and price presence. The weighting is configurable (defaults in Appendix C). | Active |
| LST-07 | Users must be able to edit a published listing; edits must trigger re-scanning and be recorded in an edit history. | Active |
| LST-08 | Users must be able to mark a listing Sold, delete it (soft delete), duplicate it as a template, and share it via deep link. | Active |
| LST-09 | Each listing must have a unique readable ID in the form MARBOU-NNNNN (zero-padded sequence, widening automatically past 99,999) used in WhatsApp messages and support. **[V3-CLARIFY]** | Active |
| LST-10 | Listings must expire after a configurable period (default 30 days per category); reminders must be sent 7 days and 1 day before expiry via push and email. | Active |
| LST-11 | Users must be able to renew or repost an expired or expiring listing with one tap, preserving content and media. | Active |
| LST-12 | The system must support Wanted listings where buyers or tenants post what they are looking for, with category, budget range, location and contact options. | Active |
| LST-13 | Each user must be limited by configurable caps on active listings and by rate limits on listings created per hour and per day (defaults in Appendix C). | Active |
| LST-14 | The system must perform asynchronous duplicate detection after publish using phone number, image hash match and text similarity (thresholds in Appendix C), and flag suspected duplicates to moderators. | Active |
| LST-15 | Business accounts must have bulk actions: renew, hide, mark sold and delete multiple listings. | Active |
| LST-16 | Price entry must support SDG and USD, display a converted indicator using the admin-maintained exchange rate, and validate numeric ranges per category. The currency is stored on every listing. **[V3-FIX]** | Active |
| LST-17 | Listings must carry a view counter that counts unique viewers (defined in Appendix C) and excludes the owner. | Active |
| LST-18 | If Other was chosen, the listing must store the custom text and expose it in search and display. | Active |
| LST-19 | **[V3-ADD]** The listing form must autosave entered data (text fields and selected media references) to local device storage on every step change and restore it after app termination or crash. This is local form persistence only; it does not queue uploads or publish while offline. | Active |
| LST-20 | **[V3-ADD]** Photos must be stored as ordered media records (position, cover flag) rather than a bare URL list, to support reordering and a cover photo (MED-08). | Active |

### Business Rules
- A published listing is visible to all users immediately; moderation never blocks publication.
- A suspended, hidden or auto-hidden listing is removed from search and feeds but remains visible to its owner with the reason.
- Expired listings are not searchable; they can be renewed by the owner for a configurable period.

### Admin Controls
- Edit, hide, suspend or permanently delete any listing; restore hidden listings.
- Configure default expiry, listing caps and posting rate limits per category and per role.

### Acceptance Criteria
- A listing submitted with all required fields is visible in search within 10 seconds.
- A user who repeatedly posts identical listings is flagged and rate-limited.
- Renewal restores an expired listing with one tap.
- Killing the app mid-form and reopening it restores the in-progress listing.

---

## 7.5 M05 — Search, Discovery, Comparison & Insights

| | |
|---|---|
| **Purpose** | Help users find the right listing fast with Arabic-aware search, dynamic filters, proximity, comparison and price guidance. |
| **Launch Status** | Active. Sponsored ranking boosts are Flag OFF. |
| **Primary Actors** | Guest, Registered User |
| **Scope Reference** | Annex A index items 26, 27, 33, 34, 35, 36, 37, 47, 81 |

### Functional Requirements

| ID | Requirement | Launch |
|---|---|---|
| SRCH-01 | The system must provide keyword search across titles, descriptions, categories and searchable attributes. | Active |
| SRCH-02 | Search must apply Arabic normalization (alef and hamza variants, ya and alef maqsura, ta marbuta, diacritics removal), basic stemming and typo tolerance using trigram similarity. | Active |
| SRCH-03 | Filters must be generated dynamically from filterable attributes and support single select, multi select, range sliders, booleans and dates. | Active |
| SRCH-04 | Search must support geo-radius proximity using PostGIS and sorting by distance when location permission is granted. | Active |
| SRCH-05 | Results must be sortable by relevance, newest, price low to high, price high to low and distance. | Active |
| SRCH-06 | Ranking must be score based, combining text relevance, freshness, listing quality score and engagement signals; promotional boosts apply only when monetization is enabled. | Active |
| SRCH-07 | The search bar must provide autocomplete suggestions, recent searches and category shortcuts. | Active |
| SRCH-08 | Users must be able to search directly by listing ID. | Active |
| SRCH-09 | Users must be able to save a search with filters and receive notifications for new matching listings and price drops. | Active |
| SRCH-10 | The Home page must show dynamic banners, category grid, recent and popular listings, and a Nearby discovery grid; sponsored slots stay hidden at launch. | Active |
| SRCH-11 | The mobile apps must use five-tab native navigation: Home, Search, Add Listing, Messages and Profile. The web portal provides equivalent primary navigation in its header and responsive menu. **[V3-CLARIFY]** | Active |
| SRCH-12 | Users must be able to compare up to 4 listings side by side for Automotive, Real Estate and Electronics, showing specs, price and seller verification status. | Active |
| SRCH-13 | Market Price Insights must show a price range indicator and historical average for comparable listings, with a clear Below, Fair or Above market label where enough data exists. Comparable listings are those in the same leaf category with matching key attributes. Prices are normalized to the viewed listing's currency using the exchange rate valid on the comparable's date; if the rate is older than the staleness limit, cross-currency comparables are excluded. The minimum comparable count and label bands are in Appendix C. **[V3-CLARIFY]** | Active |
| SRCH-14 | The Nearby and Recommendations feed must show listings close to the user and related to recent searches and favorites. | Active |
| SRCH-15 | Results must use cursor-based pagination with infinite scroll and must show helpful empty states with suggestions when no results match. | Active |
| SRCH-16 | Search indexing must update within seconds of publish, edit, hide or delete. | Active |
| SRCH-17 | Search results must remove hidden, auto-hidden, suspended, sold and expired listings automatically. | Active |
| SRCH-18 | The system must record queries and zero-result searches for analytics. | Active |
| SRCH-19 | **[V3-ADD]** Numeric and date filters on dynamic attributes must be served from promoted columns or expression indexes (Section 4.1 item 7); the schema service must create or retire these indexes when an Admin toggles `promote_to_index`, and the 500 ms p95 target (NFR-PERF-02) must be verified with filters applied. | Active |

### Business Rules
- Hidden, auto-hidden, suspended and expired listings never appear in results.
- Price insights are shown only when at least the minimum number of comparable listings exist (Appendix C).

### Admin Controls
- Manage home banners, featured category order and search synonyms for Arabic and English.
- View top queries and zero-result queries.

### Acceptance Criteria
- Searching with common Arabic spelling variants returns the same relevant results.
- Changing a filter updates results without a full page reload.
- A range filter on a promoted attribute (for example year or KVA) meets the p95 target at 100,000 active listings.

---

## 7.6 M06 — Listing Details & Lead Channels

| | |
|---|---|
| **Purpose** | Present each listing with rich media and specifications and provide one-tap contact through WhatsApp, call and chat. |
| **Launch Status** | Active |
| **Primary Actors** | Guest, Registered User, Seller |
| **Scope Reference** | Annex A index items 32, 38, 43, 88, 90 |

### Functional Requirements

| ID | Requirement | Launch |
|---|---|---|
| DET-01 | The details page must show a high-resolution gallery with zoom, an optional video player, price and currency, location map and a specifications table generated from dynamic attributes. | Active |
| DET-02 | The page must display the seller card with badges, rating, response indicators and a link to the seller profile. | Active |
| DET-03 | Every listing must have a prominent Chat on WhatsApp button that opens WhatsApp through a wa.me deep link with a pre-filled message containing the listing title, ID and price. | Active |
| DET-04 | The page must provide a Call button that respects the seller contact privacy settings. | Active |
| DET-05 | The page must provide an in-app Chat button that opens a thread anchored to the listing. | Active |
| DET-06 | The page must show a Market Price indicator and Similar Listings. | Active |
| DET-07 | Users must be able to favorite, share, compare and report the listing from the details page. | Active |
| DET-08 | The page must show clear banners for Sold, Expired and Suspended states. | Active |
| DET-09 | Listing links must open directly in the app through Universal Links (iOS) and App Links (Android), with a web fallback. | Active |
| DET-10 | Shared listing links must render rich previews with Open Graph tags and a server-rendered preview card. | Active |
| DET-11 | The system must track WhatsApp, call and chat taps as lead events for business analytics, without exposing private data. | Active |
| DET-12 | The page must show breadcrumbs, listing ID, posted date and view count. | Active |
| DET-13 | **[V3-ADD]** Contact-reveal policy: seller phone and WhatsApp numbers are revealed through a server-mediated endpoint, never embedded in public page source or listing payloads. The Admin selects the policy: *guests allowed with rate limit* (default; per device and IP daily reveal cap in Appendix C) or *signed-in users only*. Excess or automated reveal patterns raise a fraud signal. | Active |

### Business Rules
- The WhatsApp message template is configurable by Admin for each language.
- Contact buttons never reveal a number the seller chose to hide.

### Admin Controls
- Edit the WhatsApp message template; select the contact-reveal policy and caps.

### Acceptance Criteria
- Tapping WhatsApp opens a chat with the pre-filled structured message in one tap.
- A shared link opens the exact listing inside the installed app.
- A scripted client fetching listing pages in bulk does not obtain seller phone numbers from page source or list endpoints.

---

## 7.7 M07 — Messaging, Negotiation & Anti-Spam

| | |
|---|---|
| **Purpose** | Provide real-time buyer-seller communication with structured offers and abuse protection, alongside WhatsApp routing. |
| **Launch Status** | Active |
| **Primary Actors** | Registered User, Business staff, Moderator |
| **Scope Reference** | Annex A index items 43, 44, 45 |

### Functional Requirements

| ID | Requirement | Launch |
|---|---|---|
| MSG-01 | The system must provide real-time 1-to-1 chat over Socket.io, with a thread (ChatThread) anchored to the listing ID and the two participants. **[V3-FIX]** | Active |
| MSG-02 | Messages must show delivery receipts: Sent, Delivered and Read, stored as timestamps on each message. **[V3-FIX]** | Active |
| MSG-03 | Users must be able to attach images to messages, subject to size and type limits. | Active |
| MSG-04 | The chat must support structured offers: Make Offer, Accept, Reject and Counter-Offer, each shown as a card and recorded in the thread as Offer records linked to their message. | Active |
| MSG-05 | The system must show typing indicators and unread counters per thread and in the Messages tab. | Active |
| MSG-06 | New messages must trigger push notifications (FCM) when the recipient is not active in the thread, respecting notification preferences. | Active |
| MSG-07 | The system must throttle message frequency per user and per recipient and auto-flag patterns such as repeated identical messages or link spam (thresholds in Appendix C). | Active |
| MSG-08 | Users must be able to block a user, mute a thread, and report a conversation; reported conversations become visible to moderators. | Active |
| MSG-09 | Threads must show a system banner when the listing is sold, expired or removed. | Active |
| MSG-10 | The chat must provide an Open in WhatsApp shortcut that carries the listing context. | Active |
| MSG-11 | Business accounts must be able to let staff members reply from the business inbox. | Active |
| MSG-12 | The socket layer must reconnect automatically and fall back to polling when WebSocket is unavailable. | Active |
| MSG-13 | Quick replies (saved templates) must be available to sellers and business accounts. | Active |
| MSG-14 | **[V3-ADD]** Message sends must carry a client-generated idempotency key so retries on weak networks never create duplicate messages (NFR-REL-03). | Active |

### Business Rules
- Moderators can view only reported conversations, never the full inbox of a user.
- Message content is retained according to the data retention schedule (Appendix D).

### Admin Controls
- Configure throttling thresholds and banned phrases.

### Acceptance Criteria
- A message appears on the recipient device within 2 seconds under normal connectivity.
- An accepted offer is shown on both sides with the agreed price.
- Retrying a failed send three times produces exactly one message.

---
## 7.8 M08 — Automotive Vertical (Vehicles, Rentals, Parts, Service Appointments)

| | |
|---|---|
| **Purpose** | A complete automotive marketplace: sale, rental, heavy vehicles, parts, services, towing, diagnostics, comparison and dealer verification. |
| **Launch Status** | Active. Vehicle Rental and Automotive Service Appointments are ACTIVE at initial release. |
| **Primary Actors** | Buyer, Seller, Dealer, Renter, Service Provider, Admin |
| **Scope Reference** | Annex A index items 9, 11, 35, 42, 54, 56; A.3.1, A.3.10 |

### Functional Requirements

| ID | Requirement | Launch |
|---|---|---|
| AUTO-01 | The system must provide these subcategories: Cars for Sale (New, Certified Pre-Owned, Used), Vehicle Rentals, Trucks & Heavy Vehicles, Rickshaws & Tuk-Tuks, Motorcycles, Spare Parts & Accessories, Automotive & Vehicle Services, Towing & Recovery, Computer Diagnostics, each with an Other option. | Active |
| AUTO-02 | Cars for Sale must capture make, model, year, mileage, transmission, fuel type, engine displacement, body type, duty-paid status, regional spec, condition, price and map location. | Active |
| AUTO-03 | Trucks & Heavy Vehicles must capture axle count, tonnage or payload, engine capacity, hours used and duty status. | Active |
| AUTO-04 | Rickshaws & Tuk-Tuks must capture engine displacement (cc), passenger capacity and local permit status. | Active |
| AUTO-05 | Spare Parts must capture part number, OEM or aftermarket tag, vehicle compatibility (make, model, year range) and condition, and be searchable by compatibility. | Active |
| AUTO-06 | The Multi-Attribute Filter Matrix must filter by make, model, year, mileage, transmission, fuel type, engine displacement, body type, duty-paid status, regional spec, condition and price range. | Active |
| AUTO-07 | Users must be able to compare up to 4 vehicles side by side showing specs, price, mileage, transmission, features and seller verification status. | Active |
| AUTO-08 | Dealers must have verified dealership profiles with inventory counter, showroom map, registration badge and contact channels. | Active |
| AUTO-09 | Vehicle Rental listings must capture rental rates (daily, weekly, monthly), security deposit, mileage cap, driver option, rental conditions and pickup location. | Active |
| AUTO-10 | Rental search must support filtering by vehicle type, price range, location, mileage cap, driver option and availability notes, and sorting by price and distance. | Active |
| AUTO-11 | The rental details page must show a pricing display with daily, weekly and monthly rates and a clear deposit and terms breakdown. | Active |
| AUTO-12 | Users must be able to submit a rental request with start and end dates, driver option, pickup preference and notes; no online payment is processed. | Active |
| AUTO-13 | The owner must receive the request by push and email and be able to accept, decline or counter; both parties see the request status: Requested, Accepted, Declined, Countered, Cancelled, Completed. A snapshot of the listing's rental terms at request time is stored with the request. **[V3-CLARIFY]** | Active |
| AUTO-14 | Service providers must be able to create a service profile listing services offered, hourly or service rates, working hours, slot duration and capacity per slot. | Active |
| AUTO-15 | Users must be able to book a service appointment: pick a service provider, choose a service type, pick a date and time slot, describe the vehicle issue, upload diagnostic images and confirm. | Active |
| AUTO-16 | The provider must be able to confirm, decline, propose a new time or mark an appointment Completed or No-show; the user must be able to cancel or reschedule within provider rules. A Completed mark becomes review-eligible only after the user confirms completion or the confirmation window lapses (Appendix C). **[V3-FIX]** | Active |
| AUTO-17 | The system must send reminders for appointments (24 hours and 2 hours before) by push, with email as a fallback. | Active |
| AUTO-18 | After completion the user must be prompted to leave a verified review of the service provider. | Active |
| AUTO-19 | Towing & Recovery listings must capture flatbed or hook type, emergency contact number, geographic operating radius and area; the profile may show live location tagging when the provider shares it. | Active |
| AUTO-20 | Computer Diagnostics listings must capture inspection type, mobile diagnostic capability and certificate verification. | Active |
| AUTO-21 | Vehicle listings may carry an optional vehicle identification field and ownership document upload, visible only to the platform and never public. | Active |

### Business Rules
- Rental requests and appointments are agreements between the parties; MARBOU facilitates, records and notifies but does not process payment at launch.
- Appointment slots cannot be double-booked beyond the capacity configured by the provider.
- Rental terms shown must be those on the listing at the time of the request.

### Admin Controls
- Manage vehicle makes and models, body types and regional specs as option lists.
- View rental requests and appointments for support and disputes.

### Acceptance Criteria
- A renter can complete a rental request in under two minutes and the owner is notified immediately.
- A booked time slot is no longer offered once its capacity is reached.
- Comparison of 4 vehicles renders correctly in Arabic RTL and English LTR.

---

## 7.9 M09 — Real Estate Vertical

| | |
|---|---|
| **Purpose** | A comprehensive property marketplace for residential, commercial, industrial and agricultural assets across all transaction types. |
| **Launch Status** | Active |
| **Primary Actors** | Property Seller, Landlord, Agent, Buyer, Tenant |
| **Scope Reference** | Annex A index item 12; A.3.8 |

### Functional Requirements

| ID | Requirement | Launch |
|---|---|---|
| RE-01 | The system must support these property types: Houses, Apartments (Furnished and Unfurnished), Villas, Land (Residential plots, Commercial land, Agricultural land), Shops / Commercial Stores, Offices, Warehouses, Buildings / Apartment Complexes, Factories, Farms, Projects & Investments, and Other (custom descriptor). | Active |
| RE-02 | The system must support these transaction types for every property type: For Sale, For Rent, Wanted to Buy, Wanted to Rent. | Active |
| RE-03 | For Rent listings must support daily, monthly and annual rental periods with a rent amount per period. | Active |
| RE-04 | Property attributes must include total area (sq ft, sq m, acres), bedrooms, bathrooms, floor level, year built, furnishing status, power backup (generator or solar), security facilities, parking spaces and payment terms (upfront, instalments). | Active |
| RE-05 | The system must convert and display area in the unit preferred by the viewer and compute price per square meter where applicable. | Active |
| RE-06 | Projects & Investments listings must capture developer name, project stage, expected completion date, unit types, starting price and an optional brochure PDF. | Active |
| RE-07 | Properties must carry an interactive map pin; sellers may choose an approximate location radius to protect privacy of residential addresses. | Active |
| RE-08 | Filters must include property type, transaction type, price range, area range, bedrooms, bathrooms, furnishing, finishing level, city and neighborhood, and power backup. | Active |
| RE-09 | Wanted to Buy and Wanted to Rent postings must capture property type, budget range, desired area and preferred locations. | Active |
| RE-10 | The system must support agent and agency profiles with verified badges and active listing counters. | Active |
| RE-11 | Users must be able to compare up to 4 properties side by side. | Active |
| RE-12 | Property listings must support photo galleries, optional video and floor-plan image uploads. | Active |

### Business Rules
- Every property type and transaction type combination uses the same dynamic EAV engine, so adding a new property type needs no release.

### Admin Controls
- Manage property types, finishing levels and area units as option lists.

### Acceptance Criteria
- A user can post, search and compare a Villa For Sale and a Wanted to Rent apartment posting using the same engine.

---

## 7.10 M10 — Jobs, Candidate Profiles & In-App CV Builder

| | |
|---|---|
| **Purpose** | A dual-tier recruitment system serving zero-friction casual applicants and professional candidates, with private document handling. |
| **Launch Status** | Active |
| **Primary Actors** | Candidate, Employer, Support Agent, Admin |
| **Scope Reference** | Annex A index items 41, 42; A.3.2 |

### Functional Requirements

| ID | Requirement | Launch |
|---|---|---|
| JOB-01 | Employers must be able to post jobs with title, category, employment type (full-time, part-time, contract, daily), salary range (optional), location, requirements, benefits, application deadline and screening questions. | Active |
| JOB-02 | Tier A Quick Apply must require full name, phone number, email and city/location, with optional profile photo, short summary and PDF CV upload. | Active |
| JOB-03 | Tier B Full Candidate Profile must capture personal info (full name, optional photo, date of birth, nationality, city, phone, email, marital status). | Active |
| JOB-04 | The profile must capture driving and transport: license (yes/no), category or class, date obtained, vehicle ownership and vehicle details. | Active |
| JOB-05 | The profile must capture education entries: level, institution, field of study, start and end dates, optional certificate upload; multiple entries allowed. | Active |
| JOB-06 | The profile must capture work experience entries: company, job title, key responsibilities, start and end dates, current-employer flag; multiple entries allowed. | Active |
| JOB-07 | The profile must capture skills as tags and languages with proficiency levels: Native, Fluent, Intermediate, Basic. | Active |
| JOB-08 | The profile must support multiple optional certificate document uploads (PDF, JPG, PNG). | Active |
| JOB-09 | Candidates must be able to upload an existing PDF CV, or choose "I don't have a CV – Create one for me for free". | Active |
| JOB-10 | The Create-CV workflow must collect structured data through a step-by-step form, route it as JSON to the Support/Admin CV queue as a CvBuildRequest, and let the support team prepare a professional CV and deliver it in the app (notification feed and profile). | Active |
| JOB-11 | Candidates must be able to review, approve or request revisions on a delivered CV before applying; the single authoritative status values are Pending, In Progress, Delivered, Revision Requested, Approved, stored as the enum PENDING, IN_PROGRESS, DELIVERED, REVISION_REQUESTED, APPROVED. **[V3-FIX]** | Active |
| JOB-12 | The in-app CV builder must offer selectable layouts and in-app review and edit, and export a PDF. | Active |
| JOB-13 | All CVs, certificates and personal contact details must be encrypted at rest, hidden from the public by default, and shared with an employer only when the candidate applies to that specific job. | Active |
| JOB-14 | Employer access to candidate documents must use time-limited signed URLs scoped to the application. | Active |
| JOB-15 | Employers must have an applicant dashboard with statuses: Submitted, Viewed, Shortlisted, Interview, Rejected, Hired, plus notes and filters. | Active |
| JOB-16 | Candidates must be able to track application status, withdraw an application, and receive push notifications on changes. | Active |
| JOB-17 | The system must prevent mass-application abuse with daily application limits and duplicate application checks (defaults in Appendix C). | Active |
| JOB-18 | Candidates must be able to set job alerts by category, location and keywords. | Active |
| JOB-19 | Jobs must expire after the deadline or a configurable period and be renewable by the employer. | Active |
| JOB-20 | The system must support Verified Employer badges. | Active |
| JOB-21 | **[V3-ADD]** Job postings are a high-fraud vertical. Jobs must be scanned for common scam patterns (upfront-fee requests, off-platform payment, messaging-app-only contact) and may be placed under the delayed-visibility mode in TRS-15 by Admin configuration. | Active |

### Business Rules
- Candidate profiles are never searchable by the public; employers see only candidates who applied to their jobs.
- Quick Apply data is submitted to the same Employer Queue as Full Profile applications.
- Candidates can delete uploaded documents at any time.

### Admin Controls
- Candidate CV Processing Portal: queue, structured JSON view, generator integration, in-app delivery router, revision handling.

### Acceptance Criteria
- A candidate can finish Quick Apply in under 60 seconds.
- An employer cannot open a candidate document unless that candidate applied to the employer's job.

---

## 7.11 M11 — Hotels & Furnished Accommodation

| | |
|---|---|
| **Purpose** | List short and long-term accommodation with amenity detail and instant inquiry flows. |
| **Launch Status** | Active for listings and inquiries. A full reservation booking engine is Flag OFF. |
| **Primary Actors** | Host, Hotel Owner, Guest |
| **Scope Reference** | Annex A index items 13, 56; A.3.3 |

### Functional Requirements

| ID | Requirement | Launch |
|---|---|---|
| HOT-01 | The system must support hotels, guest houses, furnished apartments and long-stay rentals with nightly and monthly pricing. | Active |
| HOT-02 | Listings must capture room and bed counts, capacity, and amenities: Wi-Fi, generator or solar power, security, air conditioning, parking, breakfast, kitchen and others. | Active |
| HOT-03 | Listings must support photo galleries, an optional video and an interactive location map. | Active |
| HOT-04 | Guests must be able to send an instant inquiry with dates, number of guests and a message; the host is notified and replies in chat or by WhatsApp. | Active |
| HOT-05 | Hosts must be able to mark date ranges as unavailable so listings show availability notes. | Active |
| HOT-06 | Listings must display ratings and verified reviews from guests who sent an inquiry **and whose stay the host has marked Confirmed Stay** (a one-tap host action on the inquiry, with the guest able to dispute). While the reservation engine (HOT-08) is OFF the system cannot verify stays itself, so host confirmation is the verification mechanism. **[V3-FIX]** | Active |
| HOT-07 | Filters must include price per night or month, location, amenities, capacity and rating. | Active |
| HOT-08 | The system must include availability locks and a reservation workflow in the backend and database, switchable on by the Admin. | Flag OFF |

### Business Rules
- At launch, inquiries are not binding reservations; confirmation is handled between guest and host.

### Admin Controls
- Manage amenity list and enable the reservation engine when ready.

### Acceptance Criteria
- A guest can send an inquiry from a listing in two taps and the host is notified.
- A review cannot be posted for an inquiry the host has not marked Confirmed Stay.

---

## 7.12 M12 — Equipment, Solar & Power Solutions

| | |
|---|---|
| **Purpose** | Dedicated schemas and filters for the highest-volume regional energy and equipment categories. |
| **Launch Status** | Active |
| **Primary Actors** | Seller, Dealer, Buyer |
| **Scope Reference** | Annex A index items 10, 11; A.5 recommendation 2 |

### Functional Requirements

| ID | Requirement | Launch |
|---|---|---|
| EQP-01 | The system must provide a Solar & Power Systems category under Tractors & Equipment. | Active |
| EQP-02 | Solar panels must capture wattage, cell type and manufacturer warranty. | Active |
| EQP-03 | Solar inverters must capture KVA rating, pure sine wave status and hybrid or off-grid flags. | Active |
| EQP-04 | Batteries must capture type (Tubular, Lithium-ion, Gel), capacity (Ah), voltage and warranty. | Active |
| EQP-05 | Generators must capture KVA output, fuel type (diesel or petrol), soundproof enclosure status and hours run. | Active |
| EQP-06 | Agricultural and industrial equipment (pumps, tractors, processing machinery, excavators, construction machinery) must have schemas for make, model, year, condition, hours and capacity. | Active |
| EQP-07 | Specialized filters must exist for inverter KVA capacity, battery chemistry, panel wattage and an Installation Included tag; these attributes are flagged `promote_to_index` by default. **[V3-CLARIFY]** | Active |
| EQP-08 | Sellers must be able to mark installation, delivery option and warranty availability. | Active |

### Business Rules
- All schemas are EAV-defined and editable by Admin without code changes.

### Acceptance Criteria
- Filtering by inverter KVA and battery chemistry returns only matching listings.

---

## 7.13 M13 — Livestock, Agriculture & General Goods

| | |
|---|---|
| **Purpose** | Support livestock and crops commerce plus all general consumer categories using standard dynamic schemas. |
| **Launch Status** | Active. The wholesale pricing engine is Flag OFF; bulk quantities are captured as listing fields. |
| **Primary Actors** | Farmer, Trader, Seller, Buyer |
| **Scope Reference** | Annex A index items 14–20, 22, 55 |

### Functional Requirements

| ID | Requirement | Launch |
|---|---|---|
| GEN-01 | Livestock listings (cows, sheep, goats, camels, horses, poultry) must capture breed, age, weight, health or vaccination status, head count and bulk quantity. | Active |
| GEN-02 | Crops and commodities (sorghum, sesame, cotton, wheat, gum arabic) must capture quantity in metric tons, quality grade, harvest date and delivery options. | Active |
| GEN-03 | Electronics and appliances must capture condition (New or Used) and warranty fields. | Active |
| GEN-04 | Women, Fashion & Beauty must cover traditional clothing (Thobes), dresses, cosmetics, tailoring and salon services. | Active |
| GEN-05 | Men Fashion must cover traditional Sudanese wear (Jellabiyas), formal and casual wear, shoes and accessories. | Active |
| GEN-06 | Children & Mothers must cover school wear, toys, baby care, strollers and mother equipment. | Active |
| GEN-07 | Home & Furniture must cover interior furniture, kitchen tools, appliances, office setups and home decor. | Active |
| GEN-08 | Food & Consumer Goods must cover daily essentials, wholesale produce, beverages and bulk groceries. | Active |
| GEN-09 | The General Marketplace category must accept any legal trade item, governed by post-publication moderation. | Active |
| GEN-10 | Every category above must provide the Other option and standard EAV parameters. | Active |
| GEN-11 | Wholesale pricing with minimum order quantity and tiered pricing must be implemented in backend and database and enabled by Admin toggle (minimum acceptance bar in Appendix B). | Flag OFF |

### Business Rules
- Traditional terminology must use native Arabic names with English equivalents.

### Acceptance Criteria
- A livestock listing shows breed, weight and health tags in results and details.

---

## 7.14 M14 — Companies, Stores & Business Dashboard

| | |
|---|---|
| **Purpose** | Give verified businesses a storefront, staff management and performance analytics. |
| **Launch Status** | Active |
| **Primary Actors** | Business Owner, Staff, Admin |
| **Scope Reference** | Annex A index items 21, 39, 40 |

### Functional Requirements

| ID | Requirement | Launch |
|---|---|---|
| BIZ-01 | Businesses must have a profile with logo, cover image, description, business hours, location, contact channels and verification status. | Active |
| BIZ-02 | The business profile must display the catalog of active listings with filters and a total count. | Active |
| BIZ-03 | Business owners must be able to invite staff members and assign roles: Manager, Editor and Support. | Active |
| BIZ-04 | The Business Dashboard must show listing views, unique viewers, lead events (chat, WhatsApp taps, calls), and conversion over selectable time ranges. | Active |
| BIZ-05 | The dashboard must show top performing listings, search impressions and basic audience location summaries. | Active |
| BIZ-06 | Businesses must be able to export performance data as CSV. | Active |
| BIZ-07 | Businesses must be able to use bulk listing actions and a shared business inbox. | Active |
| BIZ-08 | Verified Business badges must be granted by admin after document review. | Active |
| BIZ-09 | Each business must have a shareable storefront link that opens in the app or on the web with SEO-friendly metadata. | Active |

### Business Rules
- Staff permissions are limited to the business they belong to.
- Analytics exposes aggregated numbers only, never personal data of viewers.

### Acceptance Criteria
- A business owner can add a staff member and see that member's actions limited to business scope.

---

## 7.15 M15 — Trust, Safety, Moderation & Reviews

| | |
|---|---|
| **Purpose** | Protect users and the marketplace with post-publication moderation, automated scanning, reports, fraud scoring and verified reviews. |
| **Launch Status** | Active |
| **Primary Actors** | Registered User, Moderator, Support Agent, Admin |
| **Scope Reference** | Annex A index items 28, 30, 31, 44, 48, 49, 50, 51, 86; A.3.9 |

### Functional Requirements

| ID | Requirement | Launch |
|---|---|---|
| TRS-01 | Listings must publish instantly and enter an asynchronous scanning queue that checks banned keywords, blacklisted phone numbers, duplicate image hashes, duplicate text patterns and image content classification (TRS-16). | Active |
| TRS-02 | Users must be able to report any listing, user, review or conversation with a reason: Fraud, Incorrect Price, Sold, Duplicate, Inappropriate Content, Other. | Active |
| TRS-03 | The system must maintain a report queue with priority based on report count, reporter reliability and fraud score. | Active |
| TRS-04 | Moderators must be able to audit live listings and edit, hide, suspend or permanently delete them, and the owner must be notified with the reason. | Active |
| TRS-05 | The system must compute a fraud and risk score (0–100) from signals such as rapid listing rates, duplicate content, new-account behavior, suspicious pricing, abnormal contact-reveal volume and receipt fraud flags. | Active |
| TRS-06 | The system must rate-limit suspicious accounts automatically and alert moderators when a score crosses the alert threshold (Appendix C). | Active |
| TRS-07 | Users must be able to appeal a moderation action; appeals go to a dedicated admin decision queue with outcome notification. | Active |
| TRS-08 | The system must support a Reviews & Ratings system limited to verified post-interaction reviewers, with business or seller responses. A **qualifying interaction** is any one of: (a) a chat thread in which both parties each sent at least the minimum number of messages (Appendix C); (b) an Accepted-then-Completed rental request; (c) an appointment marked Completed by the provider and confirmed by the user or lapsed (AUTO-16); (d) a hotel inquiry marked Confirmed Stay (HOT-06). Each interaction allows at most one review per reviewer. **[V3-FIX]** | Active |
| TRS-09 | Reviews must be reportable and moderated, and rating averages must update automatically. | Active |
| TRS-10 | The system must provide a Trust & Safety Center with safe-trading tips, report status and blocklist management. | Active |
| TRS-11 | Admins must be able to suspend or ban users, with reason and duration, and to maintain blacklists of phone numbers, emails, devices and keywords. | Active |
| TRS-12 | Every moderation, verification, financial and configuration action must be recorded in the immutable audit log. Audit entries reference actors and subjects by pseudonymous ID and must not store personal data in payloads, so account erasure (DASH-05) never requires editing the chain. **[V3-FIX]** | Active |
| TRS-13 | A Security Center must let users review sessions, login logs and manage credentials. | Active |
| TRS-14 | The system must auto-hide a listing temporarily (status Auto-Hidden, distinct from moderator Hidden) when report volume or risk score crosses an admin-configured threshold, pending moderator review. Auto-hide occurs after publication and does not contradict instant publication. **[V3-CLARIFY]** | Active |
| TRS-15 | **[V3-ADD]** An Admin-controlled *delayed-visibility* mode must be available per category and per trust tier (for example first posts from accounts newer than N days in Jobs or Rentals), holding a listing for automated scan completion or moderator review before it becomes visible. The mode is **OFF for every category by default**, preserving instant publication; enabling it is a configuration decision, not a release. | Active (mode OFF) |
| TRS-16 | **[V3-ADD]** The scanning pipeline must include an image and video-poster content-classification adapter (for example nudity and graphic-violence detection) behind the integration layer, with the provider chosen at Milestone 2 and its usage cost borne by the Client. | Active |
| TRS-17 | **[V3-ADD]** The perceptual-hash blacklist used for safe-content checks must be seeded from a named, recognized industry hash source selected at Milestone 2 plus Admin-maintained entries; the source is documented in the runbook. | Active |
| TRS-18 | **[V3-ADD]** To meet app-store user-generated-content policies, the apps must provide: objectionable-content filtering (TRS-01, 16), in-app reporting (TRS-02), user blocking (PROF-07), published support contact details, and a web-accessible account-deletion page (CMS-09). | Active |

### Business Rules
- Moderation never blocks publication unless the Admin has enabled delayed visibility for that category (TRS-15); it otherwise acts after publication.
- Every action by a moderator requires a reason code.

### Admin Controls
- Post-Moderation Audit Center: live feed of new listings, report queue, flagged listings, account suspension tools and content editing portal.
- Delayed-visibility settings per category and trust tier.

### Acceptance Criteria
- A reported listing reaches the moderator queue within one minute.
- An appeal produces a recorded decision and notification.
- A user whose account is erased leaves no personal data in the audit log, and the audit chain still verifies.

---

## 7.16 M16 — Notifications & Communication

| | |
|---|---|
| **Purpose** | Keep users informed through push, in-app and email channels with user-controlled preferences and admin broadcasts. |
| **Launch Status** | Active |
| **Primary Actors** | All users, Admin |
| **Scope Reference** | Annex A index item 67 |

### Functional Requirements

| ID | Requirement | Launch |
|---|---|---|
| NTF-01 | The system must send push notifications through Firebase Cloud Messaging on iOS and Android. | Active |
| NTF-02 | The app must contain an in-app activity feed showing notifications with read and unread state. | Active |
| NTF-03 | The system must send transactional emails for OTP, password reset, important account events, expiry reminders and appointment or rental updates. | Active |
| NTF-04 | Notification triggers must include: new message, new offer, listing published, listing expiring, listing hidden or suspended, saved search match, price drop on favorites, job application status, CV delivered, rental request update, appointment confirmation and reminder, verification outcome and report outcome. | Active |
| NTF-05 | Users must be able to control notification categories and channels (push, email) from preferences. | Active |
| NTF-06 | Admins must be able to send targeted broadcast messages by audience (all, role, city, category interest) with scheduling. | Active |
| NTF-07 | The system must deduplicate and batch notifications to avoid spam. | Active |
| NTF-08 | Notification delivery must use job queues with retries and failure logging. | Active |
| NTF-09 | Notification text must be localized in Arabic and English based on user language. | Active |

### Admin Controls
- Broadcast composer with audience filters, scheduling and delivery statistics.

### Acceptance Criteria
- A new message triggers a push within 5 seconds when the recipient is away from the thread.

---
## 7.17 M17 — Payments, Bankak Manual Verification & Ledger

| | |
|---|---|
| **Purpose** | Provide a standardized payment ledger and a manual Bankak receipt verification pipeline for the Sudanese market. |
| **Launch Status** | Fully built in backend and Admin queue; user-facing payment UI is hidden at launch and switched on by the Admin. |
| **Primary Actors** | User, Finance Auditor, Super Admin |
| **Scope Reference** | Annex A index items 64, 65, 111; A.3.4, A.3.11 |

### Functional Requirements

| ID | Requirement | Launch |
|---|---|---|
| PAY-01 | The system must implement a unified payment schema: ledger of transactions with state, amount, currency, reference, receipt, actor and audit trail. | Active |
| PAY-02 | Users must be able to submit a Bankak payment by entering the transaction reference and uploading a receipt image. | Flag OFF |
| PAY-03 | The system must capture reference number, timestamp and amount and place the transaction in a Pending queue. | Flag OFF |
| PAY-04 | The Admin Verification Queue must show pending receipts beside user profile data, with high-resolution modal zoom, pan and rotation. | Active |
| PAY-05 | Finance Auditors must be able to Approve or Reject with a single click; Reject requires a reason such as Illegible receipt, Incorrect amount or Duplicate transaction reference. | Active |
| PAY-06 | Approval must activate the related service and issue an invoice; rejection must send a push notification with the reason. | Flag OFF |
| PAY-07 | The system must detect duplicate reference numbers and reused receipt images and flag them as receipt fraud. | Active |
| PAY-08 | Invoices and receipts must be generated with sequential numbering and be downloadable by the user. | Flag OFF |
| PAY-09 | The payment abstraction layer must let new gateways be added without changing business logic. | Active |
| PAY-10 | All payment state changes must be written to the immutable audit log. | Active |
| PAY-11 | Currency must be stored per transaction with SDG and USD support and no silent conversion. | Active |
| PAY-12 | The system must support refunds and reversals as ledger entries with reasons. | Flag OFF |
| PAY-13 | **[V3-ADD]** The Staging environment must run with PAY-02/03/06/08 enabled so the Active queue (PAY-04/05/07) can be tested end to end at UAT; Production keeps them OFF until the Admin enables them. | Active (Staging) |

### Business Rules
- Bank transfer fees charged by Bankak are the Client's responsibility.
- Only Finance Auditor and Super Admin roles can approve or reject payments.

### Admin Controls
- Pending, approved and rejected queues with filters, audit trail and CSV export.

### Acceptance Criteria
- When enabled, a submitted receipt appears in the queue immediately and a decision notifies the user.

---

## 7.18 M18 — Monetization & Feature-Flagged Engines

| | |
|---|---|
| **Purpose** | Provide fully implemented but dormant engines for monetization and extended commerce, enabled later by admin switches with zero downtime. |
| **Launch Status** | All engines are Flag OFF at launch. Frontend monetization and payment UI is hidden; backend logic and database are fully implemented to the minimum acceptance bar in Appendix B. **[V3-CLARIFY]** |
| **Primary Actors** | Super Admin, Sellers, Dealers, Buyers |
| **Scope Reference** | Annex A index items 52–63, 66, 112; A.3.11 |

### Functional Requirements

| ID | Requirement | Launch |
|---|---|---|
| MON-01 | A global ENABLE_MONETIZATION flag must hide all pricing UI, paywalls and promotion badges on mobile and web when false. | Flag OFF |
| MON-02 | Subscriptions: tiered monthly and yearly plans for power sellers, stores and dealers with listing quotas, benefits and renewal rules. | Flag OFF |
| MON-03 | Promotions: sponsored listings, search top-boosts, featured listings, homepage banner slots and highlighted badges, with scheduling and performance reports. | Flag OFF |
| MON-04 | Credits: credit balances, purchases, spend rules and ledger entries. | Flag OFF |
| MON-05 | Paid ad boosts and user account badging with durations and pricing configuration. | Flag OFF |
| MON-06 | Auctions: auction listings, bidding, reserve price and winner selection. | Flag OFF |
| MON-07 | Barter: item-for-item exchange proposals and acceptance flows. | Flag OFF |
| MON-08 | Asset rental engine for non-vehicle assets with availability and terms. | Flag OFF |
| MON-09 | Order and cart engine: cart, checkout, order states. | Flag OFF |
| MON-10 | Delivery architecture: seller or third-party delivery fields, order tracking states (Requested, In Transit, Delivered), admin delivery fee matrix by zone and a courier integration abstraction. | Flag OFF |
| MON-11 | Google AdMob integration in layout frames. | Flag OFF |
| MON-12 | Each engine must have its own Admin toggle so it can be enabled individually, with immediate effect and no redeployment. | Active |
| MON-13 | The Admin must be able to configure pricing, plans, currencies and gateway availability per country. | Flag OFF |
| MON-14 | Enabling monetization must expose payment gateways and subscription tiers without changing app versions. | Flag OFF |

### Business Rules
- Every engine ships with database tables, API endpoints, admin controllers and tests; only the user-facing exposure is gated.
- Flags are cached and propagated within 60 seconds.
- An engine is accepted when it meets its Appendix B bar; engines beyond that bar require a Change Request. **[V3-CLARIFY]**

### Admin Controls
- Feature Flag Remote Control Center with per-engine toggles and change history.

### Acceptance Criteria
- Setting ENABLE_MONETIZATION to true exposes the configured monetization UI without an app release.
- With the flag false, no pricing UI appears anywhere in the apps.

---

## 7.19 M19 — Media Processing, Photo & Video Pipeline

| | |
|---|---|
| **Purpose** | Ingest, optimize, store and deliver photos and short videos efficiently under weak-network conditions. |
| **Launch Status** | Active. Video uploads are fully active at launch. |
| **Primary Actors** | Seller, Admin |
| **Scope Reference** | Annex A index items 69, 71; A.3.5 |

### Functional Requirements

| ID | Requirement | Launch |
|---|---|---|
| MED-01 | The app must compress photos on the device before upload (maximum 1920 by 1080). | Active |
| MED-02 | The server must convert images to WebP (and AVIF where supported), generate thumbnails in multiple sizes, and strip EXIF location data. | Active |
| MED-03 | The system must serve thumbnail sizes dynamically based on user connection speed and Data Saver Mode. | Active |
| MED-04 | The system must support listing videos of 15 to 30 seconds with chunked upload, resumable within a session, and validation of duration and size. | Active |
| MED-05 | Video size and duration limits must be enforced on server and client using current admin settings (for example 30 seconds and 15 MB). Because raw phone video typically exceeds 15 MB, the app must transcode or compress video on device to the active limits before upload and show the user the resulting size. **[V3-FIX]** | Active |
| MED-06 | The Admin must be able to enable or disable video uploads globally or per category, adjust maximum duration (for example 15s versus 30s) and file size limits (for example 15 MB), live and without app store updates. | Active |
| MED-07 | The system must generate a video poster frame and deliver video through the CDN with zero egress cost storage (Cloudflare R2 or AWS S3). | Active |
| MED-08 | The system must limit the number of photos per listing (configurable, default 10) and allow reordering and a cover photo. | Active |
| MED-09 | A scheduled job must remove orphaned and unreferenced files. | Active |
| MED-10 | Private documents (CVs, certificates, verification files, receipts) must be stored in private buckets and accessed only through short-lived signed URLs (5 minutes or less). | Active |
| MED-11 | The pipeline must calculate perceptual image hashes for duplicate detection and blacklist matching. | Active |
| MED-12 | Data Saver Mode must disable auto-loading heavy media and use compressed thumbnails. | Active |
| MED-13 | **[V3-ADD]** A server-side video worker (ffmpeg) must validate uploads, transcode to a web-friendly H.264/AAC MP4 at a capped resolution and bitrate, extract the poster frame, and reject files that cannot be brought within limits, with a clear localized message. | Active |

### Business Rules
- Upload retries within an active session must be idempotent to prevent duplicate files.

### Admin Controls
- Media Limits panel: global video toggle, per-category toggle, duration, size, photo count.

### Acceptance Criteria
- A 15 MB, 30-second video uploads and plays; a larger file is compressed on device or rejected with a clear message.
- A raw phone clip over the limit is reduced on device and accepted when it fits.
- Changing the limit in the dashboard takes effect without a release.

---

## 7.20 M20 — Maps, Location & Geography

| | |
|---|---|
| **Purpose** | Provide accurate and low-cost location capture, display and proximity features. |
| **Launch Status** | Active |
| **Primary Actors** | Seller, Buyer, Admin |
| **Scope Reference** | Annex A index items 33, 37, 105, 107 |

### Functional Requirements

| ID | Requirement | Launch |
|---|---|---|
| GEO-01 | Map display, radius maps, list-view spatial browsing and static tiles must use OpenStreetMap data with Leaflet on web and an OSM-compatible renderer on mobile (react-native-maps with OSM tiles or an embedded Leaflet view, decided at design sign-off). Tiles must come from a provider or self-hosted server whose usage terms permit production traffic; the public OSM tile servers must not be used for production load. **[V3-FIX]** | Active |
| GEO-02 | Address autocomplete (Places) and reverse geocoding pin-drop during listing creation must use Google Maps APIs as the precision layer. Google coverage of informal Sudanese addresses must be validated during design; manual pin-drop and admin geography (GEO-06) remain the fallback. **[V3-CLARIFY]** | Active |
| GEO-03 | Google Maps requests (Places, Geocoding) must be proxied through the API gateway, which enforces daily hard request caps and per-user and per-IP limits; Google API keys must also have quota caps set in Google Cloud and must never be shipped as unrestricted keys. **[V3-FIX]** | Active |
| GEO-04 | Google Cloud billing threshold alerts must be configured at $10, $25 and $50; because billing alerts notify but do not stop spend, the gateway cap in GEO-03 is the enforcement mechanism. **[V3-CLARIFY]** | Active |
| GEO-05 | The Admin Dashboard must show a Geofencing and Map Usage Monitor with request counts, daily caps and alert logs. | Active |
| GEO-06 | The system must maintain an admin-editable Sudan geography: states, cities and neighborhoods, with Arabic and English names. | Active |
| GEO-07 | Users must be able to use current GPS location, search an address or drop a pin; manual city selection must work when GPS is denied. | Active |
| GEO-08 | Distance calculations must use PostGIS (geography type with a GiST index) so sorting and radius filters are accurate and fast. | Active |
| GEO-09 | Sellers must be able to hide the exact pin and show an approximate area where privacy requires it; the exact coordinates are never returned by public endpoints for such listings. | Active |

### Admin Controls
- Location hierarchy editor; Google Maps cap and alert configuration.

### Acceptance Criteria
- Browsing maps with OpenStreetMap data does not consume Google Maps quota.
- When the daily Google cap is reached, autocomplete degrades to manual city and pin selection without blocking posting.

---

## 7.21 M21 — Localization, Multi-Currency & Regional Expansion

| | |
|---|---|
| **Purpose** | Deliver an Arabic-first bilingual experience and a country-aware data model for future markets. |
| **Launch Status** | Active for Sudan; additional countries are configuration-driven. |
| **Primary Actors** | All users, Super Admin |
| **Scope Reference** | Annex A index items 4, 6, 105–110, 112, 113 |

### Functional Requirements

| ID | Requirement | Launch |
|---|---|---|
| LOC-01 | The apps must be Arabic-first with native RTL layout and also support English LTR, switchable at runtime. In React Native, a direction change may require the app to reload its JavaScript layer once; this reload (without reinstall or manual restart) is acceptable. **[V3-CLARIFY]** | Active |
| LOC-02 | All text must come from a central translation key database so new languages can be added without code changes. | Active |
| LOC-03 | The Admin must be able to edit translations and see missing keys, with fallback to English. | Active |
| LOC-04 | The platform must store SDG and USD natively, display the listing currency, and show an optional converted indicator using an admin-managed rate. Every rate has an effective date; rates older than the staleness limit (Appendix C) raise an admin alert and suppress converted indicators and cross-currency price insights. **[V3-CLARIFY]** | Active |
| LOC-05 | Phone validation must follow country rules with Sudanese operators and +249 prioritized. | Active |
| LOC-06 | The data model must be multi-tenant by country with localized currency formats, number and date formats and region-specific policies. | Active |
| LOC-07 | The Country Settings Matrix must allow per-country overrides of categories, payment methods, languages, legal pages and feature flags. | Active |
| LOC-08 | The system must localize emails, push notifications and legal pages by language. | Active |
| LOC-09 | The platform must support Sudan-specific content: city structures, traditional clothing terms and local transport categories. | Active |
| LOC-10 | A regional delivery engine with zonal mapping must be prepared for local courier partnerships. | Flag OFF |

### Admin Controls
- Translation manager; exchange rate manager; Country Settings Matrix.

### Acceptance Criteria
- Switching language flips layout direction and all visible strings without reinstalling or manually restarting the app (one automatic UI reload is permitted).
- Adding a new country needs configuration only.

---

## 7.22 M22 — User Dashboard, Favorites, Saved Searches & Data Rights

| | |
|---|---|
| **Purpose** | Give users one place to manage activity and exercise control over their data. |
| **Launch Status** | Active |
| **Primary Actors** | Registered User |
| **Scope Reference** | Annex A index items 47, 73, 74, 75 |

### Functional Requirements

| ID | Requirement | Launch |
|---|---|---|
| DASH-01 | The user dashboard must show my listings, drafts, favorites, saved searches, applications, rental requests, appointments, notifications, reviews and security settings. | Active |
| DASH-02 | Users must be able to favorite listings and receive notifications for price drops and status changes. | Active |
| DASH-03 | Users must be able to save searches and manage alert frequency. | Active |
| DASH-04 | Users must be able to request a data export that delivers their profile and activity as structured JSON, aligned with GDPR principles, within 7 days (target: minutes to hours via background job). | Active |
| DASH-05 | Users must be able to request account deletion; the request requires identity verification (re-authentication and email confirmation), enters a deletion queue with a configurable grace period (default 30 days), then anonymizes or removes personal data permanently. | Active |
| DASH-06 | Deletion must anonymize chat and review authorship where records must be retained and remove CVs, documents and contact data. Audit-log entries remain valid because they hold only pseudonymous IDs (TRS-12). **[V3-CLARIFY]** | Active |
| DASH-07 | Users must be able to pause (deactivate) their account and reactivate it later. | Active |
| DASH-08 | The dashboard must show listing performance summaries: views, favorites, chats and WhatsApp taps. | Active |

### Business Rules
- Deletion requests can be cancelled during the grace period.

### Acceptance Criteria
- A user can export their data and request deletion from the app without contacting support.

---

## 7.23 M23 — Content, Help Center, Legal, SEO & Deep Linking

| | |
|---|---|
| **Purpose** | Manage editable content, discoverability on the web and seamless links between web and apps. |
| **Launch Status** | Active |
| **Primary Actors** | Guest, User, Admin |
| **Scope Reference** | Annex A index items 68, 88, 90, 92 |

### Functional Requirements

| ID | Requirement | Launch |
|---|---|---|
| CMS-01 | A Help Center and FAQ must cover safe trading, payments, account management, jobs, rentals, appointments and platform rules, editable by Admin in both languages. | Active |
| CMS-02 | Legal pages (Privacy Policy, Terms of Use, Trading Rules) must be version controlled; publishing a new version must record the effective date and, where required, request user acceptance. | Active |
| CMS-03 | The web portal must render pages server-side with dynamic Open Graph tags, canonical URLs and structured data for listings. | Active |
| CMS-04 | The system must generate XML sitemaps automatically, including category and listing pages, and robots rules. | Active |
| CMS-05 | Listing, business, job and category links must open in the app through Universal Links and App Links and fall back to the web. | Active |
| CMS-06 | Home banners and promotional content blocks must be manageable by Admin with schedules and targeting by language and country. | Active |
| CMS-07 | The Admin must be able to create static pages and announcement banners. | Active |
| CMS-08 | The system must provide support contact and ticket entry points from the Help Center. | Active |
| CMS-09 | **[V3-ADD]** A public, web-accessible account-deletion information and request page must exist (required by Google Play data-safety policy and recommended for App Store review), linked from the store listings and the Privacy Policy. | Active |

### Acceptance Criteria
- A new legal version is published without an app release and is shown with its effective date.
- The account-deletion page is reachable without installing the app.

---

## 7.24 M24 — Admin Dashboard & Control Engine

| | |
|---|---|
| **Purpose** | A secure Next.js control panel giving operators full dynamic control of the platform without developers. |
| **Launch Status** | Active |
| **Primary Actors** | Super Admin, Moderator, Support Agent, Finance Auditor |
| **Scope Reference** | Annex A index items 76–79, 86, 87, 89 |

### Functional Requirements

| ID | Requirement | Launch |
|---|---|---|
| ADM-01 | The Admin home must show live KPIs: new users, new listings, active chats, open reports, pending verifications and pending payments. | Active |
| ADM-02 | User management: search, view, edit, suspend, ban, restore, badge assignment and session revocation. | Active |
| ADM-03 | Listing management: search any listing, edit, hide, suspend, delete, restore and view edit history. | Active |
| ADM-04 | EAV Schema Builder: create, edit, reorder and archive categories, subcategories, attributes, validation rules and dropdown values live, with form preview. | Active |
| ADM-05 | Post-Moderation Audit Center: live stream of new listings, reports queue, flagged listing management, account suspension tools and content editing portal. | Active |
| ADM-06 | Verification queue for users, dealers, businesses and employers. | Active |
| ADM-07 | Candidate CV Processing Portal: queue of Create-CV requests, structured JSON view, document generator integration and in-app delivery router. | Active |
| ADM-08 | Payment Verification Console with receipt zoom, pan and rotation, approve and reject with reasons. | Active |
| ADM-09 | Feature Flag Remote Control Center: global switches for video uploads, SMS OTP, WhatsApp OTP, email OTP (subject to AUTH-15), monetization engines, category posting restrictions, delayed-visibility mode and other modules. | Active |
| ADM-10 | Media limits control: video toggle (global and per category), maximum duration, file size and photo count. | Active |
| ADM-11 | Geofencing and Map Usage Monitor: Google Maps request counts, daily caps and billing alert logs. | Active |
| ADM-12 | Content management: banners, Help Center, legal pages, static pages and translations. | Active |
| ADM-13 | Notification broadcast composer with audience selection and scheduling. | Active |
| ADM-14 | Country Settings Matrix: per-country categories, payments, languages and flags. | Active |
| ADM-15 | App version management: force-update triggers and minimum supported versions through remote config. | Active |
| ADM-16 | Maintenance mode: admin-scheduled platform lockouts with localized status banners. | Active |
| ADM-17 | Role-Based Access Control on a separate AdminUser model with exactly four sub-roles: Super Admin, Content Moderator, Support Agent and Financial Auditor, with a configurable permission matrix. Only Super Admin may create admins or change roles. **[V3-FIX]** | Active |
| ADM-18 | Admin security: mandatory 2FA, IP logging, session revocation, and optional IP allow-listing for Super Admin. | Active |
| ADM-19 | Audit log viewer: immutable records of every approval, deletion, status change and configuration change, filterable by actor, entity and date; read-only for Financial Auditor and Super Admin. **[V3-FIX]** | Active |
| ADM-20 | Analytics and reports with export to CSV. | Active |
| ADM-21 | Support tools: impersonation-free user context view, ticket notes and rental or appointment lookup. | Active |
| ADM-22 | System Health view: uptime, error rates, queue depth, database and cache metrics. | Active |
| ADM-23 | **[V3-ADD]** Configurable-defaults console: every threshold in Appendix C (caps, rate limits, auto-hide and risk thresholds, price-insight minimum, staleness limits) is editable in the dashboard with audit-logged before and after values. | Active |

### Business Rules
- All admin endpoints require RBAC authorization checks and 2FA-authenticated sessions.
- Admin actions never delete audit records.

### Acceptance Criteria
- A Moderator cannot access finance, flags or EAV builder.
- A Financial Auditor can read but not alter audit logs or admin roles.
- A configuration change appears in the audit log with actor, time and before and after values.

---

## 7.25 M25 — Analytics & Reporting

| | |
|---|---|
| **Purpose** | Measure product health and marketplace performance using anonymized, privacy-respecting analytics. |
| **Launch Status** | Active |
| **Primary Actors** | Admin, Business Owner |
| **Scope Reference** | Annex A index item 93 |

### Functional Requirements

| ID | Requirement | Launch |
|---|---|---|
| ANL-01 | The system must record anonymized events: sessions, searches, listing views, favorites, leads, applications, requests and posting funnel steps. | Active |
| ANL-02 | The Admin must have dashboards for retention, active users, listings by category, search trends, zero-result queries and listing conversion. | Active |
| ANL-03 | Other-category analytics must show the most frequent custom entries to guide new categories. | Active |
| ANL-04 | Business owners must see their own performance analytics. | Active |
| ANL-05 | Reports must be exportable as CSV on demand and by schedule. | Active |
| ANL-06 | Analytics must respect consent and the data retention schedule (Appendix D). | Active |

### Acceptance Criteria
- The posting funnel shows the drop-off rate at each step.

---

## 7.26 M26 — Platform Services, Infrastructure & Operations

| | |
|---|---|
| **Purpose** | Cross-cutting services that keep the platform configurable, observable, secure and maintainable. |
| **Launch Status** | Active |
| **Primary Actors** | Super Admin, Engineering |
| **Scope Reference** | Annex A index items 79–87, 94–98 |

### Functional Requirements

| ID | Requirement | Launch |
|---|---|---|
| SYS-01 | A feature flag service backed by the database and cached in Redis must serve flags to API, apps and admin, with 60-second propagation. | Active |
| SYS-02 | Remote config must deliver minimum app versions, maintenance mode and media limits to clients. | Active |
| SYS-03 | Background jobs (BullMQ on Redis) must run scanning, expiry, reminders, notifications, media cleanup, video transcoding, exports and report generation, with retries and dead-letter handling. | Active |
| SYS-04 | The API must be RESTful, documented with OpenAPI/Swagger and return structured error codes. | Active |
| SYS-05 | Search must use indexed search with Arabic normalization, trigram matching and ranking functions in PostgreSQL. | Active |
| SYS-06 | The integration layer must separate payment, notification, content-classification, maps-proxy and core functions behind adapters. | Active |
| SYS-07 | CI/CD must use GitHub Actions for Development, Staging and Production with automated tests and migrations. | Active |
| SYS-08 | Security controls must include server-side sanitization, parameterized queries, rate limiting and HTTPS/TLS everywhere. | Active |
| SYS-09 | Monitoring must include uptime checks, Sentry error tracking and database and cache metrics with alerting. | Active |
| SYS-10 | Audit logs must be append-only with tamper-evident chaining; entries hold pseudonymous IDs only (TRS-12). | Active |
| SYS-11 | Backups must include automated daily database snapshots stored off-site on object storage, with documented restore procedures and a restore test before production launch. | Active |
| SYS-12 | The system must ship a comprehensive automated test suite: unit, integration, API and UI tests across iOS, Android and Web. | Active |
| SYS-13 | Docker containerization and docker-compose scripts must allow any team to run the stack. | Active |
| SYS-14 | Environment templates (.env.example), Prisma migrations (including the hand-written PostGIS, trigram, GIN and partitioning SQL) and Swagger specs must be included in the repositories. | Active |
| SYS-15 | **[V3-ADD]** A retention job must enforce the Data Retention Schedule (Appendix D) and log each purge run in JobRun. | Active |
| SYS-16 | **[V3-ADD]** The Handover Package must include store-account and signing-key transfer (Google Play app transfer, Play App Signing, Firebase project), DNS and third-party account ownership, in addition to repositories (NFR-MNT-03). | Active |

### Acceptance Criteria
- A fresh clone can be started locally with docker-compose and seeded data following the README.
- A purge run removes expired data per Appendix D and records the run.

---
# 8. Non-Functional Requirements

Non-functional requirements define how well the platform must perform, protect data and be operated. Targets are engineering targets validated during UAT and monitored in production. Vague terms in V2 ("quickly", "few steps") are replaced with measurable values. **[V3-CLARIFY]**

## 8.1 Performance

| ID | Requirement | Target / Measure |
|---|---|---|
| NFR-PERF-01 | Cached read API endpoints (category schema, home feed, listing detail) must respond under normal load. | Median under 100 ms; p95 under 300 ms at the API gateway |
| NFR-PERF-02 | Search queries must return results including dynamic filters and geo-radius. | p95 under 500 ms for up to 100,000 active listings, with promoted-attribute filters applied |
| NFR-PERF-03 | Write endpoints such as listing submit must complete, excluding media upload time. | p95 under 800 ms |
| NFR-PERF-04 | Mobile cold start to interactive home screen on a mid-range Android device. | Under 3 seconds on 4G |
| NFR-PERF-05 | Real-time chat message delivery latency. | Under 2 seconds p95 |
| NFR-PERF-06 | Web pages must be fast to render and index. | Largest Contentful Paint under 2.5 seconds on 4G |
| NFR-PERF-07 | Image delivery must use CDN caching with WebP and responsive sizes. | Cache hit ratio of 90% or higher for media |
| NFR-PERF-08 | **[V3-ADD]** Weak-network profile: core flows (home feed, search, listing detail, send message) must remain usable on a throttled 3G profile (about 1.6 Mbps down, 300 ms latency). | Home screen interactive under 6 seconds; listing detail under 4 seconds; no flow fails outright |

## 8.2 Scalability

| ID | Requirement | Target / Measure |
|---|---|---|
| NFR-SCAL-01 | API and socket servers must be stateless and horizontally scalable behind a load balancer using the Redis adapter. | Scale-out without code change |
| NFR-SCAL-02 | The database must use partitioned listing tables, proper indexes and a path to read replicas. | Supports growth to 1 million listings without redesign |
| NFR-SCAL-03 | Background work must run on queues so spikes do not slow user-facing APIs. | Queue backlog alerts at defined thresholds |
| NFR-SCAL-04 | The architecture must allow adding a new country or vertical through configuration. | No core rebuild required |

## 8.3 Availability & Reliability

| ID | Requirement | Target / Measure |
|---|---|---|
| NFR-REL-01 | The platform must target high availability on the allocated hosting infrastructure with documented scale-up steps. | 99.5% monthly availability target |
| NFR-REL-02 | Automated daily database backups with off-site storage and tested restore. | RPO 24 hours; RTO 4 hours target; restore tested before launch and quarterly |
| NFR-REL-03 | Critical writes must be idempotent where retries can occur (media upload chunks, messages, notifications, payments). | No duplicate records on retry |
| NFR-REL-04 | The system must degrade gracefully when third-party services fail (Maps, FCM, email, content classification). | Core browsing and posting continue; failures are queued and retried |
| NFR-REL-05 | Planned maintenance must use maintenance mode with localized banners. | No unannounced downtime for releases |

## 8.4 Security

| ID | Requirement | Target / Measure |
|---|---|---|
| NFR-SEC-01 | All traffic must be encrypted in transit. | TLS 1.2 or higher with HSTS |
| NFR-SEC-02 | Passwords must be hashed with a modern adaptive algorithm; OTP codes and tokens stored hashed. | Argon2id or bcrypt with cost per current guidance |
| NFR-SEC-03 | Access tokens must be short lived with rotating refresh tokens and server-side revocation. | Access token lifetime 15 minutes or less |
| NFR-SEC-04 | All inputs must be validated and sanitized on the server; queries parameterized. | No known OWASP Top 10 findings at UAT |
| NFR-SEC-05 | Rate limiting must protect authentication, search, messaging, contact-reveal and upload endpoints. | Per IP, per user and per device limits |
| NFR-SEC-06 | Private documents must be encrypted at rest and delivered with short-lived signed URLs. | URL validity 5 minutes or less |
| NFR-SEC-07 | Admin access must require 2FA, RBAC and IP logging. | 100% of admin accounts |
| NFR-SEC-08 | Secrets must be kept in environment configuration, never in source control; dependencies scanned in CI. | CI fails on critical vulnerabilities |
| NFR-SEC-09 | CORS, CSRF protection for admin web, secure headers and content security policy must be enforced. | Enabled in all environments |
| NFR-SEC-10 | Security-relevant events must be logged without storing sensitive content. | Audit log coverage of admin and moderation actions |
| NFR-SEC-11 | **[V3-ADD]** Third-party API keys (Google Maps, SMS, email) must be restricted by application or IP and quota-capped; no unrestricted key may be embedded in a client. | Verified in security review at UAT |

## 8.5 Privacy & Compliance

| ID | Requirement | Target / Measure |
|---|---|---|
| NFR-PRV-01 | Personal data must be collected only for stated purposes with versioned privacy policy and consent where required. | Policy shown and versioned |
| NFR-PRV-02 | Users must be able to export and delete their data. | Export within 7 days; deletion after grace period |
| NFR-PRV-03 | Candidate documents must be private by default and accessible only on application. | Zero public exposure |
| NFR-PRV-04 | Analytics must be anonymized and privacy-preserving. | No personal data in analytics payloads |
| NFR-PRV-05 | App store privacy declarations must match actual data collection. | Accurate store submissions |
| NFR-PRV-06 | **[V3-ADD]** A Data Retention Schedule (Appendix D) must be approved by the Client, with legal review, before production launch; the governing law and the GDPR-aligned principles applied are stated in the published Privacy Policy. | Approved schedule on file; policy published |

## 8.6 Usability & Accessibility

| ID | Requirement | Target / Measure |
|---|---|---|
| NFR-UX-01 | Interfaces must be simple, modern and consistent, with Arabic RTL as the primary experience. | Design review sign-off in Milestone 2 |
| NFR-UX-02 | Core flows (post, search, contact, apply) must be completable in a small number of steps. | Post: at most 6 screens, 3 minutes median; apply: at most 3 screens; contact: 1 tap from detail |
| NFR-UX-03 | The UI must meet accessibility basics: high contrast, screen reader labels, scalable typography and adequate touch targets. | WCAG 2.1 AA target for key flows |
| NFR-UX-04 | Clear empty, loading and error states with actionable messages in both languages. | Present on every screen |
| NFR-UX-05 | Forms must preserve entered data during the session **and across app termination for the listing form (LST-19)** and validate inline. | No data loss on validation errors, app kill or crash |

## 8.7 Network & Data Efficiency

| ID | Requirement | Target / Measure |
|---|---|---|
| NFR-NET-01 | Client-side compression and server WebP conversion must minimize data usage. | Typical listing photo under 300 KB after processing |
| NFR-NET-02 | Data Saver Mode must reduce media loading and use small thumbnails. | At least 50% reduction in image bytes in Data Saver Mode |
| NFR-NET-03 | API responses must be compact, paginated and cacheable, with compression enabled. | Gzip or Brotli on all text responses |
| NFR-NET-04 | Schema and config payloads must use ETags to avoid repeat downloads. | 304 responses when unchanged |

## 8.8 Compatibility

| ID | Requirement | Target / Measure |
|---|---|---|
| NFR-CMP-01 | Mobile apps must support current and recent iOS and Android versions. | iOS 15 or later and Android 8.0 (API 26) or later, confirmed at design sign-off against the selected React Native version |
| NFR-CMP-02 | Web must support current evergreen browsers on desktop and mobile. | Latest two versions of Chrome, Safari, Firefox and Edge |
| NFR-CMP-03 | Layouts must adapt to phones, tablets and desktop widths. | Responsive from 320 px upward |

## 8.9 Maintainability & Ownership

| ID | Requirement | Target / Measure |
|---|---|---|
| NFR-MNT-01 | Code must be strictly typed TypeScript with linting, formatting and consistent module boundaries. | CI lint and type checks must pass |
| NFR-MNT-02 | Shared logic must live in the core package with semantic versioning. | Both apps consume core by version |
| NFR-MNT-03 | All repositories must live in the client GitHub account with no vendor lock-in; store accounts, signing keys, Firebase project and third-party accounts are transferred or owned by the Client at handover. | Client has root admin from Day One; transfer checklist signed at M5 |
| NFR-MNT-04 | Documentation must include architecture, API, runbooks and onboarding. | Delivered at handover |

## 8.10 Observability & Operations

| ID | Requirement | Target / Measure |
|---|---|---|
| NFR-OBS-01 | Structured logs, error tracking and metrics must be available for API, workers and apps. | Sentry and metrics dashboards live in staging and production |
| NFR-OBS-02 | Alerts must exist for uptime, error spikes, queue backlog, Google Maps usage and stale exchange rates. | Alerts to the operations contact |
| NFR-OBS-03 | Feature flag changes and deployments must be traceable. | Entry in audit log and deployment history |

## 8.11 Quality & Testing

| ID | Requirement | Target / Measure |
|---|---|---|
| NFR-QA-01 | Every feature must meet the Definition of Done: UI, API, database, tests and Admin control complete. | 100% of in-scope features at UAT |
| NFR-QA-02 | Automated tests must cover core domain logic and critical API flows. | Unit coverage of 70% or higher on core modules |
| NFR-QA-03 | Release candidates must pass regression and a performance smoke test on staging before production. | Required gate in CI/CD |
| NFR-QA-04 | No UI-only mockups, fake static JSON or incomplete code may be delivered. | Zero at UAT sign-off |

---

# 9. Data Model & Entity Architecture

## 9.1 Entity Catalog

The core schema in 9.2 is the starting Prisma specification. The catalog lists every entity group the platform needs; each group maps to modules in Section 7. Additional tables follow the same conventions: UUID keys, created and updated timestamps, soft delete where users can remove data, and indexes for every filter and join used by search. **[V3-FIX]** V2's catalog listed entities (ChatThread, Offer, CvBuildRequest, ListingMedia, Session and others) that its sample schema omitted; 9.2 now includes them.

| Entity Group | Key Entities | Modules |
|---|---|---|
| Identity & Access | User, UserCapability, Session, OtpCode, SocialIdentity, LoginEvent, AdminUser, AdminRoleDef, AdminSession, Permission | M01, M02, M24 |
| Catalog (EAV) | Category, CategoryAttribute, AttributeOption, CategorySchemaVersion, OtherEntry | M03 |
| Listings | Listing, ListingMedia, ListingEdit, ListingView, Favorite, SavedSearch, WantedListing | M04, M05, M06 |
| Messaging | ChatThread, ChatMessage, Offer, BlockedUser | M07 |
| Automotive | RentalRequest, ServiceProfile, ServiceSlot, ServiceAppointment, VehicleMake, VehicleModel | M08 |
| Real Estate & Others | PropertyProject, AccommodationInquiry, AvailabilityBlock | M09, M11 |
| Jobs | Job, JobApplication, CandidateProfile, CandidateDocument, CvBuildRequest, EmployerProfile | M10 |
| Business | BusinessProfile, BusinessStaff, BusinessMetricDaily | M14 |
| Trust & Safety | Report, ModerationAction, Appeal, Review, FraudSignal, Blacklist, VerificationRequest, Badge | M15 |
| Notifications | Notification, DeviceToken, NotificationPreference, Broadcast | M16 |
| Payments | Payment, LedgerEntry, Receipt, Invoice, Subscription, Plan, CreditBalance, Promotion | M17, M18 |
| Content & Config | FeatureFlag, RemoteConfig, Translation, Banner, StaticPage, LegalDocumentVersion, CountrySetting, ExchangeRate | M21, M23, M26 |
| Geography | Country, State, City, Neighborhood | M20 |
| Operations | AuditLog, AnalyticsEvent, JobRun, MediaAsset | M25, M26 |

## 9.2 Core Prisma Specification (corrected)

Corrections against V2 **[V3-FIX]**: capability-based roles and a separate admin model; account status and language on User; no unique constraint on unverified phone numbers; listing currency, type, readable ID, expiry, quality score, view count, country and city, soft delete and PostGIS location; budget range for Wanted listings; `Draft`, `AutoHidden` statuses; ordered media table; archive and index-promotion fields on attributes with a unique `(categoryId, attributeKey)`; ChatThread, ChatMessage receipts and Offer; CV status enum aligned with JOB-11.

Notes: PostGIS, pg_trgm, partitioning, GIN and expression indexes are added in hand-written SQL migrations. `Unsupported()` columns are written only through raw SQL. Run `prisma validate` and `prisma migrate dev` in Milestone 1 to confirm; the schema is a specification, not yet machine-validated.

```prisma
// Core database schema for MARBOU (V3 corrected specification)

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [postgis, pg_trgm]
}

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

// ---------- Enums ----------
enum AccountStatus { ACTIVE SUSPENDED DEACTIVATED PENDING_DELETION }
enum Capability { SELLER DEALER EMPLOYER SERVICE_PROVIDER CANDIDATE }
enum AdminRole { SUPER_ADMIN CONTENT_MODERATOR SUPPORT_AGENT FINANCIAL_AUDITOR }
enum Language { AR EN }
enum Currency { SDG USD }

enum ListingType { SALE RENT WANTED SERVICE JOB_REFERENCE }
enum ListingStatus {
  DRAFT
  ACTIVE
  HIDDEN       // moderator action
  AUTO_HIDDEN  // system: report or risk threshold
  SUSPENDED
  SOLD
  EXPIRED
  ARCHIVED
}
// "Submitted" is transient (resolves to ACTIVE in the same request); soft delete uses Listing.deletedAt.

enum AttributeType { TEXT NUMBER BOOLEAN SINGLE_SELECT MULTI_SELECT DATE RANGE FILE_URL }
enum MessageType { TEXT IMAGE OFFER SYSTEM }
enum OfferStatus { PENDING ACCEPTED REJECTED COUNTERED WITHDRAWN }
enum CvBuildStatus { PENDING IN_PROGRESS DELIVERED REVISION_REQUESTED APPROVED }
enum ApplicationStatus { SUBMITTED VIEWED SHORTLISTED INTERVIEW REJECTED HIRED WITHDRAWN }
enum ReviewContext { CHAT RENTAL APPOINTMENT HOTEL_INQUIRY }

// ---------- Identity & access ----------
model User {
  id                  String        @id @default(uuid())
  email               String?       @unique
  emailVerifiedAt     DateTime?
  phoneNumber         String?       // contact field, NOT unique
  verifiedPhoneNumber String?       @unique // set only after phone OTP (flag OFF at launch)
  passwordHash        String?
  fullName            String
  avatarUrl           String?
  language            Language      @default(AR)
  status              AccountStatus @default(ACTIVE)
  statusReason        String?
  countryId           String?
  country             Country?      @relation(fields: [countryId], references: [id])
  deletionRequestedAt DateTime?
  createdAt           DateTime      @default(now())
  updatedAt           DateTime      @updatedAt
  deletedAt           DateTime?

  capabilities     UserCapability[]
  badges           UserBadge[]
  sessions         Session[]
  socialIdentities SocialIdentity[]
  listings         Listing[]
  candidateProfile CandidateProfile?
  cvRequests       CvBuildRequest[]
  threadsAsBuyer   ChatThread[]      @relation("ThreadBuyer")
  threadsAsSeller  ChatThread[]      @relation("ThreadSeller")
  sentMessages     ChatMessage[]     @relation("SentMessages")
  favorites        Favorite[]
}

model UserCapability {
  id        String     @id @default(uuid())
  userId    String
  user      User       @relation(fields: [userId], references: [id])
  capability Capability
  grantedAt DateTime   @default(now())
  revokedAt DateTime?
  @@unique([userId, capability])
}

model UserBadge {
  id        String    @id @default(uuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id])
  badge     String    // VERIFIED_SELLER | VERIFIED_DEALER | VERIFIED_BUSINESS | VERIFIED_EMPLOYER | VERIFIED_SERVICE_PROVIDER
  grantedBy String    // AdminUser.id
  grantedAt DateTime  @default(now())
  revokedAt DateTime?
  @@index([userId])
}

model SocialIdentity {
  id         String   @id @default(uuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  provider   String   // GOOGLE | FACEBOOK | APPLE
  providerId String
  email      String?
  createdAt  DateTime @default(now())
  @@unique([provider, providerId])
}

model Session {
  id            String    @id @default(uuid())
  userId        String
  user          User      @relation(fields: [userId], references: [id])
  familyId      String    // refresh-token family for reuse detection
  refreshHash   String
  deviceName    String?
  os            String?
  approxLocation String?
  lastActiveAt  DateTime  @default(now())
  revokedAt     DateTime?
  createdAt     DateTime  @default(now())
  @@index([userId])
  @@index([familyId])
}

model AdminUser {
  id           String    @id @default(uuid())
  email        String    @unique
  passwordHash String
  fullName     String
  role         AdminRole
  totpSecret   String    // encrypted; 2FA mandatory
  ipAllowlist  String[]
  isActive     Boolean   @default(true)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}

// ---------- Geography ----------
model Country {
  id           String  @id @default(uuid())
  code         String  @unique   // SD
  dialCode     String            // +249
  nameEn       String
  nameAr       String
  defaultCurrency Currency
  isActive     Boolean @default(true)
  states       State[]
  users        User[]
  listings     Listing[]
}

model State {
  id        String  @id @default(uuid())
  countryId String
  country   Country @relation(fields: [countryId], references: [id])
  nameEn    String
  nameAr    String
  cities    City[]
}

model City {
  id       String   @id @default(uuid())
  stateId  String
  state    State    @relation(fields: [stateId], references: [id])
  nameEn   String
  nameAr   String
  listings Listing[]
}

// ---------- Catalog (EAV) ----------
model Category {
  id           String    @id @default(uuid())
  parentId     String?
  parent       Category? @relation("CategoryHierarchy", fields: [parentId], references: [id])
  children     Category[] @relation("CategoryHierarchy")
  slug         String    @unique
  nameEn       String
  nameAr       String
  iconUrl      String?
  displayOrder Int       @default(0)
  isActive     Boolean   @default(true)
  isArchived   Boolean   @default(false)
  postingRestricted Boolean @default(false)
  postingMessage String?
  expiryDays   Int       @default(30)
  attributes   CategoryAttribute[]
  listings     Listing[]
}

model CategoryAttribute {
  id             String        @id @default(uuid())
  categoryId     String
  category       Category      @relation(fields: [categoryId], references: [id])
  attributeKey   String        // immutable
  labelEn        String
  labelAr        String
  dataType       AttributeType
  isRequired     Boolean       @default(false)
  isFilterable   Boolean       @default(true)
  isSearchable   Boolean       @default(false)
  isArchived     Boolean       @default(false)
  promoteToIndex Boolean       @default(false) // expression index / promoted column
  displayOrder   Int           @default(0)
  optionsList    Json?         // array of options, may carry dependsOn
  validationRules Json?        // min, max, regex
  @@unique([categoryId, attributeKey])
}

model OtherEntry {
  id         String   @id @default(uuid())
  categoryId String
  text       String
  count      Int      @default(1)
  promotedTo String?
  createdAt  DateTime @default(now())
  @@index([categoryId, text])
}

// ---------- Listings ----------
model Listing {
  id                String        @id @default(uuid())
  publicSeq         Int           @unique @default(autoincrement()) // rendered as MARBOU-00001
  ownerId           String
  owner             User          @relation(fields: [ownerId], references: [id])
  businessId        String?
  countryId         String
  country           Country       @relation(fields: [countryId], references: [id])
  cityId            String?
  city              City?         @relation(fields: [cityId], references: [id])
  categoryId        String
  category          Category      @relation(fields: [categoryId], references: [id])
  listingType       ListingType   @default(SALE)
  title             String
  description       String
  price             Decimal?      @db.Decimal(14, 2)
  budgetMin         Decimal?      @db.Decimal(14, 2) // Wanted listings
  budgetMax         Decimal?      @db.Decimal(14, 2)
  currency          Currency      @default(SDG)
  isNegotiable      Boolean       @default(true)
  condition         String?
  status            ListingStatus @default(ACTIVE)
  statusReason      String?
  isCustomOther     Boolean       @default(false)
  customOtherText   String?
  // PostGIS geography(Point,4326) "location" column is added by SQL migration and queried via raw SQL
  locationName      String?
  isApproxLocation  Boolean       @default(false)
  approxRadiusM     Int?
  contactOptions    Json          // { call, whatsapp, chat }
  dynamicAttributes Json          // EAV payload key-value pairs
  qualityScore      Int           @default(0)
  viewCount         Int           @default(0)
  videoUrl          String?
  publishedAt       DateTime?
  expiresAt         DateTime?
  soldAt            DateTime?
  deletedAt         DateTime?
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt

  media    ListingMedia[]
  edits    ListingEdit[]
  threads  ChatThread[]
  favorites Favorite[]

  @@index([categoryId, status, publishedAt])
  @@index([ownerId, status])
  @@index([countryId, cityId, status])
  // GIN on dynamicAttributes, trigram on title, GiST on location, and expression indexes
  // for promoteToIndex attributes are created in SQL migrations. Listing is range-partitioned by createdAt.
}

model ListingMedia {
  id        String  @id @default(uuid())
  listingId String
  listing   Listing @relation(fields: [listingId], references: [id])
  url       String  // WebP / AVIF
  thumbUrl  String?
  position  Int
  isCover   Boolean @default(false)
  phash     String? // perceptual hash
  @@index([listingId, position])
  @@index([phash])
}

model ListingEdit {
  id        String   @id @default(uuid())
  listingId String
  listing   Listing  @relation(fields: [listingId], references: [id])
  editorId  String
  diff      Json
  createdAt DateTime @default(now())
  @@index([listingId])
}

model Favorite {
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  listingId String
  listing   Listing  @relation(fields: [listingId], references: [id])
  priceAtSave Decimal? @db.Decimal(14, 2)
  createdAt DateTime @default(now())
  @@id([userId, listingId])
}

// ---------- Messaging ----------
model ChatThread {
  id            String    @id @default(uuid())
  listingId     String?
  listing       Listing?  @relation(fields: [listingId], references: [id])
  buyerId       String
  buyer         User      @relation("ThreadBuyer", fields: [buyerId], references: [id])
  sellerId      String
  seller        User      @relation("ThreadSeller", fields: [sellerId], references: [id])
  businessId    String?
  lastMessageAt DateTime?
  isMutedByBuyer  Boolean @default(false)
  isMutedBySeller Boolean @default(false)
  createdAt     DateTime  @default(now())
  messages      ChatMessage[]
  offers        Offer[]
  @@unique([listingId, buyerId, sellerId])
}

model ChatMessage {
  id             String      @id @default(uuid())
  threadId       String
  thread         ChatThread  @relation(fields: [threadId], references: [id])
  senderId       String
  sender         User        @relation("SentMessages", fields: [senderId], references: [id])
  type           MessageType @default(TEXT)
  body           String?
  attachmentUrl  String?
  idempotencyKey String
  sentAt         DateTime    @default(now())
  deliveredAt    DateTime?
  readAt         DateTime?
  offer          Offer?
  @@unique([senderId, idempotencyKey])
  @@index([threadId, sentAt])
}

model Offer {
  id          String      @id @default(uuid())
  threadId    String
  thread      ChatThread  @relation(fields: [threadId], references: [id])
  messageId   String      @unique
  message     ChatMessage @relation(fields: [messageId], references: [id])
  offeredById String
  amount      Decimal     @db.Decimal(14, 2)
  currency    Currency
  status      OfferStatus @default(PENDING)
  counterOfId String?
  createdAt   DateTime    @default(now())
}

// ---------- Jobs ----------
model CandidateProfile {
  id               String    @id @default(uuid())
  userId           String    @unique
  user             User      @relation(fields: [userId], references: [id])
  dateOfBirth      DateTime?
  nationality      String?
  city             String?
  maritalStatus    String?
  hasDrivingLicense Boolean  @default(false)
  licenseCategory  String?
  licenseIssueDate DateTime?
  ownsVehicle      Boolean   @default(false)
  vehicleDetails   String?
  educationHistory Json      @default("[]")
  workExperience   Json      @default("[]")
  skills           String[]
  languages        Json      @default("[]") // language + proficiency (NATIVE|FLUENT|INTERMEDIATE|BASIC)
  certificateUrls  String[]  // private-bucket keys, never public URLs
  cvFileUrl        String?   // private-bucket key
  isPrivate        Boolean   @default(true)
  updatedAt        DateTime  @updatedAt
}

model CvBuildRequest {
  id           String        @id @default(uuid())
  userId       String
  user         User          @relation(fields: [userId], references: [id])
  payload      Json          // structured step-by-step form data
  status       CvBuildStatus @default(PENDING)
  assignedTo   String?       // AdminUser.id (Support Agent)
  deliveredUrl String?
  revisionNote String?
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
  @@index([status, createdAt])
}

model Job {
  id            String    @id @default(uuid())
  employerId    String
  title         String
  categoryId    String
  employmentType String   // FULL_TIME | PART_TIME | CONTRACT | DAILY
  salaryMin     Decimal?  @db.Decimal(14, 2)
  salaryMax     Decimal?  @db.Decimal(14, 2)
  currency      Currency?
  details       Json
  deadline      DateTime?
  status        ListingStatus @default(ACTIVE)
  createdAt     DateTime  @default(now())
  applications  JobApplication[]
}

model JobApplication {
  id          String            @id @default(uuid())
  jobId       String
  job         Job               @relation(fields: [jobId], references: [id])
  candidateId String
  tier        String            // QUICK | FULL
  snapshot    Json              // data shared with employer for this job only
  status      ApplicationStatus @default(SUBMITTED)
  notes       String?
  createdAt   DateTime          @default(now())
  @@unique([jobId, candidateId])
}

// ---------- Trust & operations ----------
model Review {
  id         String        @id @default(uuid())
  reviewerId String
  subjectId  String
  context    ReviewContext
  contextRef String        // thread / request / appointment / inquiry id
  rating     Int
  body       String?
  reply      String?
  createdAt  DateTime      @default(now())
  @@unique([reviewerId, context, contextRef]) // one review per interaction
}

model AuditLog {
  id        BigInt   @id @default(autoincrement())
  actorType String   // ADMIN | SYSTEM | USER
  actorId   String   // pseudonymous id; no personal data
  action    String
  entity    String
  entityId  String
  before    Json?    // no personal data in payloads
  after     Json?
  prevHash  String
  hash      String   // tamper-evident chain
  createdAt DateTime @default(now())
  @@index([entity, entityId])
  @@index([actorId, createdAt])
}

model FeatureFlag {
  key       String   @id
  enabled   Boolean  @default(false)
  config    Json?
  countryId String?
  updatedBy String
  updatedAt DateTime @updatedAt
}

model ExchangeRate {
  id            String   @id @default(uuid())
  base          Currency
  quote         Currency
  rate          Decimal  @db.Decimal(18, 6)
  effectiveFrom DateTime
  setBy         String
  @@index([base, quote, effectiveFrom])
}

model Payment {
  id        String   @id @default(uuid())
  userId    String
  amount    Decimal  @db.Decimal(14, 2)
  currency  Currency
  method    String   // BANKAK | ...
  reference String
  receiptKey String? // private bucket
  receiptHash String?
  state     String   // PENDING | APPROVED | REJECTED | REFUNDED
  reason    String?
  decidedBy String?
  createdAt DateTime @default(now())
  @@index([reference])
  @@index([receiptHash])
  @@index([state, createdAt])
}
// Remaining catalog entities (Report, ModerationAction, Appeal, Blacklist, VerificationRequest, Notification,
// DeviceToken, Broadcast, Plan, Subscription, Promotion, CountrySetting, Translation, Banner, etc.)
// follow the same conventions and are defined in Milestone 3 migrations.
```

---

# 10. API & Integration Specification

## 10.1 API Conventions

- **Style:** RESTful JSON over HTTPS, versioned under /api/v1, documented with OpenAPI/Swagger generated from NestJS decorators.
- **Authentication:** Bearer JWT; refresh endpoint with rotation; admin routes require 2FA-verified sessions and RBAC guards, served for the AdminUser model only.
- **Errors:** a structured envelope with code, message (localized), details and trace ID; stable error codes per module.
- **Pagination:** cursor-based for feeds and search; limit and cursor parameters; total counts only where cheap.
- **Idempotency:** Idempotency-Key header for uploads, messages, notifications and payment submissions to avoid duplicates on retry.
- **Caching:** ETag and Cache-Control for schema, config and public content; Redis cache-aside for hot reads.
- **Localization:** Accept-Language header selects the response language; both Arabic and English labels are available.

## 10.2 Endpoint Groups

| Group | Representative Endpoints | Module |
|---|---|---|
| Auth | POST /auth/register, /auth/login, /auth/otp/request, /auth/otp/verify, /auth/refresh, /auth/social/{provider}, /auth/sessions | M01 |
| Users | GET/PATCH /me, GET /users/{id}, POST /me/verification, POST /users/{id}/block, POST /me/capabilities | M02 |
| Catalog | GET /categories, GET /categories/{id}/schema, POST /admin/categories, POST /admin/attributes, POST /admin/other/{id}/promote | M03 |
| Listings | POST /listings, PATCH /listings/{id}, POST /listings/{id}/renew, POST /listings/{id}/sold, GET /listings/{id}, POST /listings/{id}/contact-reveal | M04, M06 |
| Search | GET /search, GET /search/suggest, POST /saved-searches, GET /compare, GET /price-insights | M05 |
| Chat | WebSocket /chat; GET /threads, POST /threads/{id}/offers | M07 |
| Automotive | POST /rental-requests, PATCH /rental-requests/{id}, GET /providers/{id}/slots, POST /appointments | M08 |
| Jobs | POST /jobs, POST /jobs/{id}/apply, GET/PUT /me/candidate-profile, POST /cv-requests, PATCH /applications/{id} | M10 |
| Moderation | POST /reports, GET /admin/reports, POST /admin/listings/{id}/hide, /suspend, /delete, POST /appeals | M15 |
| Notifications | GET /notifications, PATCH /me/notification-preferences, POST /admin/broadcasts | M16 |
| Payments | POST /payments/bankak, GET /admin/payments, POST /admin/payments/{id}/approve, /reject | M17 |
| Media | POST /media/upload-url, POST /media/video/chunks, GET /media/signed-url | M19 |
| Maps | GET /geo/places/autocomplete, GET /geo/reverse (gateway-proxied, capped) | M20 |
| Config & Flags | GET /config, GET /flags, PATCH /admin/flags/{key}, PATCH /admin/media-limits, PATCH /admin/defaults | M24, M26 |
| Admin | GET /admin/users, /admin/audit-logs, /admin/analytics, /admin/system-health | M24, M25 |

## 10.3 External Integrations & Cost Responsibility

| Integration | Purpose | Cost Responsibility |
|---|---|---|
| Google Sign-In, Facebook Login, Apple Sign-In | Social authentication | Free at launch (Apple Developer Program fee applies, below) |
| Email delivery service | Email OTP and transactional email | Client (as required) |
| SMS and WhatsApp OTP providers | Telephone OTP, disabled by default | Client (charges when enabled) |
| Firebase Cloud Messaging | Push notifications | Free tier |
| OpenStreetMap data / Leaflet; OSM-compatible tile provider | Map rendering | Library free; tile hosting per provider plan, Client **[V3-FIX]** (public OSM tile servers are not for production load) |
| Google Maps Platform (Places, Geocoding) | Address autocomplete and geocoding, gateway-proxied with caps and alerts | Client |
| Image/video content-classification provider | Nudity and violence detection (TRS-16) | Client, per provider plan **[V3-ADD]** |
| Cloudflare R2 / AWS S3 | Media and private document storage, CDN | Client (about $10/month video storage budget) |
| Sentry and uptime monitoring | Error tracking and uptime checks | Per plan chosen |
| Hosting (API, PostgreSQL, Socket.io, Redis, SSL, daily backups) | Application hosting | Code Club for the first 8 months under the agreed allocation; Client afterwards |
| Google Play Console | Android publishing | Code Club (one-time registration); app and signing keys transfer to Client at handover **[V3-FIX]** |
| Apple Developer Program | iOS publishing | Client |
| Domain name | Web address | Client unless agreed otherwise |

---
# 11. Launch Configuration Matrix

This matrix states the status of each capability at initial release. Flag OFF capabilities are fully built and testable, hidden from users, and switched on by the Admin without a release.

| Capability | Launch Status | Switch |
|---|---|---|
| Email OTP, Google, Facebook and Apple sign-in | Active | Email OTP cannot be disabled while it is the only enabled channel (AUTH-15) |
| SMS OTP and WhatsApp OTP | Built, disabled by default | Admin: per-channel toggle |
| Instant listing publication with post-moderation | Active | — |
| Delayed-visibility moderation mode (TRS-15) | Built, OFF in every category | Admin: per category and trust tier |
| Automated image content classification (TRS-16) | Active | Provider chosen at M2 |
| Automotive: cars, trucks, rickshaws, parts, towing, diagnostics | Active | — |
| Vehicle Rental (request flow) | Active | — |
| Automotive Service Appointments | Active | — |
| Real Estate (all 12 property types, 4 transaction types) | Active | — |
| Jobs: Quick Apply, Full Profile, Create-CV-for-me | Active | — |
| Hotels and furnished accommodation (listings and inquiries) | Active | — |
| Hotel reservation engine | Built, disabled | Admin toggle |
| Video uploads | Active | Admin: global and per category; duration and size limits |
| Dynamic categories, attributes and Other option | Active | Admin: EAV Schema Builder |
| Reviews, negotiation, wanted listings, favorites, saved searches, comparison | Active | — |
| Contact-reveal policy (DET-13) | Active (guests allowed with rate limit) | Admin: policy and caps |
| Bankak payment screens for users | Hidden at launch in Production; ON in Staging for UAT | Admin toggle |
| Bankak verification queue (admin) | Built | Role: Finance Auditor |
| Subscriptions, boosts, featured listings, credits, paid promotions | Built, hidden | ENABLE_MONETIZATION and per-engine toggles |
| Auctions, barter, wholesale, order and cart, delivery, other asset rentals | Built, hidden (to Appendix B bar) | Per-engine Admin toggles |
| Google AdMob | Built, disabled | Admin toggle |
| Local autosave of the in-progress listing form | Active | — |
| Offline listing composing, offline upload queue and background offline sync | Out of scope | — |

---

# 12. Delivery Plan, Testing & Definition of Done

## 12.1 Milestone Mapping

Delivery follows the five payment milestones of the Master Agreement over an estimated four months (about 16 weeks). The dates below are unchanged from V2 and the Agreement; Section 13.4 records the schedule risks and the mitigations proposed. **[V3-CLARIFY]**

| Milestone | Timing | PRD Deliverables | Verification |
|---|---|---|---|
| M1 Signing & Project Kickoff | On signing | Repositories created in client GitHub; core package scaffold; environments; architecture baseline; store-account plan (Play account type, transfer plan); Prisma schema validated against PostGIS/pg_trgm | Signed Agreement and repository initialization |
| M2 UI/UX Design Approval | Weeks 3–4 | Design system, wireframes and screens for all modules in Arabic RTL and English; admin dashboard design; decisions on OD-01 to OD-11 (Section 13.5); hosting cost model | Written Client sign-off |
| M3 Backend API & Database | About Week 8 | Auth, EAV engine, listings, search, chat, jobs, rentals, appointments, moderation, notifications, media, admin APIs, flags; contingent on Sayaratak Phase 3 testing per the Agreement | Backend verification and API testing |
| M4 Main Features Ready for Live UAT | Weeks 12–13 | Mobile and web apps integrated with APIs; Admin Dashboard; full feature set on a live test environment (Bankak user flow ON in Staging) | Interactive UAT build |
| M5 Final Store Deployment & Handover | About Week 16 | Production deployment, Play Store and App Store publishing, handover package including store accounts, signing keys, Firebase project and restore test evidence | Store launch and 100% repository handover after final payment |

## 12.2 Testing Strategy

- **Unit tests:** domain logic, validators, ranking and scoring functions.
- **Integration and API tests:** every module endpoint, authorization rules and error codes.
- **UI tests:** critical flows on iOS, Android and Web: sign-in, post, search, contact, apply, rental, appointment.
- **Security testing:** OWASP review, rate-limit and authorization tests, dependency scanning, key-restriction review.
- **Performance testing:** load tests on search (with promoted-attribute filters), feed and chat against the NFR targets, including the 3G profile.
- **Localization testing:** RTL layouts, language switch and reload, Arabic search normalization and translation completeness.
- **Resilience testing [V3-ADD]:** third-party failure drills (Maps cap reached, FCM down, classifier down), message and upload retry idempotency, and a database restore test.
- **UAT:** client-run testing on staging per milestone with defect tracking and sign-off.

## 12.3 Definition of Done

A feature is done only when all of the following are complete and demonstrable:

1. User interface for mobile and web in Arabic and English.
2. API implemented, documented in Swagger and covered by tests.
3. Database schema, migrations and indexes in place.
4. Admin control and audit logging where the feature is configurable or moderated.
5. Acceptance criteria met on the staging environment and accepted by the Client.

---

# 13. Out of Scope, Assumptions, Dependencies, Risks & Open Decisions

## 13.1 Out of Scope

- Offline listing composing, an offline upload queue and background offline synchronization. (Local autosave of the in-progress form, LST-19, is in scope and is not offline sync.) **[V3-CLARIFY]**
- Online payment processing at launch (Bankak is a manual verification flow and its user screens are hidden in Production).
- SMS and WhatsApp OTP charges (the channels are built; usage costs are the Client's responsibility).
- Work outside Annex A, which follows the Written Change Request procedure.
- User-facing monetization UI at launch (engines are built and hidden behind flags). **[V3-FIX]** (V2 worded this "Native feature-flag UI exposure of monetization", which was ambiguous.)

## 13.2 Assumptions

- The Client provides branding assets, store accounts (Apple Developer) and timely feedback within seven business days.
- Sayaratak Phase 3 testing completes in time for Milestone 3 as per the contractual dependency.
- Third-party accounts (Google Maps, email delivery, storage, tile provider, content-classification provider) are created and funded by the Client.
- Google Play and App Store distribution is available for the target audience; where it is not, signed APK distribution is the fallback. **[V3-ADD]**

## 13.3 Dependencies

- Apple App Store and Google Play review timelines, and Play testing prerequisites for new developer accounts.
- Third-party API availability (Google, Meta, Apple, Firebase).
- The shared core package release cadence between MARBOU and Sayaratak.

## 13.4 Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Low-bandwidth users abandon uploads | Lower listing completion | Client compression (photo and video), chunked video, Data Saver Mode, clear progress and retry within session, local form autosave |
| Spam and fraud with instant publication | Trust erosion | Automated scanning incl. image classification, duplicate detection, fraud scoring, rate limits, fast report handling, auto-hide thresholds, optional delayed-visibility mode for high-risk categories |
| Search quality in Arabic | Poor relevance | Arabic normalization, trigram fuzzy match, synonyms managed by Admin, analytics on zero-result queries |
| Slow filters on JSONB attributes | Missed latency target | Promoted columns and expression indexes (SRCH-19), load tests at 100,000 listings |
| Cost overruns on Maps or SMS | Unplanned spend | OpenStreetMap data for display, gateway-proxied Google calls with hard caps, quota caps in Google Cloud, billing alerts, SMS and WhatsApp disabled by default |
| Store review delays | Launch slip | Early store account setup, compliance checklist including Apple Sign-In, UGC policy items (TRS-18) and privacy declarations |
| Scope expansion | Schedule and budget pressure | Change Request procedure and the Annex A baseline |
| Single-server hosting limits | Performance under spikes | Stateless design, caching, queues and a documented scale-out path |
| **Schedule compression [V3-ADD]**: 26 modules, three client apps, an admin dashboard and ten dormant engines in about 16 weeks, with M3 dependent on Sayaratak Phase 3 | Late or shallow delivery | Critical path agreed at M1 (auth, EAV, listings, search first); core-package reuse from Sayaratak; dormant engines limited to the Appendix B bar; weekly burn-down shared with the Client; any slip escalated at M2 rather than at M4 |
| **Email-only onboarding [V3-ADD]** | Lower registration in a phone-centric market | AUTH-23 funnel metrics at UAT and soft launch; OD-01 decision gate to enable WhatsApp/SMS OTP by flag |
| **Review farming [V3-ADD]** | Trust erosion | TRS-08 qualifying-interaction rules, one review per interaction, report and moderation of reviews |
| **Contact-number scraping [V3-ADD]** | Spam and scams against sellers | DET-13 server-mediated reveal, caps and fraud signals |
| **Store-account ownership gap [V3-ADD]** | Client cannot publish updates after handover | SYS-16 transfer checklist, Play App Signing, signed at M5 |

## 13.5 Open Decisions Requiring Client Confirmation

| ID | Decision | V3 default if not decided at M2 |
|---|---|---|
| OD-01 | Enable WhatsApp and/or SMS OTP at launch given a phone-centric market | Email-only at launch with AUTH-23 metrics; flip by flag if registration drop-off exceeds the threshold in Appendix C |
| OD-02 | Delayed-visibility mode (TRS-15) for Jobs, Rentals or new accounts | OFF everywhere |
| OD-03 | Mobile map renderer and production tile provider | react-native-maps with a paid or self-hosted OSM-compatible tile source |
| OD-04 | Content-classification provider and hash-list source (TRS-16, TRS-17) | Chosen at M2 from two quotes; cost to Client |
| OD-05 | Re-baseline of schedule, or deferral of specific dormant engines to a later phase | Keep dates; build to Appendix B bar only |
| OD-06 | Hosting cost model for the first 8 months and the handover to Client billing | Cost model shared by Code Club at M2 |
| OD-07 | Contact-reveal policy for guests | Guests allowed with rate limit |
| OD-08 | Google Play account type and ownership path | Organization account if available; transfer at M5 |
| OD-09 | Governing law, retention schedule and legal review of the Privacy Policy | Appendix D defaults pending legal review |
| OD-10 | Whether Redux Toolkit is needed at all on mobile | Not used |
| OD-11 | Whether Quick Apply may accept phone-only candidates (no email) when phone OTP is enabled | Email required per JOB-02 until OD-01 is decided |

---

# 14. Traceability Matrix (Annex A Sections 1–114)

Each Annex A index section is implemented by one or more modules or document sections. Use this table to confirm that every contractual section has a home in this PRD. **[V3-FIX]** Section 112 (delivery) is now mapped to M18 and M21 consistently with the module scope references (V2 mapped it to M21 and M20 only).

| Annex A Sections | Topic | Module(s) |
|---|---|---|
| 1–3 | Vision, core principle, competitor study | Sections 1–2; M21 |
| 4, 6, 110 | Brand, languages and translation architecture | M21 |
| 5 | Platforms | Section 3 |
| 7, 8, 49, 50 | Roles, registration, trust, security center | M01, M02, M15 |
| 9, 11, 42, 54, 56 | Vehicles, parts, services, rental, appointments | M08 |
| 10 | Tractors, equipment, solar | M12 |
| 12 | Real estate | M09 |
| 13 | Hotels and accommodation | M11 |
| 14–20 | Electronics, fashion, children, home, livestock, food | M13 |
| 21, 38–40 | Companies, seller and business profiles, dashboard | M02, M06, M14 |
| 22 | General marketplace | M04, M13, M15 |
| 23–25 | Core engine, dynamic categories, Other | M03 |
| 26–27, 33–37 | Home, navigation, search, ranking, comparison, insights, nearby | M05, M20 |
| 28–31, 46, 72 | Lifecycle, quality, duplicates, fraud, wanted, expiry | M04, M15 |
| 32, 88, 90 | Listing details, deep links, SEO | M06, M23 |
| 41 | Jobs | M10 |
| 43–45 | Messaging, anti-spam, negotiation | M07 |
| 47, 73–75 | Favorites, dashboard, export, deletion | M05, M22 |
| 48, 51 | Reviews, reports and appeals | M15 |
| 52–63, 66, 112 | Auctions, barter, rental, wholesale, bookings, cart, delivery, subscriptions, promotions, AdMob | M18, M21 (LOC-10) |
| 64, 65, 111 | Bankak flow, payment schema, abstraction | M17 |
| 67 | Notifications | M16 |
| 68, 92 | Help center, CMS and legal | M23 |
| 69, 71 | Data saver, media pipeline | M19 |
| 70 | Weak network and offline queue (removed from scope; local form autosave retained) | Section 13.1; LST-19 |
| 76–79, 86, 87, 89 | Admin, RBAC, 2FA, feature flags, audit logs, versions, maintenance | M24, M26 |
| 80–85 | API standards, search, integration, CI/CD, security, monitoring | M26, Section 10 |
| 91 | Accessibility | NFR-UX-03 |
| 93 | Analytics | M25 |
| 94–95 | Testing and Definition of Done | M26, Section 12 |
| 96, 98 | GitHub ownership and handover | Sections 3.5, 12; SYS-16 |
| 97 | Backup and disaster recovery | M26, NFR-REL-02 |
| 99–103 | Support, change requests, pricing, completeness, exclusions | Sections 12–13 |
| 104 | Launch configuration | Section 11 |
| 105–109, 113 | Sudan focus, regional expansion, country model, currency, phone codes, country settings | M20, M21 |
| 114 | Golden rule | Section 2.1 |

*Document statistics: 26 modules, 355 functional requirements and 57 non-functional requirements. V2 stated 336 functional and 54 non-functional requirements; V3 adds 22 (19 functional and 3 non-functional) requirements (tagged [V3-ADD]).*

---

# Appendix A — Corrections Register (V2 → V3)

Type: **FIX** = error or contradiction corrected; **CLARIFY** = made testable, intent unchanged; **ADD** = new requirement. Items marked ◆ may exceed Annex A and should be reviewed under the Written Change Request procedure before acceptance.

| # | V2 location | Issue in V2 | V3 correction | Type |
|---|---|---|---|---|
| 1 | §5, PROF-01, Prisma `User.role` | Single exclusive role enum contradicted multi-capability accounts | Capability grants (UserCapability); admin roles moved out of the user model | FIX |
| 2 | §5, ADM-17, AUTH-20 | Enum lacked Support and Finance roles; admins both "separate accounts" and in user enum | Separate AdminUser model with four AdminRole values | FIX |
| 3 | §5 matrix | Finance Auditor granted "Manage admin roles" | Row split: roles = Super Admin only; audit logs = read-only for Finance and Super Admin | FIX |
| 4 | LST-04 vs `ListingStatus` | Draft, Submitted and soft delete missing; one HIDDEN state for two meanings | DRAFT added; Submitted defined as transient; `deletedAt`; AUTO_HIDDEN added | FIX |
| 5 | JOB-11 vs schema comment | CV statuses differed (COMPLETED/REVISION vs Delivered/Revision Requested/Approved) | Single enum CvBuildStatus matching JOB-11; CvBuildRequest entity | FIX |
| 6 | HOT-06 vs HOT-08 | Verified "stayed" reviews impossible with reservation engine OFF | Host-confirmed stay mechanism | FIX |
| 7 | AUTH-15, ADM-09 | Admin could disable the only active OTP channel | Last-channel rule | FIX |
| 8 | M21 acceptance, LOC-01 | "Without restarting the app" unrealistic for RN direction change | One automatic JS reload permitted | CLARIFY |
| 9 | M07, schema `ChatMessage` | No thread, offer, receipts or attachment model; `listingId` not a relation | ChatThread, ChatMessage with sent/delivered/read, Offer, idempotency key | FIX |
| 10 | Prisma `Listing` | No currency, type, public ID, expiry, quality, views, country/city, soft delete, geography, budget range; required price | Fields added; price optional; PostGIS column via migration | FIX |
| 11 | Prisma `Category`, `CategoryAttribute` | Missing order, active/archive, searchable, promote flags; no unique (category, key) | Added; unique constraint added | FIX |
| 12 | Prisma `User` | Unique unverified phone (squatting); single `isVerified`; no status or language | Non-unique phone, unique verified phone; status, language, badges table | FIX |
| 13 | §3.2 | "Prisma ORM / TypeORM" undecided | Prisma selected; raw-SQL migration policy stated | FIX |
| 14 | §3.2 | Zustand, TanStack Query and Redux Toolkit overlapped | Boundaries fixed; Redux not used (OD-10) | CLARIFY |
| 15 | §4, SRCH-03 | JSONB/GIN alone cannot meet range-filter latency | `promote_to_index`, SRCH-19, Section 4.1(7) | ADD |
| 16 | §4 | "Zero-app-update" overstated; required-flag change undefined | New data types need a release; required applies to new/edited listings (CAT-16) | CLARIFY |
| 17 | MED-04/05/07 | 15 MB cap infeasible for raw phone video; no transcoding | On-device video compression; ffmpeg worker (MED-13) | FIX/ADD |
| 18 | GEO-01 | Leaflet is web-only; public OSM tiles unsuitable for production | Mobile renderer decision; production tile provider | FIX |
| 19 | GEO-03/04 | Client-side Places calls cannot be capped at gateway; alerts do not stop spend | Gateway proxy, Cloud quota caps, key restriction | FIX |
| 20 | §10.3 | Map "Free" | Tile hosting cost to Client | FIX |
| 21 | TRS-12 vs SYS-10 vs DASH-05/06 | Hash-chained audit log conflicted with erasure | Pseudonymous IDs only; no personal data in payloads | FIX |
| 22 | AUTH-08, social login | Apple relay and phone-only Facebook accounts return no usable email | AUTH-22 | ADD |
| 23 | Onboarding | Email-only verification in phone-centric market unmeasured | AUTH-23 metrics; OD-01 | ADD |
| 24 | M04, NFR-UX-05 | Session-only form retention loses drafts on app kill | LST-19 local autosave (not offline sync); §13.1 clarified | CLARIFY ◆ |
| 25 | NFR-PERF | Only 4G targets for a weak-network product | NFR-PERF-08 3G profile | ADD |
| 26 | SRCH-13 | Mixed SDG/USD comparison, no staleness policy | Normalization rule, staleness limit, LOC-04 | CLARIFY |
| 27 | DET-03/04, AUTH-18 | Contact numbers exposable to guests and scrapers | DET-13 server-mediated reveal with caps | ADD ◆ |
| 28 | TRS-01/03 | Instant publication in high-risk verticals with thin scanning | TRS-15 delayed-visibility mode (OFF by default), JOB-21 scam patterns | ADD ◆ |
| 29 | TRS-01, PROF-12 | No media classification; unnamed "hash list" | TRS-16, TRS-17 | ADD ◆ |
| 30 | App-store policies | Missing UGC filtering confirmation and web deletion path | TRS-18, CMS-09 | ADD |
| 31 | TRS-08, AUTO-16 | "Verified" undefined; providers self-mark Completed | Qualifying-interaction definition; user confirmation | FIX |
| 32 | MSG, ANL-06 | "Data retention policy" referenced but absent | Appendix D, NFR-PRV-06, SYS-15 | ADD |
| 33 | NFR-PRV-01 | Governing law not stated | Stated in policy; OD-09 | CLARIFY |
| 34 | M18 | Dormant engines one sentence each yet "fully implemented" | Appendix B acceptance bar | CLARIFY |
| 35 | PAY-02..08 vs PAY-04/05/07 | Active queue untestable with user flow OFF | Staging ON (PAY-13, §6.7) | FIX |
| 36 | §3.5, §10.3, NFR-MNT-03 | Play account Code Club-owned; handover covered repositories only | Transfer of Play app, signing keys, Firebase; SYS-16 | FIX |
| 37 | §3.5 | Hosting allocation open-ended | Cost model at M2 (OD-06) | CLARIFY |
| 38 | §13.4 | Single-server risk only; schedule risk absent | Schedule, onboarding, review, scraping and ownership risks added | ADD |
| 39 | Various | Unmeasurable terms ("quickly", "few steps", "enough data", thresholds unspecified) | Appendix C defaults; NFR-UX-02 numbers | CLARIFY |
| 40 | PROF-07 | "Blocker listings stay visible only per policy" undefined | Listings stay publicly visible; blocked user cannot chat or offer | CLARIFY |
| 41 | SRCH-11 | Five-tab navigation stated for the whole product | Mobile apps only; web equivalent | CLARIFY |
| 42 | §13.1 | "Native feature-flag UI exposure of monetization" ambiguous | Reworded | FIX |
| 43 | §14 matrix | Annex A 112 mapped inconsistently; several rows omitted modules cited in module scope references (21, 38, 22, 26–37, 47) | Mapping aligned | FIX |
| 44 | §7 intro | "Modules M01–M26 cover all 114 sections" while some map to document sections | Wording corrected | FIX |
| 45 | Footer statistics | Counts reflected V2 only | Recomputed for V3 | FIX |
| 46 | NFR-SEC | Unrestricted client-side keys not prohibited | NFR-SEC-11 | ADD |
| 47 | Cover | Reference and date | MARBOU-PRD-2026-V3 (DRAFT), October 12, 2026 | FIX |

---

# Appendix B — Minimum Acceptance Bar for Flag-OFF Engines

Each engine is *done* when it meets the bar below on Staging with its flag ON, and is hidden with its flag OFF. Anything beyond this bar is a Change Request. Every engine includes tables, endpoints, an admin controller, audit logging and automated tests for the listed behaviors.

| Engine | Minimum acceptance bar |
|---|---|
| MON-02 Subscriptions | Admin creates monthly and yearly Plans with listing quota and price; a user subscription is created via an approved Payment; quota enforced on posting; expiry and renewal job; cancel at period end. |
| MON-03 Promotions | Admin or user purchase creates a Promotion (featured, top-boost, badge, banner slot) with start and end; ranking and badge applied only while active; impressions and clicks counted. |
| MON-04 Credits | Credit balance per user; purchase and spend ledger entries; spend rule per promotion type; no negative balance; admin adjustment with reason. |
| MON-05 Paid boosts and badging | Time-boxed boost or badge purchased with credits or payment; automatic expiry; admin pricing configuration per country. |
| MON-06 Auctions | Auction listing with start, end, reserve and increment; bids validated and atomic; end-of-auction job selects winner and notifies; no payment capture. |
| MON-07 Barter | Exchange proposal between two listings; accept, reject, counter; both listings marked reserved on acceptance; chat thread opened. |
| MON-08 Asset rental | Rental request flow for non-vehicle listings with availability blocks and terms snapshot (same pattern as AUTO-12/13); no payment capture. |
| MON-09 Order and cart | Cart per user per seller, checkout creates an Order with states Created, Confirmed, Fulfilled, Cancelled; no online payment; seller confirms. |
| MON-10 Delivery | Delivery fee matrix by zone, order tracking states Requested, In Transit, Delivered; courier adapter interface with one mock implementation. |
| MON-11 AdMob | Ad-frame placeholders in layouts with AdMob unit IDs from remote config; hidden when flag OFF; no ads shown in Production until enabled. |
| GEN-11 Wholesale | MOQ and tiered price fields per listing; price shown by quantity tier; order quantity validated against MOQ. |
| HOT-08 Reservations | Availability locks and reservation states Requested, Confirmed, Cancelled, Completed with date-overlap prevention; no payment capture. |

---

# Appendix C — Configurable Defaults Register

These are engineering defaults, editable in the Admin console (ADM-23) and subject to Client confirmation at Milestone 2. Values are starting points for launch tuning, not guarantees.

| Setting | Default |
|---|---|
| Listing expiry | 30 days per category; reminders at 7 days and 1 day; renewal window 30 days after expiry |
| Active listing cap | 50 per individual; 500 per business (per role and per category overridable) |
| Listing creation rate | 5 per hour and 20 per day per user |
| Photos per listing | 10 |
| Video limits | 30 seconds and 15 MB; enabled globally |
| Quality score weights | Title and description 25, photos 25, required attributes 20, optional attributes 10, location 10, video 5, price 5 |
| Duplicate detection | Same verified/contact phone plus identical image hash, or trigram text similarity at least 0.85 |
| Unique viewer (view counter) | Distinct signed-in user ID or anonymized device ID per listing per 24 hours; owner excluded |
| Auto-hide trigger | 5 reports from distinct users within 24 hours, or fraud score at least 85 |
| Fraud score | Scale 0–100; moderator alert at 70; automatic rate-limit at 80 |
| Price insight minimum | At least 8 comparable listings (active or sold within 90 days) in the same leaf category |
| Price insight labels | Below market: more than 15% under the comparable median; Above market: more than 15% over; otherwise Fair |
| Exchange-rate staleness | Alert after 72 hours; converted indicators and cross-currency insights suppressed after 7 days |
| Contact reveals (guests) | 20 per day per device and IP; unlimited for signed-in users subject to fraud signals |
| Login lockout | 5 failed attempts, then delays of 1, 5, 15 and 60 minutes |
| Message throttling | 20 messages per minute per user; 10 per minute to one recipient; same text to 3 or more recipients in 10 minutes is flagged |
| Chat messages for review eligibility | At least 2 messages from each party |
| Appointment completion confirmation window | User may confirm or dispute within 72 hours, after which Completed stands and the review opens |
| Quick Apply / job applications | 20 applications per day per candidate; one application per job |
| Deletion grace period | 30 days |
| Data export | Target under 24 hours; maximum 7 days |
| Registration drop-off trigger for OD-01 | If more than 30% of started registrations fail at the email OTP step over a 2-week soft-launch window, escalate to enabling WhatsApp/SMS OTP |

---

# Appendix D — Data Retention Schedule

Defaults pending Client approval and legal review (NFR-PRV-06, OD-09). The retention job (SYS-15) enforces them and logs each run.

| Data | Retention |
|---|---|
| Chat messages and attachments | 24 months after the last message in the thread; reported conversations held until the report is closed plus 12 months |
| Raw analytics events | 13 months, then aggregated only |
| Login events and session records | 12 months |
| OTP codes | Deleted within 24 hours of use or expiry |
| Candidate profiles and CV documents | Until the user deletes them or the account is erased; employer-shared snapshots follow the employer's job retention |
| Job applications | 12 months after job closure |
| Verification documents | Deleted 90 days after the decision (approved or rejected), unless needed for an open dispute |
| Payment ledger, receipts and invoices | 7 years (financial record keeping), with personal fields minimized |
| Audit log | 7 years; pseudonymous IDs only, so erasure requests do not alter it |
| Listings (expired, sold, deleted) | Soft-deleted 90 days, then purged; media purged by the orphan job |
| Deleted accounts | Personal data removed or anonymized after the 30-day grace period; retained records keep anonymized authorship |

*End of document.*
