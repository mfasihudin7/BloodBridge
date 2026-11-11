# BloodBridge: Integration Contract

This file is the single agreement between the frontend and the backend. Both people read it first. Both Antigravity agents must follow it exactly.

It answers: what does the frontend call, what does the backend return, and how do we switch from fake data to the real backend.

---

## 1. How the pieces connect

```
 Phone / Browser (PWA)
        |
   Frontend (Next.js pages + components)
        |
   src/lib/api.ts   <-- the ONLY place the frontend talks to the backend
        |
   +----+---------------------------+
   |                                |
 Supabase client (direct,        Next.js route handlers
 protected by RLS)                (/api/...) for logic, AI, push
   |                                |
   +----------------+---------------+
                    |
              Supabase (Postgres + PostGIS + Auth + Realtime)
```

Three ways data moves:
1. **Direct reads and writes with RLS:** own profile, own notifications.
2. **RPC (database functions):** map data, accepting a request, revealing contact. Done in SQL so security and race conditions are handled in the database.
3. **API routes:** anything with logic, AI, push, or rate limiting.
4. **Realtime:** the frontend subscribes to changes so status and pins update live.

One mobile strategy: the website is a PWA, so the same code is the website and the phone app (installable from the browser). Optional later: wrap with Capacitor to produce an Android APK.

---

## 2. Working in parallel without blocking each other

- **One repo, one Next.js project.** Two branches: `feat/frontend-*` and `feat/backend-*`. Merge to `main` through pull requests.
- **Folder ownership**

| Folder | Owner |
|---|---|
| `src/app/**` (except `api`), `src/components/**`, `src/styles/**`, `src/mocks/**`, `src/lib/api.ts`, `public/**` | Frontend |
| `src/app/api/**`, `src/lib/server/**`, `src/lib/supabase/**`, `supabase/**`, `src/middleware.ts` | Backend |
| `src/types/contract.ts`, `INTEGRATION_CONTRACT.md` | Both (pull request needs the other's approval) |

- **Mock mode:** the frontend builds against fake data with `NEXT_PUBLIC_USE_MOCKS=true`. Mock functions in `src/mocks/` have the exact same signature as the real ones. When the backend is ready, flip the flag to `false`.
- **Contract freeze:** finish and agree this file in the first 2 hours of Day 1. After that, changes need a pull request and a message to the other person.

---

## 3. Shared types (`src/types/contract.ts`)

```ts
export type BloodGroup = 'A+'|'A-'|'B+'|'B-'|'AB+'|'AB-'|'O+'|'O-';
export type Urgency = 'critical' | 'urgent' | 'planned';
export type RequestStatus = 'open' | 'filled' | 'fulfilled' | 'cancelled' | 'expired';
export type DonorProgress =
  'pending' | 'accepted' | 'en_route' | 'arrived' | 'donated' | 'declined' | 'withdrawn';

export type ErrorCode =
  | 'VALIDATION' | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND'
  | 'CONFLICT' | 'INVALID_TRANSITION' | 'RATE_LIMITED'
  | 'AI_UNAVAILABLE' | 'INTERNAL';

export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = {
  ok: false; code: ErrorCode; message: string;
  fields?: Record<string, string>;
};
export type ApiResult<T> = ApiOk<T> | ApiErr;

export interface Profile {
  id: string; full_name: string; blood_group: BloodGroup;
  age: number; weight_kg: number; height_cm: number;
  phone: string; address?: string; cnic_last4?: string;
  is_available: boolean; last_donated?: string; donation_count: number;
  lat?: number; lng?: number;
}

export interface MapRequest {          // what appears as a pin. No contact details.
  id: string; blood_group: BloodGroup; units: number; units_filled: number;
  hospital: string; urgency: Urgency; status: RequestStatus;
  lat: number; lng: number; created_at: string; distance_m?: number;
}

export interface RequestDetail extends MapRequest {
  note?: string; is_mine: boolean;
  donors: { donor_id: string; first_name: string; progress: DonorProgress }[];
  timeline: StatusEvent[];
}

export interface StatusEvent {
  id: string; request_id: string; actor_role: 'requester'|'donor'|'system';
  status: string; created_at: string;
}

export interface InboxItem {
  response_id: string; progress: DonorProgress; request: MapRequest;
}

export interface Contact { full_name: string; phone: string; address?: string; }

export interface DensityCell { lat: number; lng: number; count: number; }  // fuzzed

export interface ParsedRequest {
  blood_group?: BloodGroup; units?: number; hospital?: string; urgency?: Urgency;
}

export interface ThalSchedule {
  interval_days: number; last_transfusion?: string; next_due?: string;
  bookings: { id: string; scheduled_for: string; donor_first_name: string;
              status: 'pending'|'confirmed'|'done'|'cancelled' }[];
}

export interface AppNotification {
  id: string; kind: string; request_id?: string; body: string;
  read: boolean; created_at: string;
}
```

---

## 4. Frontend API wrapper (`src/lib/api.ts`)

The frontend calls only these. Each returns `ApiResult<T>`. Mock and real versions have identical signatures.

| Function | Backend implementation |
|---|---|
| `api.register / login / logout` | Supabase Auth |
| `api.getMyProfile()` | direct select, RLS own row |
| `api.updateMyProfile(patch)` | direct update, RLS own row |
| `api.setAvailability(bool)` | direct update |
| `api.deleteAccount()` | `DELETE /api/account` |
| `api.getMapRequests(bounds, filters)` | RPC `requests_in_bounds` |
| `api.getDonorDensity(bounds)` | RPC `donor_density` |
| `api.createRequest(input)` | `POST /api/requests` |
| `api.getRequest(id)` | `GET /api/requests/:id` |
| `api.respond(id, 'accept'\|'decline')` | `POST /api/requests/:id/respond` |
| `api.updateDonorStatus(id, 'en_route'\|'arrived'\|'donated')` | `POST /api/requests/:id/progress` |
| `api.updateRequestStatus(id, 'fulfilled'\|'cancelled')` | `POST /api/requests/:id/status` |
| `api.getContact(requestId, otherUserId)` | RPC `reveal_contact` |
| `api.getInbox()` | `GET /api/inbox` |
| `api.getNotifications()` / `markRead(id)` | direct, RLS own rows |
| `api.parseRequest(text, locale)` | `POST /api/ai/parse-request` |
| `api.askEligibility(question)` | `POST /api/ai/eligibility` |
| `api.subscribePush(subscription)` | `POST /api/push/subscribe` |
| `api.getThalSchedule()` / `setThalSchedule(input)` | `GET` and `POST /api/thal/schedule` |
| `api.answerBooking(id, 'confirm'\|'decline')` | `POST /api/thal/bookings/:id` |
| `api.report(target, reason)` | `POST /api/reports` |
| `api.subscribeRealtime(channel, handler)` | Supabase Realtime |

---

## 5. Endpoint specifications

All routes: JSON in, JSON out, `ApiResult<T>` envelope, require a logged-in user unless stated. Auth token comes from the Supabase session cookie.

### `POST /api/requests`
Body:
```json
{ "blood_group": "A+", "units": 2, "hospital": "Nishtar Hospital",
  "urgency": "critical", "lat": 30.19, "lng": 71.47, "note": "optional" }
```
Success: `{ ok: true, data: { request: MapRequest, matched_donors: 7 } }`
Errors: `VALIDATION` (with `fields`), `RATE_LIMITED`.
Behavior: validates, creates the request, finds eligible compatible donors within 3 km, writes notifications, sends push.

### `GET /api/requests/:id`
Returns `RequestDetail`. Only the requester, or a donor who has a response on it, may read the full detail. Others get `FORBIDDEN`.

### `POST /api/requests/:id/respond`
Body: `{ "action": "accept" | "decline" }`
Success: `{ ok: true, data: { progress: DonorProgress } }`
Errors: `CONFLICT` if the request is already filled, `FORBIDDEN` if the donor is ineligible or was not matched, `NOT_FOUND`.

### `POST /api/requests/:id/progress` (donor)
Body: `{ "status": "en_route" | "arrived" | "donated" }`
Allowed order: accepted, then en_route, then arrived, then donated. Anything else returns `INVALID_TRANSITION`.
On `donated`: the backend increments the donor's `donation_count` and sets `last_donated`.

### `POST /api/requests/:id/status` (requester)
Body: `{ "status": "fulfilled" | "cancelled" }`

### `GET /api/inbox`
Returns `InboxItem[]` for the logged-in donor.

### `POST /api/ai/parse-request`
Body: `{ "text": "A+ chahiye, Nishtar Hospital, 2 units, urgent", "locale": "ur" | "en" }`
Success: `{ ok: true, data: ParsedRequest }`
On any AI failure: `{ ok: false, code: "AI_UNAVAILABLE", message: ... }`. The frontend then shows the normal empty form. Missing fields stay undefined, and the user always confirms before sending.

### `POST /api/ai/eligibility`
Body: `{ "question": "Can I donate after a fever?" }`
Success: `{ ok: true, data: { answer: string } }` (answer always ends with the medical disclaimer).

### `POST /api/push/subscribe`
Body: the browser PushSubscription JSON. Success: `{ ok: true, data: {} }`.

### `GET /api/thal/schedule`, `POST /api/thal/schedule`
Body for POST: `{ "interval_days": 14, "last_transfusion": "2026-11-01" }`. Returns `ThalSchedule` including proposed bookings.

### `POST /api/thal/bookings/:id`
Body: `{ "action": "confirm" | "decline" }`

### `POST /api/reports`
Body: `{ "target_user"?: string, "target_request"?: string, "reason": string }`

### `DELETE /api/account`
Deletes the profile and all linked data.

### RPCs (called through the Supabase client)
- `requests_in_bounds(min_lat, min_lng, max_lat, max_lng, blood_group?, urgency?)` returns `MapRequest[]`
- `donor_density(min_lat, min_lng, max_lat, max_lng)` returns `DensityCell[]`, fuzzed
- `reveal_contact(request_id, other_user_id)` returns `Contact`, or an error if no accepted response links the two users

---

## 6. Realtime channels
- `request:{id}`: changes to that request's status and responses. Powers the live timeline and pin color.
- `map`: inserts and status changes on `requests` visible to the user. Pins appear and change color without reload.
- `notifications:{user_id}`: new inbox items.

Fallback: if realtime disconnects, the frontend polls every 10 seconds and shows a small "reconnecting" indicator.

---

## 7. Error handling agreement
- The backend always returns the envelope with a code from `ErrorCode`. It never returns raw errors or stack traces.
- The frontend maps each code to a friendly message:
  - `VALIDATION`: highlight the fields in `fields`
  - `UNAUTHENTICATED`: redirect to login
  - `FORBIDDEN`: "You can't do that."
  - `CONFLICT`: "Someone else just took this request."
  - `INVALID_TRANSITION`: "That step isn't available yet."
  - `RATE_LIMITED`: "Too many attempts. Try again in a minute."
  - `AI_UNAVAILABLE`: silently fall back to the manual form
  - `INTERNAL`: "Something went wrong. Please try again."
- Every call has a timeout. The frontend shows loading, error, and retry states.

---

## 8. Mystery Card (Community Map) traceability

| Card step | Frontend | Backend |
|---|---|---|
| Pin a location | Map pin drop, then request form (F4, F5) | `POST /api/requests` stores the pin as `geography(point)` |
| View map markers | Leaflet map, color pins, filters (F5) | RPC `requests_in_bounds`, `donor_density`, Realtime `map` |
| Respond to pins | Bottom sheet Accept or Decline (F5) | `POST /api/requests/:id/respond`, `accept_request` SQL function |
| Update status | Status buttons and timeline (F5) | `/progress`, `/status`, `status_events`, Realtime `request:{id}` |

For the final submission, write the "Mystery Card feature" section of the MVP document from this table.

---

## 9. Integration plan

| When | Frontend | Backend | Together |
|---|---|---|---|
| Day 1, first 2 hours | F0 design system, mocks | B0 setup | Agree and freeze this contract |
| Day 1 | F1, F2, F3 | B1, B2 | Integration checkpoint 1: login, profile, availability against the real backend |
| Day 2 morning | F4, F5 | B3, B4 | Integration checkpoint 2: create request, map pins, accept, status updates live |
| Day 2 (card received) | Finish F5 | B5 | Flip `NEXT_PUBLIC_USE_MOCKS=false` for everything |
| Day 2 evening | F6, F7 | B6, B7 | Integration checkpoint 3: thalassemia, push, Urdu, PWA install |
| Before Day 3 | Polish | Security checklist | End-to-end test on two real phones, seed data, record backup demo video, MVP document, GitHub repo |

At each checkpoint, test the full flow with two accounts on two devices before moving on.

---

## 10. Integration test (run at every checkpoint)
1. Register two users: A (requester) and B (donor, available, eligible, compatible, nearby).
2. A creates a request. B gets a push and an inbox item, and sees a pin on the map.
3. B accepts. A sees the pin change and the contact reveal. Before accepting, B's contact was hidden (check the API directly).
4. B updates status: on the way, arrived, donated. A sees each change live.
5. A marks fulfilled. B's donation count increases and last-donated updates.
6. Repeat with the Gemini call forced to fail: the form still works.
7. Call an API with user C's token against A's request: must return `FORBIDDEN`.
