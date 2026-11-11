# BloodBridge — Backend Plan (Hackathon MVP)

Owner: Backend lead. Read `INTEGRATION_CONTRACT.md` (revision 2) before coding.

## 0. Goal, scope and time rule

Provide secure authentication, donor matching, request responses, contact authorization, request status updates and the map data endpoints.

**Priority:** secure core request lifecycle first. AI, push and thalassemia are optional extensions.

**Time rule (the build window is short):** a thin working version of B0–B3 beats a perfect B1. Every phase has a "minimum to pass" list. Anything not on it moves to the end. Never skip the privacy and authorization tests; skip polish instead.

**AI note:** this is an AI hackathon. After B3 is stable, B4 (request parsing) is the single recommended AI feature for the demo. Do it before B5/B6.

## 1. Ownership

Backend owns: `supabase/**`, `src/app/api/**`, `src/lib/server/**`, `src/lib/supabase/**` (including `client.ts`, which the frontend imports read-only for Auth), `src/middleware.ts`, `.env.example`, `tests/server/**`.

Backend must not edit frontend pages, components or styles. Shared/locked: `src/types/contract.ts`, `INTEGRATION_CONTRACT.md`. Shared config (`package.json`, lockfile, `next.config.*`, `tsconfig.json`): ask the human before changing; say why.

If another agent shares the folder, work in a separate `git worktree`.

## 2. Security principles

- RLS on every table exposed through the Supabase API. Default deny, then add narrow policies.
- Verify authorization on the server/database, not only in the UI. Check ownership/role for every client-supplied ID (IDOR).
- Supabase anon/publishable key may be public; the service-role key, AI keys, VAPID private key and DB credentials stay server-only and never use `NEXT_PUBLIC_*`.
- Never return phone, address, CNIC data or donor coordinates through map/matching responses.
- Reveal contact only after an accepted response links the two exact users.
- Users cannot update `is_admin`, donation counters, eligibility flags or moderation fields. Use column-level grants or a trusted function, not UI hiding.
- Server-side validation (Zod), rate limits, safe errors and timeouts.
- Do not log secrets, tokens, phone numbers or unnecessary health/location data.
- Passwords are handled by Supabase Auth; build no custom password system.
- `SECURITY DEFINER` functions: fixed `search_path`, restricted execute grants.
- Demo seed data must be clearly synthetic.

## 3. Data and medical safety

- Collect the minimum: no CNIC numbers or ID scans.
- Donor location: store only a coarse area (lat/lng rounded to ~1 km) set by the donor with consent; never return it from any endpoint. Donors with no area are not matched but can still respond from the map.
- Treat health and location data as sensitive; define retention/deletion (account deletion removes profile, area and responses; requests are anonymized or removed — document which).
- Compatibility uses a hard-coded, unit-tested table; an LLM never decides compatibility or eligibility. Starting point for **red-cell (whole blood) donation**, to be reviewed by a medically informed person before the demo, with the source named in code comments:

| Recipient | Compatible donors |
|---|---|
| O- | O- |
| O+ | O+, O- |
| A- | A-, O- |
| A+ | A+, A-, O+, O- |
| B- | B-, O- |
| B+ | B+, B-, O+, O- |
| AB- | AB-, A-, B-, O- |
| AB+ | all eight groups |

- Rank exact-group donors first. The app does not handle platelets, plasma or other components in the MVP; say so in the UI.
- Eligibility policy (configurable, non-clinical): opted in, available, 18+ self-declared, `last_donated` older than the configured minimum interval (use a documented value such as 90 days unless a reviewer says otherwise). Never call a user "medically eligible"; final screening is by clinical staff.
- AI eligibility Q&A, if ever built, is informational, carries a disclaimer and never overrides hard-coded blocks.

## 4. Phases and acceptance gates

Work in order. Stop at each gate and report. "Min" = minimum to pass the gate.

### B0 — Repository and Supabase setup
- Inspect the repo and any existing schema before creating migrations.
- Create/link the Supabase project. Use plain lat/lng columns with a bounding-box filter and haversine distance; add PostGIS only if you can justify it.
- Migrations with clear names; `.env.example` with variable names only; `.env*` ignored, `.env.example` tracked.
- Create `src/lib/supabase/client.ts` (browser, anon key) and a server client.
- Generate DB types.
- **Gate:** migrations apply to a fresh database; lint, `tsc --noEmit`, build pass.

### B1 — Auth, profiles and RLS
- Supabase Auth with email/password. Profile created by a trusted trigger from signup metadata.
- `GET/PATCH /api/me`, `POST /api/me/availability`, `DELETE /api/me`.
- Protect server-controlled fields.
- **Gate (min):** automated test proves user B cannot read or modify user A's profile; anonymous access denied; a PATCH that includes `donation_count` or `is_admin` is rejected.

### B2 — Matching, requests and responses
- Pure, unit-tested functions: compatibility, eligibility policy, ranking.
- `POST /api/requests` with Zod validation, rate limit and active-request cap. Match opted-in, available, compatible, eligible donors with a set area within a small radius; widen by a deterministic documented policy. Create `pending` response rows and notifications.
- `GET /api/inbox`, `GET /api/requests/:id`.
- `POST /api/requests/:id/respond` (accept/decline/withdraw): SQL function locks the request row; works for matched donors and for eligible donors responding from a map pin; recomputes `units_filled`.
- Expiry: set `expires_at` by urgency (documented values) and treat expired requests as inactive in every query (an explicit check is enough for the MVP).
- **Gate (min):** incompatible/ineligible/unavailable donors are not matched or accepted; concurrent accepts never exceed `units`; unauthorized users cannot respond.

### B3 — Lifecycle, contact and map data
- `POST /progress` (accepted → en_route → arrived → donated), `POST /confirm` (requester only; increments `donation_count`/`last_donated`), `POST /status` (fulfilled/cancelled).
- `GET /contact` via `reveal_contact`, both directions, denied before acceptance and after decline/withdraw.
- Record status events; create notifications; `GET/POST /api/notifications`.
- `GET /api/map/requests` (authenticated, max 200 rows, approved fields only, `my_progress`). `GET /api/map/density` is optional: grid-snapped, cells under 5 donors suppressed.
- **Gate (min):** two-user lifecycle test passes; map/API payloads contain no phone, note, donor or requester identity; contact rules hold.

### B4 — AI request parsing (recommended for the demo)
- Only after B1–B3 are stable.
- `POST /api/ai/parse-request`: server-side call, timeout, rate limit, strict schema validation, safe `AI_UNAVAILABLE` fallback. English and Urdu input.
- Never use AI for eligibility, compatibility, diagnosis or emergency-care advice. The user reviews every parsed field.
- **Gate:** forced AI outage returns a documented safe response; the manual form still works.

### B5 — Optional push notifications
- In-app notifications first. Web push only if it can be tested on a real device. Push is best-effort; the notification row is always created.
- WhatsApp only through an approved provider with consent; never automate personal accounts.
- **Gate:** notification row is created even when push fails.

### B6 — Optional thalassemia scheduling
- Defer unless B1–B3 are stable and a medically informed workflow exists. Otherwise keep it out of the demo and out of the code.

### B7 — Hardening and release
- Rate limiting: in-memory counters do **not** work reliably on serverless hosting. Use a database-backed counter or a managed limiter you have actually tested.
- Security headers and a tested CSP. The CSP must allow what the map needs (OpenStreetMap tile images) and nothing broad.
- `npm audit` and a secret scanner (e.g. `gitleaks`); review findings, do not blindly apply breaking upgrades.
- Tests for RLS, IDOR, authorization, validation, rate limits, contact reveal, races and error handling.
- Synthetic seed data (labelled) and a repeatable reset script.
- **Gate:** exact commands and results documented. No security claim without evidence.

## 5. API behavior

Follow `INTEGRATION_CONTRACT.md` exactly. Every route: authenticate, validate with Zod, return the agreed envelope with the correct HTTP status, never leak stack traces/SQL/secrets, apply timeouts to external services, and enforce ownership/role checks on every client-supplied ID.

## 6. Antigravity first prompt (B0)

Read `BACKEND_PLAN.md` and `INTEGRATION_CONTRACT.md` completely. Work ONLY in backend-owned folders. First inspect the repository, current migrations, Supabase configuration and environment variable names; report them. Do not overwrite existing schema or project setup blindly.

Start with B0 only. Before editing, give a short plan and list assumptions. Implement the smallest maintainable solution. Do not invent contract fields or silently change endpoint behavior. Ask before changing `package.json` or other shared config.

Security is enforced in database/server code. Test with at least two separate users. Never claim RLS, authorization, contact privacy or concurrency safety is correct unless you ran the relevant test.

After the phase, report: (1) files changed, (2) commands/tests actually run and results, (3) acceptance checks passed/failed/not run, (4) known bugs and unverified behavior, (5) a simple explanation of the implementation. Stop at the phase gate and wait for approval.
