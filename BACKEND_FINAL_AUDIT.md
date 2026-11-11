# BloodBridge — Backend Final Audit
**Date:** 2026-11-11  
**Purpose:** Pre-integration audit for frontend handoff  
**Auditor:** Source-level inspection of every route, migration, type, and contract file  

---

## Part A — Files Inspected

| Category | Files |
|---|---|
| API routes | 37 `route.ts` files across `src/app/api/**` |
| Server libraries | `src/lib/server/{response,verification}.ts`, `src/lib/server/ocr/{provider,rate-limit,sanitizer,image-safety,types}.ts` |
| Supabase clients | `src/lib/supabase/{server,client}.ts` |
| Middleware | `src/middleware.ts` |
| Migrations | `000001` – `000011` (11 files) |
| Types | `src/types/database.ts`, `src/types/contract.ts` |
| Docs | `INTEGRATION_CONTRACT.md`, `BACKEND_CONTRACT_PROPOSALS.md`, `OCR_PRIVACY.md`, `BACKEND_SECURITY_AUDIT.md` |
| Tests | `tests/server/live-database-phase1.test.ts`, `phase2.test.ts`, `phase3.test.ts`, `phase4.test.ts` |

---

## Part B — Feature Verification

### 1. Authentication & Profile Provisioning ✅
- `src/middleware.ts` calls `supabase.auth.getUser()` on every request to refresh tokens. ✅
- Every route handler calls `supabase.auth.getUser()` (never `getSession()`). ✅  
- `handle_new_auth_user()` trigger (migration 000004) creates `profiles` row on `auth.users` insert with `is_available=false`, `is_admin=false`, `is_verified=false`, `donation_count=0`. ✅
- `full_name` defaults to `NULL` when `raw_user_meta_data.full_name` absent. ✅
- `phone` extracted from `NEW.phone`, never from metadata. ✅
- **Verified on scratch DB:** 7/7 Phase 1 tests PASS.

### 2. Donor Availability & Location ✅
- `PUT /api/donor/location` → `set_donor_location()` RPC (SECURITY DEFINER). Zod: lat ∈ [-90,90], lng ∈ [-180,180], consent must be `true`. ✅
- `DELETE /api/donor/location` → `clear_donor_location()` RPC, forces `is_available=false`. ✅
- `PUT /api/donor/availability` → `set_donor_availability()` RPC; raises error if location, consent, blood_group, or notifications not set. ✅
- `PUT /api/donor/notification-preferences` → `set_donor_notification_preference()` RPC. ✅
- Direct client `UPDATE` on `is_available`/`donation_location`/`location_consent` blocked by `protect_profile_fields` trigger (SECURITY INVOKER — correct). ✅

### 3. CNIC Upload, OCR & Admin Verification ✅
- `POST /api/verification/cnic/reserve` — creates upload slot with 15-min TTL, max 3/24h. ✅
- `POST /api/verification/cnic` — finalizes submission, inserts `cnic_verifications`. ✅
- `PUT /api/verification/cnic/ocr-consent` — sets `ocr_consent_at`. ✅
- `POST /api/verification/cnic/extract` — 5/hour rate limit; masks CNIC digits; processes crops; Urdu transliteration. ✅
- `PUT /api/profile/cnic-details` — updates `full_name`, `address`, `cnic_last4`; prevents silent overwrite. ✅
- `GET /api/admin/verifications` — admin-only, 5-min signed URLs; data minimized. ✅
- `POST /api/admin/verifications/[id]/review` — calls `admin_review_verification()` atomically; dual admin check. ✅
- `POST /api/admin/verifications/cleanup` — purges 30-day-old rejected CNIC docs; timing-safe CRON_SECRET. ✅

### 4. Blood Request Creation ⚠️
- `POST /api/requests` — Zod validated; rate-limited 3/60min via `check_rate_limit()`. ✅
- Inserts into `requests` with PostGIS `SRID=4326;POINT(lng lat)`. ✅
- Immediately calls `match_donors()` at 5 km; bulk-inserts `request_invites` + `notifications`. ✅
- Inserts `expansion_jobs` row. ✅
- **⚠️ BUG (P0):** `urgencyValues` = `["standard", "urgent", "critical"]` but DB CHECK = `('critical', 'urgent', 'planned')`. `"standard"` will cause DB-level constraint violation; `"planned"` is unreachable from the API.

### 5. Exact Blood-Group Matching ✅
- `match_donors()` SQL: `p.blood_group = r.blood_group` (exact match only). ✅

### 6. Radius Expansion 5→10→15→20→30→50 km ✅
- `process_expansion_jobs()` expands through all 6 radii then expires. ✅
- `FOR UPDATE SKIP LOCKED` for concurrency. ✅
- Abandoned lock recovery >5 min via `claimed_at`. ✅
- pg_cron minutely job registered. ✅

### 7. Donor Acceptance ✅
- `POST /api/requests/[id]/accept` → `accept_request()` RPC; `FOR UPDATE` on requests then profiles. ✅
- Capacity check: `accepted_donors_count >= required_donors`. ✅
- **Verified on scratch DB:** concurrent accept — exactly 1 winner.

### 8. Donor Rejection & Withdrawal ✅
- `POST /api/requests/[id]/reject` — updates `request_invites.status = 'rejected'`. ✅
- `POST /api/requests/[id]/donor-cancel` — donor withdrawal. ✅
- `/progress` route enforces valid state machine transitions. ✅

### 9. Contact Revelation ✅
- `reveal_contact()` SQL RPC — checks accepted `request_responses` link before returning `phone`/`full_name`/`address`. ✅
- Called directly by frontend via Supabase client (by design — no backend route wrapper needed). ✅

### 10. Donation Reporting ✅
- `POST /api/donations/report` — requester-only; 409 on duplicate. ✅
- Notifies donor on submission. ✅

### 11. Donor Confirmation & Disputes ✅
- `confirm_donation_report()` / `dispute_donation_report()` / `admin_resolve_report()` — all atomic RPCs. ✅
- **Verified on scratch DB:** 4/4 Phase 2 tests PASS.

### 12. Donation Count Increments Exactly Once ✅
- `confirm_donation_report()` has idempotency guard via `donation_history` check. ✅
- **Verified on scratch DB:** double-confirm → count stays at 1.

### 13. In-App Notifications ✅
- Full CRUD via RPC; no direct client writes (migration 000007). ✅
- `GET /api/notifications` with cursor pagination + inline `unread_count`. ✅
- `GET /api/notifications/unread-count` for lightweight polling. ✅
- **Verified on scratch DB:** 4/4 Phase 3 tests PASS.

### 14. Thalassemia Scheduling & Donor Circles ✅
- Create → invite → accept/decline → conflict check — all implemented. ✅
- **Verified on scratch DB:** circle conflict blocked (Phase 4 test 1 PASS).

### 15. Community Map Pins ✅
- `GET /api/community-map/pins` — bounded viewport, max 1.0 deg². ✅
- `POST /api/community-map/pins/[id]/respond` — eligibility via SQL, rate-limited. ✅
- **Verified on scratch DB:** Phase 4 test 2 PASS.

### 16. Account Deletion ⚠️
- Purges storage, anonymizes requests, purges notifications, deletes profile + auth user. ✅
- **⚠️ MINOR:** No `{ confirm: true }` body validation — route ignores body.

### 17. Rate Limiting & RLS ✅
- `check_rate_limit()` RPC used for 3 endpoints. ✅
- RLS on all 13 tables. ✅

### 18. Durable Scheduler ✅
- pg_cron + fallback HTTP endpoint. ✅
- **Verified on scratch DB:** Phase 4 test 3 PASS.

---

## Part C — Architecture Verification

| Check | Status |
|---|---|
| `getUser()` used (not `getSession()`) in all routes | ✅ Confirmed in every route handler and middleware |
| Service-role key never exposed to browser | ✅ `createAdminClient()` server-only; browser uses `NEXT_PUBLIC_*` only |
| Notifications 100% in-app | ✅ No SMS, email, WhatsApp, or browser push |
| `POST /api/push/subscribe` absent | ✅ Correct — not implemented; in-app polling is primary |
| Private donor coordinates never exposed | ✅ `donation_location` never returned in any SELECT response |
| CNIC data not unnecessarily exposed | ✅ Only `cnic_last4` stored; full CNIC never persisted |
| Donor commitments cannot conflict | ✅ `accept_request()` and `accept_circle_invitation()` check with `FOR UPDATE` |
| Request capacity cannot be exceeded | ✅ Atomic `accepted_donors_count >= required_donors` check |
| Scheduler jobs executable | ✅ pg_cron registered; tested on scratch DB |

---

## Part D — Contract Comparison

### INTEGRATION_CONTRACT.md vs Backend Routes

| Contract Route | Implemented | Verdict |
|---|---|---|
| `POST /api/requests` | ✅ | Matches (after urgency fix) |
| `GET /api/requests/:id` | ✅ | Matches |
| `POST /api/requests/:id/respond` | ❌ MISSING | Backend uses `/accept` + `/reject` |
| `POST /api/requests/:id/progress` | ✅ | Matches |
| `POST /api/requests/:id/status` | ✅ | Matches |
| `GET /api/inbox` | ✅ | Matches |
| `POST /api/ai/parse-request` | ❌ NOT IMPL | AI not implemented |
| `POST /api/ai/eligibility` | ❌ NOT IMPL | AI not implemented |
| `POST /api/push/subscribe` | ❌ NOT IMPL | Push not implemented |
| `GET /api/thal/schedule` | ✅ | Matches |
| `POST /api/thal/schedule` | ⚠️ | Body schema differs |
| `POST /api/thal/bookings/:id` | ❌ MISSING | Backend: `/api/thal/schedule/[id]/respond` |
| `POST /api/reports` | ❌ NOT IMPL | Abuse reports not implemented |
| `DELETE /api/account` | ⚠️ | Missing `{ confirm: true }` body |

### Body / Shape Mismatches

| Issue | Contract | Backend | Severity |
|---|---|---|---|
| Urgency enum | `"critical"\|"urgent"\|"planned"` | `"standard"\|"urgent"\|"critical"` | 🔴 P0 — DB fails on `"standard"` |
| Accept/decline | `POST /requests/:id/respond` + `{ action }` | `/accept` and `/reject` as separate routes | 🔴 P0 — route doesn't exist |
| Thal schedule body | `{ interval_days, last_transfusion }` | `{ blood_group, required_donors, scheduled_date, location, notes }` | 🔴 P1 — completely different |
| Thal booking respond | `POST /thal/bookings/:id` + `{ action: "confirm"\|"decline" }` | `POST /thal/schedule/[id]/respond` + `{ action: "accept"\|"decline" }` | 🟡 P1 — URL and enum differ |
| Account delete body | `{ confirm: true }` | No body validation | 🟡 P1 — safety risk |
| unread count key | implied `unread_count` | `/unread-count` returns `{ count }` vs inline `{ unread_count }` | 🟡 P1 — key inconsistency |

---

## Part E — Build & Test Results

### TypeScript
```
npx tsc --noEmit → Exit 0, 0 errors
```

### ESLint
```
npm run lint → Exit 0, 0 errors, 0 warnings
```

### Production Build
```
npm run build → Exit 0, 36 dynamic server-rendered routes
```

### Database Tests (Scratch DB, 2026-11-11, 18/18 PASS)
```
Phase 1: 7/7 PASS  (19.2s)
Phase 2: 4/4 PASS  (25.2s)
Phase 3: 4/4 PASS  (21.8s)
Phase 4: 3/3 PASS  (18.1s)
Total:  18/18 PASS
```
> Re-running in sandboxed env fails with `EAI_AGAIN` (no network). Run with `SCRATCH_DB_URL` available to confirm.

---

## Part F — Prioritized Fix List

### 🔴 P0 — Fix Before ANY Frontend Integration

#### Fix 1: Urgency Enum
**File:** `src/app/api/requests/route.ts` line 7  
**Change:** `["standard", "urgent", "critical"]` → `["critical", "urgent", "planned"]`

#### Fix 2: Add `/api/requests/[id]/respond` Route
Add a unified route that maps `{ action: "accept" }` → `/accept` RPC and `{ action: "decline" }` → `/reject` RPC.  
Keep existing `/accept` and `/reject` routes for backward compatibility.

### 🟡 P1 — Fix Before Integration Checkpoint 2

#### Fix 3: Thalassemia Schedule Contract Alignment
Update `INTEGRATION_CONTRACT.md` Section 5 thal schedule body to match the actual `{ blood_group, required_donors, scheduled_date, location, notes }` schema.  
Add `/api/thal/bookings/[id]` alias that delegates to `/api/thal/schedule/[id]/respond`.

#### Fix 4: Account Delete Body Validation
Add `z.object({ confirm: z.literal(true) })` to `DELETE /api/account`.

#### Fix 5: Unread Count Key Standardization
Change `GET /api/notifications/unread-count` response from `{ count }` to `{ unread_count }`.

### 🟢 P2 — Post-MVP (non-blocking)

- Implement `POST /api/ai/parse-request` and `POST /api/ai/eligibility` when AI API credentials available
- Implement `POST /api/push/subscribe` if web push is added
- Implement `POST /api/reports` for abuse reporting

---

## Verdict

> ## ⚠️ READY AFTER SPECIFIC FIXES

The backend is structurally complete, security-hardened, and all 18 database invariant tests pass on the scratch DB. Two **P0 blockers** must be fixed before the frontend can begin integration:

1. **Urgency enum bug** — fix in 2 lines of code
2. **Missing `/respond` route** — add ~30-line wrapper route

After those two fixes, Phase 1 and Phase 2 integration checkpoints can proceed. The P1 contract updates (thal schema, account delete body, unread count key) must be agreed with the frontend before Day 2 integration.

| Feature Area | Status |
|---|---|
| Auth / profile / availability | ✅ READY |
| CNIC / OCR / verification | ✅ READY |
| Blood requests | ⚠️ AFTER urgency fix + /respond route |
| Notifications / inbox | ⚠️ AFTER unread_count key fix |
| Thalassemia | ⚠️ AFTER contract update |
| Community map | ✅ READY |
| Admin routes | ✅ READY |
| Account deletion | ⚠️ AFTER body validation fix |
| AI features | ❌ NOT IMPLEMENTED (non-blocking) |
| Push / abuse reports | ❌ NOT IMPLEMENTED (non-blocking) |

