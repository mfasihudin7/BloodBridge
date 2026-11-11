# BloodBridge — Hackathon Mobile-First MVP

**Every drop connects.** A mobile-first, installable web prototype for FAST TechSoc AI Hackathon 2026, based on the team's BloodBridge MVP document.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL displayed by Vite. For a production bundle:

```bash
npm run build
npm run preview
```

## Deploy on Vercel

1. Upload this entire folder to a GitHub repository (do not upload `node_modules`).
2. In Vercel, **Add New → Project → Import Git Repository**.
3. Framework preset: **Vite**. Build command: `npm run build`. Output directory: `dist`.
4. Deploy. Open the URL on your phone. In your browser menu choose **Add to Home Screen** for an app-like experience.
5. HTTPS is required for browser geolocation. The app requests GPS permission only when the user taps the GPS button.

## What works in this self-contained prototype

- Signup, sign-in, second-step profile onboarding, blood group and donor availability toggle
- Emergency and scheduled blood requests with a tap-to-pin OpenStreetMap/Leaflet hospital map
- Search-radius matching (3 → 8 → 13 → ... km) and opt-in invitation logic
- Donor invitations, accept/decline, request progress, completion confirmation and donation history
- Independent in-app notifications, community pin creation/response/status changes
- Thalassemia advance booking and deterministic coverage indicator
- Bilingual-intake *interface* with a limited offline **rule-based** extraction demonstration
- Clearly labelled simulated moving marker and remaining straight-line distance
- Mobile-friendly navigation, responsive layout, PWA manifest and fictional demonstration donor markers

## Critical demo limitations

**This is a frontend-only demonstration, not a live, multi-user production system.** Data and accounts persist only in the current browser's `localStorage`. Different phones and browsers do not sync. Passwords are stored in local browser storage and are **not secure**. Do not use real patient data, real passwords or personal contact details. The demo accounts are fictional.

Fictional map markers illustrate discovery but **are not actual registered users and never receive invitations**. Real invitation records are created only for registered users in the same browser who opted in and match the request blood group. The matching rule intentionally uses **exact group matching only** as a conservative demo simplification; it does not medically validate compatibility or donor eligibility. Medical screening and hospital/blood-bank approval are required in real use.

The demo's 90-day waiting-period check is an illustrative configurable rule, not medical clearance. GPS capture during onboarding is a one-time browser permission request. Tracking is a simulated straight-line movement, **not real-time donor tracking**, and there is no road-routing API. In-app notifications are stored in the same browser and are not push notifications when the app is closed. The extraction demo is **not powered by an LLM**; it recognises limited English patterns and urgency keywords in English/Urdu/Roman Urdu. No external AI API is configured.

## Suggested production architecture

Next.js + Supabase Auth/Postgres/RLS + Realtime + secure per-user notifications + server-side matching + consent-gated location sessions + a verified medical compatibility policy + server-side AI request extraction with Zod validation. For actual deployment, add secure authentication, protected patient data, audit logs, rate limiting, donor verification, proper notification delivery, privacy review and licensed blood-bank partnerships.

## Demo sequence

1. Register a requester and complete onboarding. Create an urgent B+ request for Nishtar Hospital.
2. View map markers and expand the radius. Explain that beige markers are illustrative, not notified.
3. Create a second B+ account in the same browser, enable donor availability. Sign back into requester and create another B+ request.
4. Sign into the donor account and open Notifications to accept the invitation. Sign back into requester to see the match and confirm completion.
5. Create a scheduled transfusion and view the coverage progress in Planner.
6. On Community Map, add a pin, then open it to change status. Switch account to respond to another user's pin.
7. Show the simulated moving marker, explicitly labelled as a demo.

## Project team

KAF Scoders — FAST TechSoc AI Hackathon 2026.
