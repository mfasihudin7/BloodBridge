# BloodBridge Backend Runbook

## Overview
This runbook provides deployment, operations, and architecture instructions for the BloodBridge backend coordination platform.

---

## 1. Environment Variables Configuration

Ensure the following variables are configured in `.env.local` for local execution or within the hosting environment (e.g. Vercel dashboard):

| Variable | Description | Exposure |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project API URL | Client + Server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Anon Key (publicly safe) | Client + Server |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key (privileged DB admin) | **Server Only** |
| `CRON_SECRET` | Secret token verifying incoming scheduled cron invocations | **Server Only** |
| `OCR_PROVIDER` | Active OCR Provider (`fallback_manual`, `synthetic`, or `configured`) | Server Only |
| `OCR_API_KEY` | API Key for external OCR service (optional/conditional) | Server Only |
| `OCR_MODEL` | OCR Model identifier for external provider (optional) | Server Only |

> [!CAUTION]
> Never expose `SUPABASE_SERVICE_ROLE_KEY` or `CRON_SECRET` with a `NEXT_PUBLIC_` prefix or in any client-accessible files.

---

## 2. Forward-Only Migrations

All migrations reside in `supabase/migrations/`:

- `20261110000001_initial_schema.sql` (Baseline)
- `20261110000002_cnic_verification_and_security_remediation.sql` (Security hardening & review)
- `20261110000003_cnic_atomic_review_and_storage_hardening.sql` (Atomic review & storage limits)
- `20261111000004_profile_provisioning_donor_location_and_ocr.sql` (Phase 1 profile provisioning, location, consent)
- `20261111000005_donation_reports_and_history.sql` (Phase 2 donation report confirmation, dispute, and history)
- `20261111000006_requests_expansion_and_notifications.sql` (Phase 3 matching, invites, radius expansion jobs)
- `20261111000007_notifications_rls_hardening.sql` (Phase 3 notification RLS lockdown & read RPCs)
- `20261111000008_thalassemia_and_community_map.sql` (Phase 4 thalassemia scheduling, circles, and map coordinates)
- `20261111000009_rate_limits_and_security_hardening.sql` (Phase 4 API rate limits table and atomic checker)

### Applying Migrations to Hosted Supabase
To push migrations to the hosted database, the project owner should run:
```bash
npx supabase db push --linked
```
*(Do not run this automatically inside sandboxes without explicit instructions).*

---

## 3. Scheduled Radius Expansion (Cron)

Radius expansion and request expiration run every minute via `/api/scheduler/expand`.
The endpoint checks the `x-cron-secret` header against `CRON_SECRET`.

Vercel Cron configuration is defined in `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/scheduler/expand",
      "schedule": "* * * * *"
    }
  ]
}
```

The endpoint executes `process_expansion_jobs()` using `FOR UPDATE SKIP LOCKED` to safely claim up to 5 jobs per invocation across concurrent scheduler invocations without contention.

---

## 4. Rate Limiting Rules

Enforced atomically via `check_rate_limit(p_user_id, p_action, p_max, p_window_minutes)`:

- **Create Emergency Request**: 3 requests per 60 minutes.
- **Respond to Map Pin**: 10 responses per 60 minutes.
- **CNIC OCR Extraction**: 5 extractions per 60 minutes (`cnic_extraction_rate_limits`).

---

## 5. Security & Isolation Architecture

1. **Authentication**: All client-facing endpoints use Supabase SSR cookies (`createServerClient` from `@supabase/ssr`).
2. **Authorization & Row Level Security (RLS)**:
   - Tables (`profiles`, `requests`, `donation_reports`, `notifications`, `request_invites`, `circle_members`) have active RLS.
   - Ordinary authenticated users cannot directly mutate sensitive state (e.g. `is_verified`, `is_admin`, `donation_count`).
   - Mutations must execute through `SECURITY DEFINER` stored functions that enforce domain rules, row-level locks, and ownership validation.
3. **Consistent Lock Ordering**:
   - In cross-request coordination, transactions lock the `requests` row first, followed by the `profiles` row using `FOR UPDATE` to avoid deadlocks.

