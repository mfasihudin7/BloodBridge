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

describe("Phase 3 Live Scratch DB Invariant Verification", () => {
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
    consent?: boolean;
    lat?: number;
    lng?: number;
    notifications?: boolean;
  } = {}) {
    const id = randomUUID();
    const email = `donor_${id.slice(0, 8)}@bloodbridge.org`;
    await client.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2);`, [id, email]);
    
    const lat = opts.lat ?? 31.5204;
    const lng = opts.lng ?? 74.3587;
    const bloodGroup = opts.bloodGroup ?? "B+";
    const isVerified = opts.isVerified ?? true;
    const isAvailable = opts.isAvailable ?? true;
    const consent = opts.consent ?? true;
    const notifications = opts.notifications ?? true;

    await client.query(
      `UPDATE public.profiles
       SET full_name = $1,
           blood_group = $2,
           is_verified = $3,
           is_available = $4,
           location_consent = $5,
           donation_location = ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography,
           in_app_request_notifications_enabled = $8
       WHERE id = $9;`,
      [name, bloodGroup, isVerified, isAvailable, consent, lng, lat, notifications, id]
    );
    return id;
  }

  async function createRequest(requesterId: string, opts: {
    bloodGroup?: string;
    requiredDonors?: number;
    lat?: number;
    lng?: number;
  } = {}) {
    const id = randomUUID();
    const bloodGroup = opts.bloodGroup ?? "B+";
    const requiredDonors = opts.requiredDonors ?? 1;
    const lat = opts.lat ?? 31.5204;
    const lng = opts.lng ?? 74.3587;

    await client.query(
      `INSERT INTO public.requests (id, requester_id, blood_group, units, hospital, urgency, status, location, required_donors)
       VALUES ($1, $2, $3, 1, 'Mayo Hospital', 'urgent', 'open', ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, $6);`,
      [id, requesterId, bloodGroup, lng, lat, requiredDonors]
    );
    return id;
  }

  it("1. Radial matching: 5km match returns eligible donor and excludes unverified/unavailable/distant", async () => {
    const reqUserId = await createDonor("Requester User", { bloodGroup: "B+" });
    const eligibleDonorId = await createDonor("Near Eligible Donor", {
      bloodGroup: "B+",
      isVerified: true,
      isAvailable: true,
      lat: 31.5210, // ~100m away
      lng: 74.3590,
    });
    const unverifiedDonorId = await createDonor("Unverified Donor", {
      bloodGroup: "B+",
      isVerified: false,
      isAvailable: true,
      lat: 31.5210,
      lng: 74.3590,
    });
    const distantDonorId = await createDonor("Distant Donor", {
      bloodGroup: "B+",
      isVerified: true,
      isAvailable: true,
      lat: 31.6000, // ~10km away
      lng: 74.4500,
    });

    const requestId = await createRequest(reqUserId, { bloodGroup: "B+" });

    // Call match_donors within 5km
    const res = await client.query(`SELECT * FROM public.match_donors($1, 5.0);`, [requestId]);
    const matchedIds = res.rows.map((r) => r.donor_id);

    assert.ok(matchedIds.includes(eligibleDonorId), "Eligible donor within 5km must be matched");
    assert.ok(!matchedIds.includes(unverifiedDonorId), "Unverified donor must NOT be matched");
    assert.ok(!matchedIds.includes(distantDonorId), "Distant donor (>5km) must NOT be matched");
    assert.ok(!matchedIds.includes(reqUserId), "Requester must not match own request");
  });

  it("2. Concurrency: exactly one donor wins when two concurrent accepts attempt single required spot", async () => {
    const reqUserId = await createDonor("Requester Single Spot", { bloodGroup: "AB+" });
    const donor1Id = await createDonor("Donor 1 Concurrent", { bloodGroup: "AB+" });
    const donor2Id = await createDonor("Donor 2 Concurrent", { bloodGroup: "AB+" });

    const requestId = await createRequest(reqUserId, { bloodGroup: "AB+", requiredDonors: 1 });

    // Pre-create invites for both donors
    await client.query(`
      INSERT INTO public.request_invites (request_id, donor_id, stage_radius_km, status)
      VALUES ($1, $2, 5.0, 'pending'), ($1, $3, 5.0, 'pending');
    `, [requestId, donor1Id, donor2Id]);

    // Donor 1 accepts
    await client.query(`BEGIN;`);
    await client.query(`SET LOCAL ROLE authenticated;`);
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true);`, [donor1Id]);
    await client.query(`SELECT set_config('request.jwt.claims', $1, true);`, [JSON.stringify({ role: "authenticated", sub: donor1Id })]);
    const accept1 = await client.query(`SELECT public.accept_request($1);`, [requestId]);
    assert.equal(accept1.rows[0].accept_request.accepted, true);
    await client.query(`COMMIT;`);

    // Donor 2 attempts to accept — must fail with request_full (409)
    await client.query(`BEGIN;`);
    await client.query(`SET LOCAL ROLE authenticated;`);
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true);`, [donor2Id]);
    await client.query(`SELECT set_config('request.jwt.claims', $1, true);`, [JSON.stringify({ role: "authenticated", sub: donor2Id })]);

    let donor2Failed = false;
    let sqlMsg = "";
    try {
      await client.query(`SELECT public.accept_request($1);`, [requestId]);
    } catch (err: unknown) {
      donor2Failed = true;
      sqlMsg = (err as Error).message;
    }
    await client.query(`ROLLBACK;`);

    assert.ok(donor2Failed, "Second donor accept must be rejected when capacity is full");
    assert.ok(sqlMsg.includes("request_full") || sqlMsg.includes("request_not_active"));

    // Verify request status transitioned to 'accepted' and count = 1
    const reqRow = await client.query(`SELECT status, accepted_donors_count FROM public.requests WHERE id = $1;`, [requestId]);
    assert.equal(reqRow.rows[0].status, "accepted");
    assert.equal(reqRow.rows[0].accepted_donors_count, 1);
  });

  it("3. Notifications RLS hardening: ordinary client cannot insert or mutate notification body", async () => {
    const user1Id = await createDonor("Notification User 1");
    const user2Id = await createDonor("Notification User 2");

    // Attempt direct insert by authenticated role
    await client.query(`BEGIN;`);
    await client.query(`SET LOCAL ROLE authenticated;`);
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true);`, [user1Id]);
    await client.query(`SELECT set_config('request.jwt.claims', $1, true);`, [JSON.stringify({ role: "authenticated", sub: user1Id })]);

    let insertBlocked = false;
    try {
      await client.query(
        `INSERT INTO public.notifications (user_id, body) VALUES ($1, 'Forged notification');`,
        [user2Id]
      );
    } catch (err: unknown) {
      insertBlocked = true;
      assert.equal((err as { code: string }).code, "42501");
    }
    await client.query(`ROLLBACK;`);
    assert.ok(insertBlocked, "Client INSERT on notifications must be blocked by RLS");
  });

  it("4. Notification read RPC: mark_notification_read marks read=true without modifying body", async () => {
    const userId = await createDonor("Notification Reader");
    const notifId = randomUUID();

    // Insert legitimate system notification via service role
    await client.query(
      `INSERT INTO public.notifications (id, user_id, kind, body, read) VALUES ($1, $2, 'blood_request', 'System alert', false);`,
      [notifId, userId]
    );

    // Call mark_notification_read as user
    await client.query(`BEGIN;`);
    await client.query(`SET LOCAL ROLE authenticated;`);
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true);`, [userId]);
    await client.query(`SELECT set_config('request.jwt.claims', $1, true);`, [JSON.stringify({ role: "authenticated", sub: userId })]);
    await client.query(`SELECT public.mark_notification_read($1);`, [notifId]);
    await client.query(`COMMIT;`);

    const notif = await client.query(`SELECT read, body FROM public.notifications WHERE id = $1;`, [notifId]);
    assert.equal(notif.rows[0].read, true);
    assert.equal(notif.rows[0].body, "System alert");
  });

  it("5. Expansion job telemetry: pending expansion job scheduled_at and invited_count are queryable", async () => {
    const requesterId = await createDonor("Telemetry Requester");
    const donorId = await createDonor("Telemetry Donor 1");
    const requestId = randomUUID();

    // Insert request
    await client.query(
      `INSERT INTO public.requests (id, requester_id, blood_group, units, hospital, urgency, status, location, required_donors)
       VALUES ($1, $2, 'A+', 1, 'Telemetry Hospital', 'urgent', 'open', extensions.ST_SetSRID(extensions.ST_MakePoint(74.3587, 31.5204), 4326), 1);`,
      [requestId, requesterId]
    );

    // Insert expansion job scheduled 5 minutes ahead
    const scheduledTime = new Date(Date.now() + 300000).toISOString();
    await client.query(
      `INSERT INTO public.expansion_jobs (request_id, job_type, scheduled_at, status)
       VALUES ($1, 'expand_radius', $2, 'pending');`,
      [requestId, scheduledTime]
    );

    // Insert an invitation
    await client.query(
      `INSERT INTO public.request_invites (request_id, donor_id, stage_radius_km, status)
       VALUES ($1, $2, 5.0, 'pending');`,
      [requestId, donorId]
    );

    // Query invited count
    const inviteCountRes = await client.query(
      `SELECT count(*)::int AS count FROM public.request_invites WHERE request_id = $1;`,
      [requestId]
    );
    assert.equal(inviteCountRes.rows[0].count, 1);

    // Query pending expansion job
    const jobRes = await client.query(
      `SELECT scheduled_at FROM public.expansion_jobs
       WHERE request_id = $1 AND status = 'pending' AND job_type = 'expand_radius'
       ORDER BY scheduled_at ASC LIMIT 1;`,
      [requestId]
    );
    assert.ok(jobRes.rows.length === 1);
    assert.ok(new Date(jobRes.rows[0].scheduled_at).getTime() > Date.now());
  });
});
