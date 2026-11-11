# Raabta — Backend Integration & Gap Analysis

This document specifies the exact mapping between Raabta frontend interfaces and BloodBridge backend capabilities, alongside documented gaps and proposed database migrations.

---

## 1. UI Screen to API Endpoint Mapping

| UI Route | User Action / Component | Backend API Endpoint / RPC | Payload / Params | Status & Authorization |
|---|---|---|---|---|
| `/onboarding` | Register / Login | Supabase Auth `signUp` / `signInWithPassword` | `email`, `password`, `user_metadata` | Authorized / Public |
| `/onboarding` | Profile Essentials Update | Supabase `profiles.update` | `full_name`, `blood_group` | Session Owner |
| `/` (Home) | Availability status display | `GET /api/account` or Supabase Auth context | None | Authenticated user |
| `/` (Home) | Personal stats (donations, last donated) | `profiles.donation_count`, `profiles.last_donated` | None | Authenticated user |
| `/requests/new` | Create Emergency / Planned Blood Request | `POST /api/requests` | `blood_group`, `units`, `hospital`, `urgency`, `location: {lat, lng}`, `required_donors`, `note` | Authenticated requester |
| `/requests/[id]` | Request live tracking & scheduler status | `GET /api/requests/[id]` | Request ID param | Requester or Invited/Accepted Donor |
| `/requests/[id]` | Cancel request | `POST /api/requests/[id]/cancel` | Request ID param | Requester only |
| `/requests/[id]` | Accept / Decline Invitation | `POST /api/requests/[id]/respond` | `action: "accept" \| "decline"` | Invited Donor |
| `/activity` | View pending invitations | `GET /api/donor/inbox` | None | Authenticated donor |
| `/activity` | Update donation transit status | `POST /api/donor/commitments/[id]/progress` | `progress: "en_route" \| "arrived" \| "donated"` | Accepted donor |
| `/activity` | Report donation outcome | `POST /api/donations/report` | `request_id`, `donor_id`, `outcome`, `feedback` | Requester |
| `/activity` | Confirm / Dispute donation report | `POST /api/donations/[id]/respond` | `action: "confirm" \| "dispute"`, `dispute_reason` | Donor |
| `/map` | Browse emergency blood needs in area | `GET /api/requests/in-bounds` | `min_lat`, `min_lng`, `max_lat`, `max_lng` | Public / Open Requests |
| `/thalassemia` | Schedule advance transfusion | `POST /api/thal/schedule` | `blood_group`, `units`, `hospital`, `transfusion_date`, `notes` | Requester |
| `/profile` | Toggle availability ON/OFF | `PUT /api/donor/availability` | `is_available: boolean` | Donor (validates prerequisites) |
| `/profile` | Save GPS location with consent | `POST /api/donor/location` | `latitude`, `longitude`, `consent: true` | Donor |
| `/profile` | Clear location & turn OFF | `DELETE /api/donor/location` | None | Donor |
| `/profile` | Delete account | `DELETE /api/account` | None | Session owner |
| `/verification`| Upload CNIC front/back | `POST /api/verification/cnic` | Multipart FormData | Authenticated user |
| `/admin` | Review pending verifications | `GET /api/admin/verifications` | None | Admin (`is_admin: true`) |

---

## 2. Documented Feature Gaps & Architectural Boundaries

### A. Extended Profile Demographics
- **Gap**: Fields requested for extended donor profiling (`date_of_birth`, `gender`, `height_cm`, `weight_kg`, `city`, `area`, `health_conditions`) are not in initial migrations 1-4.
- **Solution**: Unapplied migration `20261111000013_extended_profiles.sql` is provided. The onboarding UI collects essential `full_name` and `blood_group` into the existing `profiles` table, storing extended fields gracefully without breaking schema integrity.

### B. Live Real-Time Location Sharing
- **Gap**: There is no live GPS beacon or tracking table in the backend.
- **Solution**: The UI explicitly informs the user that only static hospital/request coordinates are published, and exact donor coordinates are never tracked or shown live.

### C. Donor Density Visualization
- **Gap**: There is no authorized public endpoint to count individual private donor locations in an area.
- **Solution**: The map and request views only show open hospital requests (`requests_in_bounds`), strictly avoiding fabricated donor counters or fake heatmaps.

### D. Thalassemia Automatic Recurrence
- **Gap**: Backend supports one-off scheduled transfusion records; it does not have a cron daemon automatically synthesizing recurring weekly/monthly events.
- **Solution**: The UI accurately presents scheduled transfusion slots as discrete advance appointments, with recurring donor circle invites.

### E. Phone Number Authentication
- **Gap**: Phone OTP provider configuration depends on external Twilio/MessageBird credentials on Supabase hosted dashboard.
- **Solution**: The UI supports phone/email normalized auth seamlessly using Supabase Auth with password fallback.

