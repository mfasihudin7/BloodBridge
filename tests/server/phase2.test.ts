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

describe("Phase 2 Live Scratch DB Invariant Verification", () => {
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

  async function createTestUser(name: string, isAdmin = false) {
    const id = randomUUID();
    const email = `test_${id.slice(0, 8)}@bloodbridge.org`;
    await client.query(
      `INSERT INTO auth.users (id, email) VALUES ($1, $2);`,
      [id, email]
    );
    await client.query(
      `UPDATE public.profiles SET full_name = $1, is_admin = $2 WHERE id = $3;`,
      [name, isAdmin, id]
    );
    return id;
  }

  async function createTestRequest(requesterId: string) {
    const id = randomUUID();
    await client.query(
      `INSERT INTO public.requests (id, requester_id, blood_group, units, hospital, urgency, status, location)
       VALUES ($1, $2, 'A+', 1, 'Lahore General Hospital', 'urgent', 'open', ST_SetSRID(ST_MakePoint(74.3587, 31.5204), 4326)::geography);`,
      [id, requesterId]
    );
    return id;
  }

  it("1. Donation report creation and confirmation: increments donation_count and updates last_donated", async () => {
    const recipientId = await createTestUser("Recipient 1");
    const donorId = await createTestUser("Donor 1");
    const requestId = await createTestRequest(recipientId);

    // Create report
    const reportId = randomUUID();
    await client.query(
      `INSERT INTO public.donation_reports (id, request_id, donor_id, recipient_id, outcome, reported_donation_date, status)
       VALUES ($1, $2, $3, $4, 'donated', CURRENT_DATE, 'awaiting_donor_confirmation');`,
      [reportId, requestId, donorId, recipientId]
    );

    // Call confirm_donation_report as donor
    await client.query(`BEGIN;`);
    await client.query(`SET LOCAL ROLE authenticated;`);
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true);`, [donorId]);
    await client.query(`SELECT set_config('request.jwt.claims', $1, true);`, [JSON.stringify({ role: "authenticated", sub: donorId })]);

    const confirmRes = await client.query(`SELECT public.confirm_donation_report($1);`, [reportId]);
    assert.equal(confirmRes.rows[0].confirm_donation_report.confirmed, true);
    await client.query(`COMMIT;`);

    // Verify donation_count incremented and last_donated updated
    const donorProf = await client.query(`SELECT donation_count, last_donated FROM public.profiles WHERE id = $1;`, [donorId]);
    assert.equal(donorProf.rows[0].donation_count, 1);
    assert.ok(donorProf.rows[0].last_donated !== null);

    // Verify donation_history record created
    const history = await client.query(`SELECT * FROM public.donation_history WHERE report_id = $1;`, [reportId]);
    assert.equal(history.rows.length, 1);
    assert.equal(history.rows[0].source, "donor_confirmed");
  });

  it("2. Concurrency: double confirm increments donation_count exactly once (idempotent)", async () => {
    const recipientId = await createTestUser("Recipient 2");
    const donorId = await createTestUser("Donor 2");
    const requestId = await createTestRequest(recipientId);

    const reportId = randomUUID();
    await client.query(
      `INSERT INTO public.donation_reports (id, request_id, donor_id, recipient_id, outcome, reported_donation_date, status)
       VALUES ($1, $2, $3, $4, 'donated', CURRENT_DATE, 'awaiting_donor_confirmation');`,
      [reportId, requestId, donorId, recipientId]
    );

    // First confirmation
    await client.query(`BEGIN;`);
    await client.query(`SET LOCAL ROLE authenticated;`);
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true);`, [donorId]);
    await client.query(`SELECT set_config('request.jwt.claims', $1, true);`, [JSON.stringify({ role: "authenticated", sub: donorId })]);
    await client.query(`SELECT public.confirm_donation_report($1);`, [reportId]);
    await client.query(`COMMIT;`);

    // Second confirmation attempt must fail with invalid_status
    await client.query(`BEGIN;`);
    await client.query(`SET LOCAL ROLE authenticated;`);
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true);`, [donorId]);
    await client.query(`SELECT set_config('request.jwt.claims', $1, true);`, [JSON.stringify({ role: "authenticated", sub: donorId })]);

    let doubleConfirmFailed = false;
    try {
      await client.query(`SELECT public.confirm_donation_report($1);`, [reportId]);
    } catch (err: unknown) {
      doubleConfirmFailed = true;
      const msg = (err as Error).message;
      assert.ok(msg.includes("invalid_status") || (err as { code: string }).code === "P0001");
    }
    await client.query(`ROLLBACK;`);
    assert.ok(doubleConfirmFailed, "Second confirmation must be rejected");

    // Profile donation count must strictly remain 1
    const donorProf = await client.query(`SELECT donation_count FROM public.profiles WHERE id = $1;`, [donorId]);
    assert.equal(donorProf.rows[0].donation_count, 1, "donation_count must only increment once");
  });

  it("3. Dispute: donor can dispute report with reason", async () => {
    const recipientId = await createTestUser("Recipient 3");
    const donorId = await createTestUser("Donor 3");
    const requestId = await createTestRequest(recipientId);

    const reportId = randomUUID();
    await client.query(
      `INSERT INTO public.donation_reports (id, request_id, donor_id, recipient_id, outcome, reported_donation_date, status)
       VALUES ($1, $2, $3, $4, 'donated', CURRENT_DATE, 'awaiting_donor_confirmation');`,
      [reportId, requestId, donorId, recipientId]
    );

    await client.query(`BEGIN;`);
    await client.query(`SET LOCAL ROLE authenticated;`);
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true);`, [donorId]);
    await client.query(`SELECT set_config('request.jwt.claims', $1, true);`, [JSON.stringify({ role: "authenticated", sub: donorId })]);

    const disputeRes = await client.query(
      `SELECT public.dispute_donation_report($1, 'I was unable to attend due to illness.');`,
      [reportId]
    );
    assert.equal(disputeRes.rows[0].dispute_donation_report.disputed, true);
    await client.query(`COMMIT;`);

    const report = await client.query(`SELECT status, dispute_reason FROM public.donation_reports WHERE id = $1;`, [reportId]);
    assert.equal(report.rows[0].status, "disputed");
    assert.equal(report.rows[0].dispute_reason, "I was unable to attend due to illness.");
  });

  it("4. Admin resolution: admin can resolve disputed report to confirmed", async () => {
    const recipientId = await createTestUser("Recipient 4");
    const donorId = await createTestUser("Donor 4");
    const adminId = await createTestUser("Admin 4", true);
    const requestId = await createTestRequest(recipientId);

    const reportId = randomUUID();
    await client.query(
      `INSERT INTO public.donation_reports (id, request_id, donor_id, recipient_id, outcome, reported_donation_date, status)
       VALUES ($1, $2, $3, $4, 'donated', CURRENT_DATE, 'disputed');`,
      [reportId, requestId, donorId, recipientId]
    );

    // Resolve as admin
    await client.query(`BEGIN;`);
    await client.query(`SET LOCAL ROLE authenticated;`);
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true);`, [adminId]);
    await client.query(`SELECT set_config('request.jwt.claims', $1, true);`, [JSON.stringify({ role: "authenticated", sub: adminId })]);

    const resolveRes = await client.query(
      `SELECT public.admin_resolve_report($1, 'confirmed', 'Hospital blood slip verified.');`,
      [reportId]
    );
    assert.equal(resolveRes.rows[0].admin_resolve_report.resolved, true);
    await client.query(`COMMIT;`);

    const report = await client.query(`SELECT status, resolution_note, resolved_by FROM public.donation_reports WHERE id = $1;`, [reportId]);
    assert.equal(report.rows[0].status, "resolved_confirmed");
    assert.equal(report.rows[0].resolved_by, adminId);

    const donorProf = await client.query(`SELECT donation_count FROM public.profiles WHERE id = $1;`, [donorId]);
    assert.equal(donorProf.rows[0].donation_count, 1);
  });
});
