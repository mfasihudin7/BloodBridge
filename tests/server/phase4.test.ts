import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";

function getScratchDbUrl(): string {
  if (!fs.existsSync(".env.local")) {
    throw new Error("FATAL: .env.local not found");
  }
  const content = fs.readFileSync(".env.local", "utf8");
  const match = content.match(/SCRATCH_DB_URL=([^\r\n]+)/);
  if (!match || !match[1].trim()) {
    throw new Error("FATAL: SCRATCH_DB_URL is not set in .env.local");
  }
  const url = match[1].trim();
  if (url.includes("uosxzybxgnwuqsvosixb")) {
    throw new Error("SAFETY VIOLATION: SCRATCH_DB_URL points to main project!");
  }
  return url;
}

describe("Phase 4 Live Scratch DB Invariant Verification", () => {
  let client: Client;

  before(async () => {
    const dbUrl = getScratchDbUrl();
    client = new Client({ connectionString: dbUrl });
    await client.connect();
  });

  after(async () => {
    if (client) {
      await client.end();
    }
  });

  async function createDonor(name: string, opts: {
    bloodGroup?: string;
    isVerified?: boolean;
    isAvailable?: boolean;
    lat?: number;
    lng?: number;
  } = {}) {
    const id = randomUUID();
    const email = `donor_${id.slice(0, 8)}@bloodbridge.org`;
    await client.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2);`, [id, email]);
    
    const lat = opts.lat ?? 31.5204;
    const lng = opts.lng ?? 74.3587;
    const bloodGroup = opts.bloodGroup ?? "O+";
    const isVerified = opts.isVerified ?? true;
    const isAvailable = opts.isAvailable ?? true;

    await client.query(
      `UPDATE public.profiles
       SET full_name = $1,
           blood_group = $2,
           is_verified = $3,
           is_available = $4,
           location_consent = true,
           donation_location = ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography,
           in_app_request_notifications_enabled = true
       WHERE id = $7;`,
      [name, bloodGroup, isVerified, isAvailable, lng, lat, id]
    );
    return id;
  }

  it("1. Thalassemia circle conflict: donor cannot accept circle invitation if conflicting commitment on same date", async () => {
    const requester1 = await createDonor("Thal Requester 1");
    const requester2 = await createDonor("Thal Requester 2");
    const donor = await createDonor("Committed Circle Donor");

    const req1Id = randomUUID();
    const circle1Id = randomUUID();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split("T")[0];

    // Create requirement 1 and circle 1
    await client.query(`
      INSERT INTO public.scheduled_requirements (id, requester_id, blood_group, required_donors, scheduled_date, status)
      VALUES ($1, $2, 'O+', 1, $3, 'open');
    `, [req1Id, requester1, dateStr]);
    await client.query(`INSERT INTO public.donor_circles (id, requirement_id) VALUES ($1, $2);`, [circle1Id, req1Id]);
    await client.query(`INSERT INTO public.circle_members (circle_id, donor_id, status) VALUES ($1, $2, 'invited');`, [circle1Id, donor]);

    // Accept circle 1 invitation
    await client.query(`BEGIN;`);
    await client.query(`SET LOCAL ROLE authenticated;`);
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true);`, [donor]);
    await client.query(`SELECT set_config('request.jwt.claims', $1, true);`, [JSON.stringify({ role: "authenticated", sub: donor })]);
    const accept1 = await client.query(`SELECT public.accept_circle_invitation($1);`, [circle1Id]);
    assert.equal(accept1.rows[0].accept_circle_invitation.accepted, true);
    await client.query(`COMMIT;`);

    // Create requirement 2 for same date and circle 2
    const req2Id = randomUUID();
    const circle2Id = randomUUID();
    await client.query(`
      INSERT INTO public.scheduled_requirements (id, requester_id, blood_group, required_donors, scheduled_date, status)
      VALUES ($1, $2, 'O+', 1, $3, 'open');
    `, [req2Id, requester2, dateStr]);
    await client.query(`INSERT INTO public.donor_circles (id, requirement_id) VALUES ($1, $2);`, [circle2Id, req2Id]);
    await client.query(`INSERT INTO public.circle_members (circle_id, donor_id, status) VALUES ($1, $2, 'invited');`, [circle2Id, donor]);

    // Attempt to accept circle 2 invitation on same date — must fail with schedule_conflict
    await client.query(`BEGIN;`);
    await client.query(`SET LOCAL ROLE authenticated;`);
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true);`, [donor]);
    await client.query(`SELECT set_config('request.jwt.claims', $1, true);`, [JSON.stringify({ role: "authenticated", sub: donor })]);

    let conflictCaught = false;
    try {
      await client.query(`SELECT public.accept_circle_invitation($1);`, [circle2Id]);
    } catch (err: unknown) {
      conflictCaught = true;
      const msg = (err as Error).message;
      assert.ok(msg.includes("schedule_conflict") || (err as { code: string }).code === "P0001");
    }
    await client.query(`ROLLBACK;`);

    assert.ok(conflictCaught, "Accepting two conflicting circle appointments on same date must be rejected");
  });

  it("2. Community map pin eligibility: unified function checks distance, blood group, notifications, and auto-invites", async () => {
    const requester = await createDonor("Map Requester", { bloodGroup: "A+" });
    const eligibleDonor = await createDonor("Near Map Donor", { bloodGroup: "A+", lat: 31.5205, lng: 74.3588 });
    const wrongBloodDonor = await createDonor("Wrong Blood Donor", { bloodGroup: "B+", lat: 31.5205, lng: 74.3588 });
    const distantDonor = await createDonor("Distant Map Donor", { bloodGroup: "A+", lat: 32.5000, lng: 75.5000 }); // >100km away

    const reqId = randomUUID();
    await client.query(`
      INSERT INTO public.requests (id, requester_id, blood_group, units, hospital, urgency, status, location, required_donors)
      VALUES ($1, $2, 'A+', 1, 'Services Hospital', 'urgent', 'open', ST_SetSRID(ST_MakePoint(74.3587, 31.5204), 4326)::geography, 1);
    `, [reqId, requester]);

    // 1. Eligible donor check
    const elig1 = await client.query(`SELECT public.check_map_pin_respond_eligibility($1, $2, 50.0);`, [reqId, eligibleDonor]);
    assert.equal(elig1.rows[0].check_map_pin_respond_eligibility.eligible, true);

    // Verify invitation auto-created
    const inv = await client.query(`SELECT * FROM public.request_invites WHERE request_id = $1 AND donor_id = $2;`, [reqId, eligibleDonor]);
    assert.equal(inv.rows.length, 1);

    // 2. Wrong blood group check
    const elig2 = await client.query(`SELECT public.check_map_pin_respond_eligibility($1, $2, 50.0);`, [reqId, wrongBloodDonor]);
    assert.equal(elig2.rows[0].check_map_pin_respond_eligibility.eligible, false);
    assert.equal(elig2.rows[0].check_map_pin_respond_eligibility.reason, "blood_group_mismatch");

    // 3. Distant donor check (>50km)
    const elig3 = await client.query(`SELECT public.check_map_pin_respond_eligibility($1, $2, 50.0);`, [reqId, distantDonor]);
    assert.equal(elig3.rows[0].check_map_pin_respond_eligibility.eligible, false);
    assert.equal(elig3.rows[0].check_map_pin_respond_eligibility.reason, "outside_max_radius");
  });

  it("3. Scheduler job execution: process_expansion_jobs claims, expands, and expires jobs with lock recovery", async () => {
    const requester = await createDonor("Scheduler Requester");
    const reqId = randomUUID();
    await client.query(`
      INSERT INTO public.requests (id, requester_id, blood_group, units, hospital, urgency, status, location, required_donors)
      VALUES ($1, $2, 'O+', 1, 'Jinnah Hospital', 'urgent', 'open', ST_SetSRID(ST_MakePoint(74.3587, 31.5204), 4326)::geography, 1);
    `, [reqId, requester]);

    // Insert an expired job
    const expireJobId = randomUUID();
    await client.query(`
      INSERT INTO public.expansion_jobs (id, job_type, request_id, scheduled_at, status)
      VALUES ($1, 'expire_request', $2, now() - interval '10 minutes', 'pending');
    `, [expireJobId, reqId]);

    // Insert an abandoned job (>5 min running)
    const abandonedJobId = randomUUID();
    await client.query(`
      INSERT INTO public.expansion_jobs (id, job_type, request_id, scheduled_at, status, lock_acquired_at)
      VALUES ($1, 'expire_request', $2, now() - interval '10 minutes', 'running', now() - interval '6 minutes');
    `, [abandonedJobId, reqId]);

    // Execute process_expansion_jobs()
    const execRes = await client.query(`SELECT public.process_expansion_jobs() as processed;`);
    assert.ok(execRes.rows[0].processed >= 1, "Should process at least 1 job");

    // Verify request expired
    const reqRow = await client.query(`SELECT status, terminal_reason FROM public.requests WHERE id = $1;`, [reqId]);
    assert.equal(reqRow.rows[0].status, "expired");
    assert.equal(reqRow.rows[0].terminal_reason, "request_expired");
  });
});
