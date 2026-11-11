# BloodBridge Backend Contract Proposals & API Documentation

This document specifies the exact request and response schemas, authorization rules, and status codes for all backend API endpoints implemented across Phases 1 through 4.

---

## 1. Authentication & Common Error Shape

All endpoints (except scheduler cron) authenticate requests using Supabase SSR cookies (`@supabase/ssr`).

### Standard Error Response Shape
```json
{
  "ok": false,
  "code": "VALIDATION" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "INVALID_TRANSITION" | "RATE_LIMITED" | "AI_UNAVAILABLE" | "INTERNAL",
  "message": "Human readable explanation",
  "fields": { "fieldName": "Field specific error" }
}
```

### Standard Success Response Shape
```json
{
  "ok": true,
  "data": { ... }
}
```

---

## 2. Phase 1: Donor Profile, Availability & Location

### `PUT /api/donor/location`
Sets donor location and explicit location consent.
- **Auth**: Authenticated user
- **Body**: `{ "lat": number, "lng": number, "consent": true, "area_en"?: string }`
- **Response**: `200 OK` `{ "location_updated": true }`

### `DELETE /api/donor/location`
Clears donor location and consent, and automatically resets `is_available` to `false`.
- **Auth**: Authenticated user
- **Response**: `200 OK` `{ "cleared": true }`

### `PUT /api/donor/availability`
Toggles donor availability. Validates 4 mandatory conditions: location present, consent given, blood group set, and in-app notifications enabled.
- **Auth**: Authenticated user
- **Body**: `{ "available": boolean }`
- **Response**: `200 OK` `{ "is_available": boolean }`

### `PUT /api/donor/notification-preferences`
Toggles in-app notifications preference.
- **Auth**: Authenticated user
- **Body**: `{ "enabled": boolean }`
- **Response**: `200 OK` `{ "in_app_request_notifications_enabled": boolean }`

---

## 3. Phase 1: CNIC Identity Verification & OCR

### `POST /api/verification/cnic/reserve`
Reserves a single-use slot for uploading CNIC photos to Storage.
- **Auth**: Authenticated user
- **Response**: `200 OK` with reservation ID and upload token

### `POST /api/verification/cnic`
Finalizes submission of CNIC documents for admin review.
- **Auth**: Authenticated user
- **Body**: `{ "reservation_id": string, "front_image_path": string, "back_image_path": string }`
- **Response**: `201 Created`

### `POST /api/verification/cnic/extract`
Performs privacy-first redaction and text extraction on CNIC. Rate-limited to 5/hour.
- **Auth**: Authenticated user
- **Body**: `{ "image_base64": string }`
- **Response**: `200 OK` `{ "extracted": { "full_name": string, "address": string, "area": string } }`

---

## 4. Phase 2: Donation Reports & History

### `POST /api/donations/report`
Recipient reports a donation outcome for a donor.
- **Auth**: Authenticated requester
- **Body**:
  ```json
  {
    "request_id": "UUID",
    "donor_id": "UUID",
    "outcome": "donated" | "not_donated",
    "reported_donation_date": "YYYY-MM-DD",
    "feedback": "Optional feedback"
  }
  ```
- **Response**: `201 Created` `{ "id": "UUID" }`

### `POST /api/donations/[id]/confirm`
Donor confirms a reported donation. Atomically increments `donation_count` and updates `last_donated`.
- **Auth**: Authenticated donor (report owner)
- **Response**: `200 OK` `{ "confirmed": true }`

### `POST /api/donations/[id]/dispute`
Donor disputes a false or incorrect donation report.
- **Auth**: Authenticated donor
- **Body**: `{ "reason": "Explanation text" }`
- **Response**: `200 OK` `{ "disputed": true }`

### `GET /api/donations/history`
Retrieves paginated confirmed donation history for the authenticated donor.
- **Auth**: Authenticated user
- **Query Params**: `cursor` (ISO timestamp), `limit` (1-50, default 20)
- **Response**: `200 OK` `{ "items": [...], "next_cursor": string | null }`

---

## 5. Phase 3: Blood Requests, Invites & Notifications

### `POST /api/requests`
Creates an emergency blood request. Immediately invites eligible donors within 5km and schedules expansion jobs.
- **Auth**: Authenticated user (requester)
- **Rate Limit**: 3 per 60 minutes
- **Body**:
  ```json
  {
    "blood_group": "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-",
    "units": 1..10,
    "hospital": "Hospital Name",
    "urgency": "critical" | "urgent" | "planned",
    "location": { "lat": number, "lng": number },
    "note": "Optional note",
    "required_donors": 1..5,
    "expires_at": "Optional ISO string"
  }
  ```
- **Response**: `201 Created` `{ "id": "UUID", "invited_count": number }`

### `GET /api/requests/[id]`
Fetches request details. Requester sees accepted donors; invited donors see request specs.
- **Auth**: Requester or invited donor
- **Response**: `200 OK` `{ "request": {...}, "is_requester": boolean, "accepted_donors": [...] }`

### `POST /api/requests/[id]/accept`
Donor accepts request invitation. Atomically validates verified status, availability, and capacity.
- **Auth**: Authenticated invited donor
- **Response**: `200 OK` `{ "accepted": true, "accepted_donors_count": number }`

### `POST /api/requests/[id]/reject`
Donor declines invitation.
- **Auth**: Authenticated invited donor
- **Response**: `200 OK` `{ "declined": true }`

### `POST /api/requests/[id]/cancel`
Recipient cancels active request.
- **Auth**: Requester
- **Response**: `200 OK` `{ "cancelled": true }`

### `POST /api/requests/[id]/donor-cancel`
Donor withdraws acceptance.
- **Auth**: Accepted donor
- **Response**: `200 OK` `{ "withdrawn": true }`

### `POST /api/requests/[id]/progress`
Donor updates delivery lifecycle step.
- **Auth**: Accepted donor
- **Body**: `{ "progress": "en_route" | "arrived" | "donated" }`
- **Response**: `200 OK` `{ "progress": string }`

### `POST /api/requests/[id]/status`
Requester marks request fulfilled.
- **Auth**: Requester
- **Body**: `{ "status": "fulfilled" | "cancelled" }`
- **Response**: `200 OK` `{ "status": string }`

### `GET /api/inbox`
Donor views pending invitations and active commitments.
- **Auth**: Authenticated donor
- **Response**: `200 OK` `{ "invitations": [...], "active_commitments": [...] }`

### `GET /api/notifications`
Lists notifications with cursor pagination and unread counts.
- **Auth**: Authenticated user
- **Response**: `200 OK` `{ "items": [...], "next_cursor": string | null, "unread_count": number }`

### `POST /api/notifications/[id]/read`
Marks single notification as read.
- **Auth**: Notification owner
- **Response**: `200 OK` `{ "read": true }`

### `POST /api/notifications/read-all`
Marks all notifications as read.
- **Auth**: Authenticated user
- **Response**: `200 OK` `{ "marked_all": true }`

### `POST /api/scheduler/expand`
Cron worker executing radial expansion and expiration jobs.
- **Auth**: `x-cron-secret` matching `CRON_SECRET`
- **Response**: `200 OK` `{ "processed": number }`

---

## 6. Phase 4: Thalassemia Scheduling & Community Map

### `GET /api/thal/schedule`
Lists scheduled requirements as requester or circle donor.
- **Auth**: Authenticated user
- **Response**: `200 OK` `{ "as_requester": [...], "as_donor": [...] }`

### `POST /api/thal/schedule`
Creates a future scheduled requirement and creates donor circle invitations.
- **Auth**: Authenticated user
- **Body**:
  ```json
  {
    "blood_group": "A+",
    "required_donors": 2,
    "scheduled_date": "YYYY-MM-DD",
    "location": { "lat": 31.5204, "lng": 74.3587 },
    "notes": "Monthly transfusion"
  }
  ```
- **Response**: `201 Created` `{ "requirement_id": "UUID", "circle_id": "UUID", "invited_count": number }`

### `POST /api/thal/schedule/[id]/cancel`
Cancels scheduled requirement and notifies circle members.
- **Auth**: Requester
- **Response**: `200 OK` `{ "cancelled": true }`

### `POST /api/thal/schedule/[id]/respond`
Donor accepts or declines circle membership.
- **Auth**: Authenticated invited donor
- **Body**: `{ "action": "accept" | "decline" }`
- **Response**: `200 OK` `{ "accepted": true }` | `{ "declined": true }`

### `GET /api/community-map/pins`
Queries blood requests within a geographic bounding box (max 1.0 sq deg).
- **Auth**: Authenticated user
- **Query Params**: `min_lat`, `min_lng`, `max_lat`, `max_lng`, `status`?
- **Response**: `200 OK` array of pins

### `POST /api/community-map/pins/[id]/respond`
Donor self-accepts a pin directly from community map.
- **Auth**: Authenticated verified donor
- **Rate Limit**: 10 per 60 minutes
- **Response**: `200 OK` `{ "accepted": true }`

### `PATCH /api/community-map/pins/[id]/status`
Requester updates pin status.
- **Auth**: Requester
- **Body**: `{ "status": "fulfilled" | "cancelled" }`
- **Response**: `200 OK` `{ "status": string }`

---

## 7. Admin Routes

### `GET /api/admin/verifications`
Lists pending CNIC verification submissions for admin review.
- **Auth**: Admin user (`is_admin = true`)
- **Query Params**: `status`? (`pending` | `approved` | `rejected`), `cursor`, `limit`
- **Response**: `200 OK` `{ "items": [...], "next_cursor": string | null }`

### `POST /api/admin/verifications/[id]/review`
Admin approves or rejects a CNIC verification.
- **Auth**: Admin user
- **Body**: `{ "action": "approve" | "reject", "note"?: string }`
- **Response**: `200 OK` `{ "reviewed": true }`

### `DELETE /api/admin/verifications/cleanup`
Purges expired unsubmitted CNIC reservations.
- **Auth**: Admin user or `CRON_SECRET`
- **Response**: `200 OK` `{ "purged": number }`

### `POST /api/admin/donations/[id]/resolve`
Admin resolves a disputed donation report to `confirmed` or `rejected`.
- **Auth**: Admin user
- **Body**: `{ "resolution": "confirmed" | "rejected", "note"?: string }`
- **Response**: `200 OK` `{ "resolved": true }`

---

## 8. Account Lifecycle

### `DELETE /api/account`
Permanently deletes the authenticated user's account and cascades all associated data:
profile, requests, donation history, invitations, circle memberships, notifications, and
CNIC verification records. CNIC images in Storage must be deleted by the caller before
calling this endpoint (or the route handles Storage cleanup if the service-role key is available).
- **Auth**: Authenticated user
- **Body**: `{ "confirm": true }`
- **Response**: `200 OK` `{ "deleted": true }`

---

## 9. Notification Utilities

### `GET /api/notifications/unread-count`
Lightweight endpoint returning only the unread notification count. Suitable for polling.
- **Auth**: Authenticated user
- **Response**: `200 OK` `{ "unread_count": number }`

---

## 10. Authorization Matrix

| Endpoint group | `anon` | `authenticated` | `is_verified` | `is_admin` |
|----------------|:------:|:---------------:|:-------------:|:----------:|
| Donor location / availability | ✗ | ✅ | ✗ | ✗ |
| CNIC OCR extract | ✗ | ✅ (rate-limited) | ✗ | ✗ |
| CNIC reserve / submit | ✗ | ✅ | ✗ | ✗ |
| Create blood request | ✗ | ✅ | ✗ | ✗ |
| Accept / reject invitation | ✗ | ✅ | ✅ | ✗ |
| Donation report / confirm | ✗ | ✅ | ✗ | ✗ |
| Thalassemia schedule | ✗ | ✅ | ✗ | ✗ |
| Community map pins | ✗ | ✅ | ✗ | ✗ |
| Community map pin respond | ✗ | ✅ | ✅ | ✗ |
| Admin verifications | ✗ | ✗ | ✗ | ✅ |
| Admin dispute resolve | ✗ | ✗ | ✗ | ✅ |
| Scheduler expand | ✗ | ✗ (CRON_SECRET) | ✗ | ✗ |
| Account delete | ✗ | ✅ (own) | ✗ | ✗ |

---

## 11. Rate Limits Summary

| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /api/verification/cnic/extract` | 5 calls | 1 hour |
| `POST /api/requests` | 3 calls | 60 minutes |
| `POST /api/community-map/pins/[id]/respond` | 10 calls | 60 minutes |
| All other routes | No explicit limit | — |

Rate limits are enforced via the `check_rate_limit()` database RPC against the
`api_rate_limits` table. Exceeded limits return `429 Too Many Requests` with error
code `RATE_LIMITED`.

---

## 12. Privacy & Security Guarantees

- **Coordinates**: Never returned in any API response. `location` columns are stored in
  `profiles` and filtered out of all SELECT responses. Distance calculations occur inside
  SQL (`ST_DWithin`).
- **CNIC digits**: Redacted to `XXXXX-XXXX-X` in all responses and logs.
- **Phone numbers**: Read strictly from `auth.users.phone`; never accepted from client
  `raw_user_meta_data`.
- **`is_admin` / `is_verified`**: Cannot be set by signup metadata. Only admin RPCs or
  direct DB access can elevate these flags.
- **Notifications**: In-app only. No SMS, no email, no push to external services.
- **OCR consent**: Must be explicitly granted via `PUT /api/verification/cnic/ocr-consent`
  before `POST /api/verification/cnic/extract` will process any image.

