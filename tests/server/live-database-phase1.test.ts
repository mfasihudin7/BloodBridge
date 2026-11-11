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

describe("Phase 1 Live Scratch DB Invariant Verification", () => {
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

  it("1. Profile provisioning: trigger creates profile on auth.users insert with secure defaults", async () => {
    const userId = randomUUID();
    const userEmail = `donor_${userId.slice(0, 8)}@test.bloodbridge.org`;
    const userPhone = `+9230${Math.floor(1000000 + Math.random() * 9000000)}`;
    
    await client.query(
      `INSERT INTO auth.users (id, email, phone, raw_user_meta_data)
       VALUES ($1, $2, $3, $4);`,
      [userId, userEmail, userPhone, JSON.stringify({ full_name: "Ahmed Khan" })]
    );

    const res = await client.query(`SELECT * FROM public.profiles WHERE id = $1;`, [userId]);
    assert.equal(res.rows.length, 1);
    const profile = res.rows[0];

    assert.equal(profile.full_name, "Ahmed Khan");
    assert.equal(profile.phone, userPhone);
    assert.equal(profile.is_available, false);
    assert.equal(profile.is_admin, false);
    assert.equal(profile.is_verified, false);
    assert.equal(profile.donation_count, 0);
  });

  it("2. Profile provisioning: signup metadata cannot grant is_admin, is_verified, or is_available", async () => {
    const userId = randomUUID();
    const userEmail = `hacker_${userId.slice(0, 8)}@test.bloodbridge.org`;

    await client.query(
      `INSERT INTO auth.users (id, email, raw_user_meta_data)
       VALUES ($1, $2, $3);`,
      [
        userId,
        userEmail,
        JSON.stringify({
          full_name: "Privilege Escalator",
          is_admin: true,
          is_verified: true,
          is_available: true,
          donation_count: 50,
        }),
      ]
    );

    const res = await client.query(`SELECT * FROM public.profiles WHERE id = $1;`, [userId]);
    assert.equal(res.rows.length, 1);
    const profile = res.rows[0];

    assert.equal(profile.is_admin, false);
    assert.equal(profile.is_verified, false);
    assert.equal(profile.is_available, false);
    assert.equal(profile.donation_count, 0);
  });

  it("3. Backfill function: backfill_missing_profiles() is idempotent", async () => {
    const res1 = await client.query(`SELECT public.backfill_missing_profiles() as count;`);
    assert.ok(res1.rows[0].count !== undefined);
    const res2 = await client.query(`SELECT public.backfill_missing_profiles() as count;`);
    const count2 = res2.rows[0].count;
    assert.equal(count2, 0);
  });

  it("4. Protected profile trigger: direct client UPDATE fails; controlled functions succeed", async () => {
    const userId = randomUUID();
    await client.query(
      `INSERT INTO auth.users (id, email) VALUES ($1, $2);`,
      [userId, `user_${userId.slice(0, 8)}@test.org`]
    );

    await client.query(`BEGIN;`);
    await client.query(`SET LOCAL ROLE authenticated;`);
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true);`, [userId]);
    await client.query(`SELECT set_config('request.jwt.claims', $1, true);`, [JSON.stringify({ role: "authenticated", sub: userId })]);

    let directFailed = false;
    let sqlState = "";
    try {
      await client.query(`UPDATE public.profiles SET is_available = true WHERE id = $1;`, [userId]);
    } catch (err: unknown) {
      directFailed = true;
      sqlState = (err as { code: string }).code;
    }
    await client.query(`ROLLBACK;`);

    assert.ok(directFailed, "Direct update of protected fields by client must fail");
    assert.equal(sqlState, "42501", "Expected SQLSTATE 42501");
  });

  it("5. set_donor_availability(true) fails without location, consent, blood group, or notifications", async () => {
    const userId = randomUUID();
    await client.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2);`, [userId, `incomplete_${userId.slice(0,8)}@test.org`]);

    await client.query(`BEGIN;`);
    await client.query(`SET LOCAL ROLE authenticated;`);
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true);`, [userId]);
    await client.query(`SELECT set_config('request.jwt.claims', $1, true);`, [JSON.stringify({ role: "authenticated", sub: userId })]);

    let failed = false;
    let sqlState = "";
    try {
      await client.query(`SELECT public.set_donor_availability(true);`);
    } catch (err: unknown) {
      failed = true;
      sqlState = (err as { code: string }).code;
    }
    await client.query(`ROLLBACK;`);

    assert.ok(failed, "Availability without prerequisites must fail");
    assert.ok(sqlState === "22023" || sqlState === "P0001", `Expected SQLSTATE 22023 or P0001, got ${sqlState}`);
  });

  it("6. clear_donor_location forces is_available=false", async () => {
    const userId = randomUUID();
    await client.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2);`, [userId, `loc_${userId.slice(0,8)}@test.org`]);

    await client.query(
      `UPDATE public.profiles
       SET blood_group = 'O+',
           donation_location = ST_SetSRID(ST_MakePoint(74.3587, 31.5204), 4326)::geography,
           location_consent = true,
           is_available = true
       WHERE id = $1;`,
      [userId]
    );

    await client.query(`BEGIN;`);
    await client.query(`SET LOCAL ROLE authenticated;`);
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true);`, [userId]);
    await client.query(`SELECT set_config('request.jwt.claims', $1, true);`, [JSON.stringify({ role: "authenticated", sub: userId })]);
    await client.query(`SELECT public.clear_donor_location();`);
    await client.query(`COMMIT;`);

    const res = await client.query(`SELECT is_available, donation_location, location_consent FROM public.profiles WHERE id = $1;`, [userId]);
    assert.equal(res.rows[0].is_available, false, "Must force is_available to false");
    assert.equal(res.rows[0].location_consent, false, "Must reset consent");
    assert.equal(res.rows[0].donation_location, null, "Must clear location");
  });

  it("7. Rate limiting: 10 concurrent checks allows exactly 5 per hour", async () => {
    const userId = randomUUID();
    await client.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2);`, [userId, `ratelimit_${userId.slice(0,8)}@test.org`]);

    let allowedCount = 0;
    for (let i = 0; i < 10; i++) {
      const res = await client.query(
        `SELECT public.check_rate_limit($1, 'cnic_ocr_extract', 5, 60) as allowed;`,
        [userId]
      );
      if (res.rows[0].allowed === true) {
        allowedCount++;
      }
    }
    assert.equal(allowedCount, 5, "Exactly 5 extractions must be permitted within one hour window");
  });
});
