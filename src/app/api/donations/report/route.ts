import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { apiErr, apiOk } from "@/lib/server/response";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const reportSchema = z
  .object({
    request_id: z.string().uuid({ message: "request_id must be a valid UUID." }),
    donor_id: z.string().uuid({ message: "donor_id must be a valid UUID." }),
    outcome: z.enum(["donated", "not_donated"], {
      message: "outcome must be 'donated' or 'not_donated'.",
    }),
    reported_donation_date: z
      .string()
      .regex(ISO_DATE_RE, { message: "reported_donation_date must be a valid ISO date (YYYY-MM-DD)." }),
    feedback: z.string().optional(),
  })
  .strict();

/**
 * POST /api/donations/report
 * Recipient submits a donation outcome report for a donor on a request.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // Auth check
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) {
      return apiErr("UNAUTHENTICATED", "Authentication required.", undefined, 401);
    }

    // Parse body
    let bodyJson: unknown;
    try {
      bodyJson = await request.json();
    } catch {
      return apiErr("VALIDATION", "Invalid JSON body.", undefined, 400);
    }

    const parseResult = reportSchema.safeParse(bodyJson);
    if (!parseResult.success) {
      return apiErr(
        "VALIDATION",
        parseResult.error.issues[0]?.message ?? "Invalid request body.",
        undefined,
        400
      );
    }

    const { request_id, donor_id, outcome, reported_donation_date, feedback } = parseResult.data;

    // Verify request exists and authenticated user is the requester
    const { data: req, error: reqErr } = await supabase
      .from("requests")
      .select("id, requester_id")
      .eq("id", request_id)
      .maybeSingle();

    if (reqErr || !req) {
      return apiErr("NOT_FOUND", "Blood request not found.", undefined, 404);
    }

    if (req.requester_id !== user.id) {
      return apiErr("FORBIDDEN", "Only the requester can submit a donation report.", undefined, 403);
    }

    // Verify donor has an accepted/active response for this request
    const { data: response, error: respErr } = await supabase
      .from("request_responses")
      .select("id")
      .eq("request_id", request_id)
      .eq("donor_id", donor_id)
      .not("progress", "in", '("declined","withdrawn")')
      .maybeSingle();

    if (respErr || !response) {
      return apiErr(
        "VALIDATION",
        "No active response found for this donor on this request.",
        undefined,
        400
      );
    }

    // Check for duplicate report (409 Conflict)
    const { data: existing, error: existErr } = await supabase
      .from("donation_reports" as never)
      .select("id")
      .eq("request_id", request_id)
      .eq("donor_id", donor_id)
      .maybeSingle();

    if (existErr) {
      return apiErr("INTERNAL", "Failed to check for existing report.", undefined, 500);
    }
    if (existing) {
      return apiErr("CONFLICT", "A donation report already exists for this request and donor.", undefined, 409);
    }

    // Insert donation report
    const { data: report, error: insertErr } = await supabase
      .from("donation_reports")
      .insert({
        request_id,
        donor_id,
        recipient_id: user.id,
        outcome,
        reported_donation_date,
        ...(feedback ? { feedback } : {}),
      })
      .select("id")
      .single();

    if (insertErr || !report) {
      return apiErr("INTERNAL", "Failed to create donation report.", undefined, 500);
    }

    // Insert notification for the donor
    await supabase.from("notifications").insert({
      user_id: donor_id,
      kind: "donation_report",
      request_id,
      body: "A donation report has been submitted for your donation.",
    });

    return apiOk({ id: (report as { id: string }).id }, 201);
  } catch {
    return apiErr("INTERNAL", "An unexpected error occurred.", undefined, 500);
  }
}
