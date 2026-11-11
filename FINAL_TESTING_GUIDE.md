# BLOODBRIDGE — COMPREHENSIVE MANUAL TESTING GUIDE
## Verification of End-to-End User Journeys (English & Urdu)

This guide documents the exact setup and procedures to test all integrated user journeys of BloodBridge on both desktop and mobile viewports.

---

## 1. Quick Start Commands

```bash
# Ensure correct node version (v20+ or v24)
export PATH="/home/mfasihudin7/.nvm/versions/node/v24.22.2/bin:$PATH"

# Run development server
npm run dev
# The application will be live at http://localhost:3000
```

### Production Test Mode
```bash
npm run build
npm start
```

---

## 2. Environment Variables Required

These variable **names** must exist in your `.env.local` (values are kept confidential and never exposed):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`

---

## 3. Journey A: Emergency Blood Recipient

1. **Sign In / Registration**:
   - Navigate to `http://localhost:3000`.
   - Click **Sign In** in the top navigation or click **I NEED BLOOD** on the hero banner.
   - Enter your phone number and password.
2. **Post Blood Request**:
   - Go to `/requests/new`.
   - Select urgency (e.g. `Critical`), blood group (e.g. `B+`), units (e.g. `2`), and hospital name (e.g. `PIMS Hospital, Islamabad`).
   - Click **Detect Current Location as Hospital** to auto-populate GPS coordinates, or manually type coordinates.
   - Click **Submit & Broadcast Alert**.
3. **Live Matching Tracker**:
   - You will automatically be routed to `/requests/[id]`.
   - Observe the live metrics: **Invited Donors count**, **Target Donors**, and the authoritative **Next Radius Expansion timer** (synchronized to server database jobs).
   - Once a donor accepts, their name and current progression (`accepted`, `en_route`, `arrived`, `donated`) appear in the accepted donors list.
4. **Outcome Reporting**:
   - Once a donor completes their donation, click **Report Outcome** next to their name.
   - Confirm the donation or report that the donor was unable to donate.

---

## 4. Journey B: Volunteer Donor Mode & Activity

1. **Setup Donor Profile & Availability**:
   - Go to `/profile`.
   - Set your **Blood Group**.
   - Under **Location Preference**, click **Detect Current Location** and confirm the explicit consent checkbox.
   - Ensure **In-App Request Notifications** is toggled ON.
   - Switch **Availability to ON**. (Notice: Availability ON is strictly rejected if prerequisites are missing).
2. **Receive In-App Emergency Invitations**:
   - Open `/activity` (or click **My Activity** in the navbar).
   - Under the **Emergency Invitations** tab, review incoming matching alerts (distance radius shown, e.g. 5 km).
   - Click **Accept Request** (or **Decline**).
3. **Manage Active Commitments**:
   - Switch to the **Active Commitments** tab.
   - Progress your journey sequentially: `I am on the way (En Route)` → `I have arrived at Hospital` → `Donation Completed`.
   - If emergency circumstances change, click **Withdraw Commitment**.
4. **Availability OFF Safety**:
   - Return to `/profile` and switch **Availability to OFF**.
   - Notice: Your existing accepted commitments in `/activity` remain intact and manageable, but you are excluded from any new invitations.
5. **Mutual Confirmation & Verified Statistics**:
   - When the recipient submits an outcome report, verify the record in `/activity` under the **Verified Donation Records** tab.
   - Notice your verified `donation_count` increments strictly upon valid confirmation.

---

## 5. Journey C: Thalassemia Recurring Care & Donor Circles

1. **Schedule Future Requirement**:
   - Navigate to `/thalassemia`.
   - Click **➕ Schedule Future Requirement**.
   - Select transfusion date (must be in the future), target number of volunteer donors (1-10), and hospital coordinates.
   - Click **Schedule Requirement**.
2. **Donor Circle Notification**:
   - The system automatically invites nearby eligible donors to form a dedicated **Donor Circle**.
   - Review invited vs. accepted circle members under the **Upcoming Scheduled Requirements** tab.
3. **Volunteer in a Circle**:
   - Eligible donors can switch to the **Circle Invitations** tab to accept or decline the advance care request.

---

## 6. Journey D: Identity Verification & Administration Portal

1. **Volunteer CNIC Submission**:
   - Navigate to `/verification`.
   - Click **Start Secure Verification** to reserve a time-limited upload slot (protected by rate limits).
   - Attach front and back document photos, review the explicit consent statement, and click **Submit for Verification**.
   - Review or save your name and last 4 digits for identity masking.
2. **Admin Portal**:
   - Navigate to `/admin`.
   - If signed in as an administrator (`is_admin = true` in database profile), review the pending queue.
   - Click **Inspect Document** to securely access short-lived signed URLs (5 minutes TTL).
   - Click **Approve Verification** or enter a rejection reason and click **Reject Verification**.
   - Switch to **Disputed Donations** tab to resolve any donation outcome disputes with audited admin notes.

---

## 7. Journey E: Community Emergency Map

1. **Map Exploration**:
   - Go to `/map`.
   - Toggle between **Map View** (interactive OpenStreetMap Leaflet engine) and **List View**.
   - Pan and zoom: Observe that viewport bounding queries automatically reload pins (safeguarded to 1.0 deg²).
   - Filter by blood group or urgency.
2. **Direct Pin Volunteer Response**:
   - Click on any red (Critical) or amber (Urgent) marker.
   - Click **Volunteer as Donor** in the bottom sheet/card.
   - Response triggers backend eligibility check (50 km radius limit, availability ON, blood group match).
   - Upon acceptance, requester contact details are revealed in your **Activity** tab.

---

## 8. Language & PWA Mobile Testing

1. **Urdu & RTL**:
   - Click the **🌐 اردو** button in the header.
   - Observe complete page flip to RTL (`dir="rtl"`), Urdu translations, and font scaling.
   - Toggle back to English anytime.
2. **PWA Installability**:
   - Open Chrome DevTools > Application > Manifest.
   - Verify `/manifest.json` is loaded with theme color `#881337`, standalone display mode, and correct icon paths.

