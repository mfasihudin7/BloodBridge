# BloodBridge — Backend Security & Isolation Audit

**Audit Timestamp:** 2026-11-11  
**Scope:** Migration definitions, API routes, database functions, authorization controls, and operational isolation.

---

## 1. Authentication & Cookie SSR Integrity
- **Pattern Enforced:** Supabase SSR cookie authentication (`@supabase/ssr`).
- **Token Handling:** No client-supplied Bearer tokens or fake authorization headers are honored in user-facing endpoints.
- **Session Identification:** User identity is always retrieved via `supabase.auth.getUser()`. Client-supplied user IDs, roles, or counts are strictly rejected.

---

## 2. Row Level Security (RLS) & Protected Fields
- **Status:** All core tables have active RLS:
  - `public.profiles`
  - `public.requests`
  - `public.request_responses`
  - `public.request_invites`
  - `public.expansion_jobs`
  - `public.notifications`
  - `public.donation_reports`
  - `public.donation_history`
  - `public.scheduled_requirements`
  - `public.donor_circles`
  - `public.circle_members`
  - `public.api_rate_limits`
- **Mutations:** Sensitive fields (`is_admin`, `is_verified`, `donation_count`, `last_donated`, `is_available`, `donation_location`) are protected by explicit triggers (`protect_profile_fields`) or strict RLS policies. They can only be altered through trusted `SECURITY DEFINER` procedures.

---

## 3. Concurrency & Cross-Request Race Prevention
- **Lock Ordering:** All cross-request and donation operations adhere to a strict, uniform lock sequence:
  1. Lock `requests` or `scheduled_requirements` row (`FOR UPDATE`).
  2. Lock `profiles` row of the acting donor (`FOR UPDATE`).
- **Capacity & State Enforcement:**
  - `accept_request()` verifies capacity under row-level lock and immediately transitions state upon saturation.
  - Concurrent confirmations for a single report fail atomically with a unique key constraint on `donation_history(report_id)`.

---

## 4. Privacy & Personal Data Protections
- **Coordinates & Addresses:** CNIC extracted addresses are strictly segregated from geographic donation locations (`donation_location`).
- **Phone Numbers:** Direct phone contact is masked until request acceptance is finalized through controlled authorization.
- **OCR Privacy:** Front CNIC images are stripped of all personal identifying numbers (13-digit CNIC) before OCR analysis.

