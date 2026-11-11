# BLOODBRIDGE PRODUCT IMPLEMENTATION PLAN
**Generated:** 2026-11-11  
**Phase:** PHASE 0 — RECONNAISSANCE AND PRODUCT PLAN  
**Status:** COMPLETE (Plan established, ready for Phase 1 on confirmation)

---

## 1. Executive Summary & Repository Status

### 1.1 Backend State (`~/Desktop/BloodBridge`)
- **Framework & Runtime**: Next.js 16 (App Router), React 19, TypeScript 5, Node v24.22.2.
- **Database**: Supabase PostgreSQL 17.11 with PostGIS, 11 forward-only SQL migrations applied (`000001` to `000011`).
- **Backend API Surface**: 37 Route handlers across `src/app/api/**` covering Auth, Profile, Location, CNIC Verification/OCR, Blood Requests, Expansion Scheduler, Thalassemia Cycles, Donation Reporting/Confirmation/Disputes, In-app Notifications, and Community Map.
- **Verification**: 18/18 Database invariant tests verified on live scratch DB. `tsc --noEmit`, ESLint, and production build compile with 0 errors.

### 1.2 Frontend State & Discovery Audit
- **Inspection Finding**: The prompt states: *"An existing frontend created by my friend, extracted separately."*
- **Audit Findings**:
  - `~/Desktop/BloodBridge/src/app` currently has only the default Next.js template `page.tsx` and `layout.tsx`.
  - Thorough search across filesystem (`/home/mfasihudin7/Desktop`, `Downloads`, `Documents`, `/tmp`, git reflogs, archives) showed that any external directory previously named `FrontEnd` is currently not present on the disk or has been cleaned up.
  - Therefore, in **Phase 1**, we will build a clean, unified, responsive design system and frontend directly in `src/` inside the existing Next.js app (or import/merge the friend's frontend files if provided/placed by the user).

---

## 2. Product Architecture & Mapping to Master Specification

### 2.1 Core Pillars
1. **Primary Dual Roles in One Account**:
   - **"I WANT TO DONATE"** (Donor Mode): Toggle Availability ON/OFF with backend prerequisites (blood group, location, consent, notification preference).
   - **"I NEED BLOOD"** (Requester Mode): Emergency vs. Planned blood request with units, hospital, and notes.
2. **Emergency Matching (InDrive-style)**:
   - Server-driven radial expansion: 5 km → 10 km → 15 km → 20 km → 30 km → 50 km.
   - Display countdown/next expansion timestamp driven by authoritative DB `expansion_jobs.run_at`.
   - In-app notification delivery to matching donors; atomic `accept_request` capacity checking.
3. **OpenStreetMap / Leaflet Integration**:
   - Map & list toggle, hospital pins, emergency request markers with urgency coloring.
   - Zero private donor coordinate leakage before acceptance; post-acceptance mutual consent for live coordinates.
4. **Donation Completion & Statistical Integrity**:
   - Recipient reports outcome: (A) Donated, (B) Nobody came, (C) Donor cancelled/did not arrive, (D) External source.
   - Two-step confirmation: donor confirms or disputes report.
   - Donation count increments exactly once in `donation_history` upon confirmation.
   - Strict separation of Donor vs Recipient statistics.
5. **Thalassemia Dedicated Support**:
   - Recurring transfusion scheduler, donor circles, member commitment tracking, and conflict-free date scheduling.
6. **Bilingual Experience (English & Urdu)**:
   - Central dictionary, full RTL layout support for Urdu, clean LTR for English, persistent language preference.
7. **PWA Support**:
   - Mobile-first, installable manifest, offline-ready shell, responsive design on phones and desktops.

---

## 3. Backend Gaps & Contract Fixes (Identified in Audit)

Before or during integration, the following 2 P0 backend fixes and contract alignments will be completed:
1. **Urgency Enum Alignment (P0)**:
   - `src/app/api/requests/route.ts`: Change allowed urgency values from `["standard", "urgent", "critical"]` to `["critical", "urgent", "planned"]` to match Postgres CHECK constraint `CHECK (urgency IN ('critical', 'urgent', 'planned'))`.
2. **Unified Invitation Response Route (P0)**:
   - Add `POST /api/requests/[id]/respond` accepting `{ action: "accept" | "decline" }` to unify the client contract with backend's `/accept` and `/reject` RPC handlers.
3. **Thalassemia Schedule Request Alignment (P1)**:
   - Align frontend schedule submission body with backend `scheduled_requirements` schema (`blood_group`, `required_donors`, `scheduled_date`, `location`, `notes`).
4. **Notifications Unread Count Key Standardization**:
   - Ensure `/api/notifications/unread-count` returns `{ unread_count: number }` consistent with `/api/notifications`.

---

## 4. Phase-by-Phase Implementation Roadmap

### PHASE 0 — Reconnaissance and Product Plan (CURRENT)
- [x] Inspect backend capabilities and existing endpoints.
- [x] Audit frontend state and directory structure.
- [x] Document architecture, gaps, and roadmap in `BLOODBRIDGE_PRODUCT_PLAN.md`.
- [x] Initialize `BLOODBRIDGE_PRODUCT_PROGRESS.md`.
- [x] STOP and await approval.

---

### PHASE 1 — Foundation and Design System
- Setup Tailwind / CSS Design System: Clean humanitarian palette (calm white/light gray background `#FDFDFD`, deep burgundy accent `#8A1538`, emergency red `#DC2626`, clear status indicators).
- Bilingual Dictionary & RTL Subsystem:
  - English & Urdu dictionaries (`src/locales/en.json`, `src/locales/ur.json`).
  - RTL switcher and font styling (`dir="rtl"` vs `dir="ltr"`).
- Responsive Shell & Navigation:
  - Desktop topbar + Mobile bottom-nav bar with 5 primary sections: Home, Request, Community Map, My Activity, Profile.
- Central API & Auth Client:
  - Typed integration client `src/lib/api.ts` connecting Supabase SSR session and `/api/**`.
- Public Landing & Auth Workflow:
  - Clean Landing Page with "I WANT TO DONATE" and "I NEED BLOOD" hero actions.
  - Login / Register modal & session management.

---

### PHASE 2 — Donor and Recipient Core
- Donor Availability ON/OFF Switch:
  - Prerequisites check (location, blood group, notifications consent) with intuitive onboarding dialog.
  - Profile view with donor stats and preferences.
- Blood Request Creation (Requester Mode):
  - Emergency vs Planned blood request flow.
  - Blood group, units, hospital address/geolocation, urgency selection.
- Recipient Dashboard & Request Status:
  - Active request view, invited donor counter, real-time status tracker.
- Donor Inbox & In-App Notification Center:
  - Pending invites with accept/decline actions.
  - Active commitments tracker.

---

### PHASE 3 — Emergency Matching and Map
- Leaflet / OpenStreetMap Integration:
  - Responsive Map & List toggle.
  - Hospital markers and emergency blood request pins (color-coded by urgency).
  - Viewport-bounded pin fetching (`/api/community-map/pins`).
- InDrive-Style Emergency Radial Expansion:
  - Live radius expansion tracker (5 km → 10 km → 15 km → 20 km → 30 km → 50 km).
  - Authoritative server timestamp countdown for next expansion.
- Donor Acceptance & Contact Revelation:
  - Secure acceptance call.
  - Contact reveal only upon verified acceptance via `reveal_contact` RPC.
  - Mutual location sharing consent UI.

---

### PHASE 4 — Donation Completion and Statistics
- Recipient Outcome Reporting Flow:
  - Four choices: (A) Donated, (B) Nobody came, (C) Cancelled/No show, (D) Other source.
- Donor Confirmation & Dispute UI:
  - Confirmation prompt for donors.
  - Dispute filing with mandatory reason text.
- History & Activity Dashboard:
  - Confirmed donation timeline.
  - Distinct Donor Statistics vs Recipient Statistics cards.

---

### PHASE 5 — Thalassemia Support
- Dedicated Thalassemia Section:
  - Patient/family future transfusion scheduler.
  - Blood group, date, units, hospital selection.
- Donor Circles & Cycle Management:
  - Circle member invitation tracking.
  - Conflict-free date validation (cannot commit to multiple circles on same date).
  - Replacement notification workflow upon donor cancellation.

---

### PHASE 6 — CNIC and Admin
- CNIC Verification Flow:
  - Secure front and back photo upload to private storage bucket.
  - Client-side preview and privacy masking warnings.
  - OCR extraction status and user review/edit step (`PUT /api/profile/cnic-details`).
- Admin Review Dashboard:
  - Admin-only view for pending verifications (`GET /api/admin/verifications`).
  - Approval / Rejection with mandatory reason (`POST /api/admin/verifications/[id]/review`).
  - Disputed donation resolution dashboard (`POST /api/admin/donations/[id]/resolve`).

---

### PHASE 7 — PWA, Accessibility and Final Verification
- PWA Configuration: `manifest.json`, service worker registration, install prompt, offline shell.
- Full Urdu RTL linguistic audit & typography checks.
- End-to-end user workflow testing across Mobile and Desktop viewport dimensions.
- Production build validation (`npm run build`, `npm run lint`).
- Final project handoff report.

