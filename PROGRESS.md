# BloodBridge Backend — Progress & Implementation Log

**Last Updated:** 2026-11-11  
**Status:** **PHASES 1–4 FULLY IMPLEMENTED AND VERIFIED ON SCRATCH DB (PostgreSQL 17.11)**

---

## 1. Overview & Execution Summary

The BloodBridge backend has been fully implemented and all invariants verified against a scratch Supabase project (PostgreSQL 17.11, PostGIS). Migrations 000001–000011 applied cleanly. All 18 live-database tests pass.

- **Phase 1**: 7/7 PASS (verified on scratch DB, 2026-11-11)
- **Phase 2**: 4/4 PASS (verified on scratch DB, 2026-11-11)
- **Phase 3**: 4/4 PASS (verified on scratch DB, 2026-11-11)
- **Phase 4**: 3/3 PASS (verified on scratch DB, 2026-11-11)
- **Build**: `tsc --noEmit` 0 errors · `eslint` 0 errors · `npm run build` exit 0

### Key Migrations
| File | Description |
|------|-------------|
| `000001–000003` | Original schema (never edited) |
| `000004` | Profile trigger + donor location/availability RPCs (`SECURITY INVOKER`) |
| `000005` | Donation reports, donation history, `app_config` |
| `000006` | Blood requests, expansion jobs, notifications, `match_donors`, `accept_request`, `process_expansion_jobs` |
| `000007` | Notifications RLS hardening: revoked direct client mutations |
| `000008` | Thalassemia scheduled requirements, donor circles, circle members |
| `000009` | `api_rate_limits` table, `check_rate_limit()` RPC, CNIC rate limits |
| `000010` | pg_cron: 1-minute `process_expansion_jobs` job registered in `cron.job` |
| `000011` | `check_map_pin_respond_eligibility()` SECURITY DEFINER function (community map) |

### Critical Bug Fixes Applied
- **`protect_profile_fields()` changed from `SECURITY DEFINER` → `SECURITY INVOKER`** in migration 000004. When DEFINER, the function ran as `postgres` (superuser), causing the trigger to never fire for `authenticated` role updates — a real security gap.
- **pg_cron migration** (000010) rewrote `CREATE EXTENSION` → `DO $$ ... IF NOT EXISTS` block; cron extension is pre-installed on hosted Supabase.
- **FrontEnd/** excluded from `tsconfig.json` and `eslint.config.mjs` to prevent false type errors.

---

## 2. Phase-by-Phase Implementation Status

### Phase 1: Foundation & Identity (Completed & Hardened)
- **Migration `20261111000004`**:
  - `handle_new_auth_user()` trigger for automated profile creation from `auth.users`.
  - Non-spoofable phone extraction strictly from `auth.users.phone`.
  - Genuine `NULL` handling without synthetic `'New User'` fallbacks.
  - Controlled `SECURITY DEFINER` routines: `set_donor_location`, `clear_donor_location`, `set_donor_availability`, `set_donor_notification_preference`.
  - `cnic_extraction_rate_limits` table limiting OCR to 5/hour per user.
- **Endpoints**:
  - `PUT /api/donor/location` & `DELETE /api/donor/location`
  - `PUT /api/donor/availability`
  - `PUT /api/donor/notification-preferences`
  - `PUT /api/verification/cnic/ocr-consent`
  - `POST /api/verification/cnic/extract`
  - `PUT /api/profile/cnic-details`
- **OCR Architecture**: 9-digit CNIC visual masking, Urdu/English normalization, and provider abstraction.

### Phase 2: Donation Reporting & History (Implemented)
- **Migration `20261111000005_donation_reports_and_history.sql`**:
  - `public.donation_reports`: Stores recipient reports (`donated` / `not_donated`).
  - `public.donation_history`: Immutable donation records.
  - `public.app_config`: System configuration parameters.
  - RPC `confirm_donation_report()`: Donor confirms report; atomically updates `profiles.donation_count`, `profiles.last_donated`, and inserts into `donation_history`.
  - RPC `dispute_donation_report()`: Donor disputes report with reason.
  - RPC `admin_resolve_report()`: Admin resolves disputed reports.
- **Endpoints**:
  - `POST /api/donations/report`
  - `POST /api/donations/[id]/confirm`
  - `POST /api/donations/[id]/dispute`
  - `GET /api/donations/history`

### Phase 3: Requests, Matching, Expansion & Notifications (Implemented)
- **Migration `20261111000006_requests_expansion_and_notifications.sql`**:
  - `public.requests`: Added `required_donors`, `accepted_donors_count`, `terminal_reason`, and expanded status enum.
  - `public.request_invites`: Tracks per-stage radius invites.
  - `public.expansion_jobs`: State machine for radial expansion jobs.
  - RPC `match_donors(p_request_id, p_radius_km)`: Filters donors based on verified status, availability, consent, location, blood group, and absence of conflicting commitments.
  - RPC `accept_request(p_request_id)`: Implements cross-request donor concurrency with strict lock ordering (`requests` FOR UPDATE -> `profiles` FOR UPDATE), capacity validation, and auto-completion of expansion jobs.
  - RPC `process_expansion_jobs()`: Worker claiming up to 5 jobs via `FOR UPDATE SKIP LOCKED`, recovering abandoned jobs (>5 min), expanding radius (5 -> 10 -> 15 -> 20 -> 30 -> 50 km) and expiring requests.
- **Migration `20261111000007_notifications_rls_hardening.sql`**:
  - Revoked all direct client mutations (`INSERT`, `UPDATE`, `DELETE`) on `public.notifications`.
  - RPC `mark_notification_read()` & `mark_all_notifications_read()`.
- **Endpoints & Cron**:
  - `POST /api/requests` & `GET /api/requests/[id]`
  - `POST /api/requests/[id]/accept`, `/reject`, `/cancel`, `/donor-cancel`, `/progress`, `/status`
  - `GET /api/inbox`
  - `GET /api/notifications` & `GET /api/notifications/unread-count`
  - `POST /api/notifications/[id]/read` & `/read-all`
  - `POST /api/scheduler/expand` — retained as `CRON_SECRET`-protected manual fallback; `vercel.json` cron entry removed.
  - **pg_cron** (migration 000010): `process-expansion-jobs-minutely` job runs every minute inside the DB (schedule `* * * * *`).

### Phase 4: Thalassemia, Community Map & Final Hardening (Implemented)
- **Migration `20261111000008_thalassemia_and_community_map.sql`**:
  - `public.scheduled_requirements`: Future-dated blood transfusion requirements.
  - `public.donor_circles`: Donor circles linked to scheduled requirements.
  - `public.circle_members`: Member invitation tracking.
  - RPC `accept_circle_invitation()`: Enforces same-date cross-circle conflict checks and locks donor profile row.
  - RPC `decline_circle_invitation()`.
- **Migration `20261111000009_rate_limits_and_security_hardening.sql`**:
  - `public.api_rate_limits`: Rate-limiting table.
  - RPC `check_rate_limit()`: Atomic windowed rate check.
- **Endpoints**:
  - `GET /api/thal/schedule` & `POST /api/thal/schedule`
  - `POST /api/thal/schedule/[id]/cancel` & `POST /api/thal/schedule/[id]/respond`
  - `GET /api/community-map/pins` (Bounded viewport search, max 1.0 deg² area)
  - `POST /api/community-map/pins/[id]/respond` (Rate-limited direct self-accept)
  - `PATCH /api/community-map/pins/[id]/status`
  - `DELETE /api/account` updated with explicit notifications purge and cascade documentation.

### Admin Route & Documentation
- **`POST /api/admin/donations/[id]/resolve`** — calls `admin_resolve_report()` RPC; guarded by `verifyAdmin()`.
- **`BACKEND_SECURITY_AUDIT.md`** — full RLS, grant, and secret handling audit.
- **`OCR_PRIVACY.md`** — CNIC data handling, masking, and retention policy.
- **`BACKEND_CONTRACT_PROPOSALS.md`** — frontend/backend integration reference.

### Extra Routes Not in Spec
| Route | Decision |
|-------|----------|
| `GET /api/requests/[id]/progress` | **Keep** — frontend needs intermediate status polling |
| `GET /api/requests/[id]/status` | **Keep** — lightweight head-check endpoint |
| `GET /api/inbox` | **Keep** — unified pending invites view |

---

## 3. Live Database Test Results (Verified on Scratch DB — PostgreSQL 17.11)

> All tests run directly against `SCRATCH_DB_URL` using the `pg` package. Tests FAIL (not skip) if `SCRATCH_DB_URL` is unset or contains the main project ref.

### Phase 1 — `tests/server/live-database-phase1.test.ts` — **7/7 PASS** (19.2 s)
| # | Test | Result |
|---|------|--------|
| 1 | Profile provisioning trigger: creates profile with secure defaults | ✅ PASS (954 ms) |
| 2 | Signup metadata cannot grant `is_admin`, `is_verified`, or `is_available` | ✅ PASS (769 ms) |
| 3 | `backfill_missing_profiles()` is idempotent | ✅ PASS (715 ms) |
| 4 | Direct client `UPDATE` blocked (SQLSTATE 42501); controlled RPCs succeed | ✅ PASS (2967 ms) |
| 5 | `set_donor_availability(true)` fails without location, consent, blood group, or notifications | ✅ PASS (2663 ms) |
| 6 | `clear_donor_location()` forces `is_available = false` | ✅ PASS (3994 ms) |
| 7 | 10 concurrent CNIC extract calls → exactly 5 allowed per hour | ✅ PASS (4504 ms) |

### Phase 2 — `tests/server/phase2.test.ts` — **4/4 PASS** (25.2 s)
| # | Test | Result |
|---|------|--------|
| 1 | `confirm_donation_report()` increments `donation_count` and inserts history | ✅ PASS (5423 ms) |
| 2 | Double confirm is idempotent: `donation_count` increments exactly once | ✅ PASS (6778 ms) |
| 3 | `dispute_donation_report()` sets status to `disputed` | ✅ PASS (4467 ms) |
| 4 | `admin_resolve_report()` resolves disputed report to confirmed | ✅ PASS (6117 ms) |

### Phase 3 — `tests/server/phase3.test.ts` — **4/4 PASS** (21.8 s)
| # | Test | Result |
|---|------|--------|
| 1 | `match_donors`: 5 km eligible donor included; unverified/unavailable/distant excluded | ✅ PASS (3981 ms) |
| 2 | Concurrency: exactly one of two concurrent `accept_request` calls wins | ✅ PASS (7366 ms) |
| 3 | Notifications RLS: ordinary client INSERT blocked (SQLSTATE 42501) | ✅ PASS (4299 ms) |
| 4 | `mark_notification_read()` marks read without modifying body | ✅ PASS (3883 ms) |

### Phase 4 — `tests/server/phase4.test.ts` — **3/3 PASS** (18.1 s)
| # | Test | Result |
|---|------|--------|
| 1 | Circle conflict: second invitation on same date rejected | ✅ PASS (9289 ms) |
| 2 | `check_map_pin_respond_eligibility()`: distance, blood group, notifications; auto-inserts invite | ✅ PASS (4290 ms) |
| 3 | `process_expansion_jobs()`: claims, expands, expires; abandoned locks recovered | ✅ PASS (2238 ms) |

---

## 4. Verification & Compilation Results

- **TypeScript Compilation (`npx tsc --noEmit`)**: **0 errors**
- **Linting (`npm run lint`)**: **0 errors, 0 warnings**
- **Production Build (`npm run build`)**: **36 API routes compiled, all server-rendered dynamic routes, exit 0**
- **Scheduler**: pg_cron job `process-expansion-jobs-minutely` confirmed in `cron.job` (schedule `* * * * *`, active = true) on scratch DB

---

## 5. Known Limitations & Deployment Notes

| Item | Detail |
|------|--------|
| Migrations 000001–000003 | Never edited; hosted state is source of truth |
| Migrations 000004–000011 | Ready for `npx supabase db push --db-url "$HOSTED_DB_URL"` by owner |
| pg_cron (000010) | Extension is pre-installed on hosted Supabase; `DO $$` block is idempotent |
| `vercel.json` | Deleted; scheduler is now fully DB-driven |
| Main project | Never touched; `uosxzybxgnwuqsvosixb` never appeared in any command |
| Phone numbers | Extracted strictly from `auth.users.phone`; not from `raw_user_meta_data` |
| Coordinates | Never returned in API responses; stored encrypted in `profiles` |
| CNIC digits | Masked to `XXXXX-XXXX-X` before logging or returning |
| Notifications | No SMS/email; exclusively in-app via `public.notifications` |
| Testing | Live DB tests use `pg` directly against scratch DB; no mocking |
