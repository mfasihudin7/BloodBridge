# BloodBridge

**Connecting people who need blood with people willing to donate.**

BloodBridge is a mobile-first blood donation coordination platform built
to help people in Pakistan find and connect with potential blood donors.
It supports urgent blood requests as well as planned blood coordination
for people living with thalassemia.

> **Important:** BloodBridge is a coordination platform. It is not a
> blood bank, hospital, diagnostic service, or medical provider. It does
> not guarantee donor availability, medical eligibility, blood
> compatibility, or successful transfusion. All medical screening and
> transfusion decisions must be made by qualified healthcare
> professionals.

## The Problem

When someone urgently needs blood, families often rely on personal
contacts and scattered social media posts. It can be difficult to
identify willing donors nearby, track responses, and coordinate
follow-up. People who need regular transfusions may face this challenge
repeatedly.

## Our Solution

BloodBridge brings the key coordination steps into one simple
experience:

-   **Donate Blood:** Donors can manage their availability and respond
    to blood requests.
-   **Receive Blood:** Requesters can create emergency blood requests.
-   **Thalassemia Support:** Patients or caregivers can coordinate
    planned blood needs in advance.
-   **Location-aware coordination:** A map helps users understand the
    request area and relevant nearby facilities.
-   **Request tracking:** Users can follow request progress and donor
    responses.
-   **Accessible interface:** A mobile-first experience designed for
    simple navigation, with English and Urdu support where available.

## Core User Journey

1.  A user signs in and completes their profile.
2.  The home screen presents two primary actions: **Donate Blood** and
    **Receive Blood**.
3.  A donor switches availability on when willing to receive
    invitations.
4.  A requester chooses **Emergency Blood** or **Thalassemia Support**.
5.  The requester provides the required blood and location details.
6.  The platform coordinates invitations to eligible, opted-in donors.
7.  Donors can accept or decline, and the requester can follow the
    request status.

## Technology

The project uses the following technology stack:

-   **Frontend:** Next.js, React, TypeScript
-   **Styling:** Tailwind CSS
-   **Backend and database:** Supabase, PostgreSQL
-   **Authentication:** Supabase Auth
-   **Geospatial features:** PostgreSQL/PostGIS where configured
-   **Maps:** Leaflet with OpenStreetMap tiles
-   **Deployment:** Compatible with a Next.js hosting platform such as
    Vercel

The exact enabled features depend on the current project configuration
and deployment environment.

## OpenStreetMap

BloodBridge uses OpenStreetMap tiles for map display through Leaflet.

Tile URL:

``` text
https://tile.openstreetmap.org/{z}/{x}/{y}.png
```

Map attribution must remain visible:

``` text
© OpenStreetMap contributors
```

The OpenStreetMap Editing API (`api.openstreetmap.org/api/0.6`) is not
the tile service and is not used for donor matching. Donor matching and
request data are handled by the application's own backend.

Please follow the [OpenStreetMap Tile Usage
Policy](https://operations.osmfoundation.org/policies/tiles/). Do not
bulk-download or prefetch tiles, and do not send personal information
such as CNIC numbers or phone numbers to OpenStreetMap services.

## Getting Started

### Prerequisites

-   Node.js (use a current LTS version)
-   npm
-   A Supabase project with the required database schema and environment
    configuration

### 1. Clone the repository

``` bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd BloodBridge
```

Replace `<YOUR_GITHUB_REPOSITORY_URL>` with your repository's actual
GitHub URL.

### 2. Install dependencies

``` bash
npm install
```

### 3. Configure environment variables

Create a local environment file:

``` bash
cp .env.example .env.local
```

If the repository does not contain `.env.example`, create `.env.local`
using the variable names documented by the project. Obtain the values
from your own Supabase project settings.

**Never commit `.env.local`, Supabase service-role keys, access tokens,
or other secrets to GitHub.** Only browser-safe public configuration
should use `NEXT_PUBLIC_` variables.

### 4. Run the development server

``` bash
npm run dev
```

Open <http://localhost:3000> in your browser.

### 5. Run project checks

``` bash
npm run lint
npx tsc --noEmit
npm run build
```

Resolve any errors before deploying.

## Privacy and Safety Principles

-   Donor participation is voluntary; donors control their availability.
-   Private profile and verification information must be protected by
    server-side authorization and database access policies.
-   CNIC documents, if collected, must remain in private storage and be
    accessible only to authorized reviewers.
-   Exact donor home locations and live donor coordinates must not be
    exposed publicly.
-   Contact information should only be shared through an authorized,
    consent-based workflow.
-   AI assistance must not diagnose patients, approve medical
    eligibility, or make transfusion decisions.
-   The platform should clearly distinguish pending, verified, and
    unverified information.

## MVP Scope

The MVP is focused on demonstrating the essential coordination journey:

-   Account and profile flow
-   Donor availability management
-   Emergency blood request creation
-   Donor invitation and response flow
-   Request status tracking
-   Map-based request context
-   Planned blood coordination for thalassemia patients

Some capabilities may require additional backend configuration, verified
environment variables, or deployment setup. Refer to the running
application and project documentation for the current implementation
status.

## Future Improvements

Potential future improvements include:

-   Stronger hospital and blood-bank partnerships
-   More robust identity and request verification
-   Improved Urdu language coverage and accessibility
-   Additional moderation and abuse-prevention tools
-   Operational analytics for community coordinators
-   Carefully governed integrations with healthcare organizations

## Contributing

Contributions, testing, and feedback are welcome. Before submitting
changes:

1.  Keep personal data and secrets out of source control.
2.  Preserve existing authentication and database security rules.
3.  Test changes locally.
4.  Run lint, TypeScript, and production build checks.
5.  Document any new environment variables or database migrations.

## Hackathon Project

**Theme:** *AI with Purpose: Building Better Societies*

BloodBridge explores how accessible technology and responsible AI can
support a real community need by making blood donation coordination
clearer and easier.

------------------------------------------------------------------------

Made with the goal of helping communities connect when every donation
can matter.
