import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { apiErr, apiOk } from "@/lib/server/response";

const bloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;
const urgencyValues = ["critical", "urgent", "planned"] as const;

const createRequestSchema = z.object({
  blood_group: z.enum(bloodGroups),
  units: z.number().int().min(1).max(10),
  hospital: z.string().min(1).max(255),
  urgency: z.enum(urgencyValues),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  note: z.string().max(1000).optional(),
  required_donors: z.number().int().min(1).max(5).default(1),
  expires_at: z.string().datetime().optional(),
});

/**
 * POST /api/requests
 * Create a new blood request.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return apiErr("UNAUTHENTICATED", "Authentication required", undefined, 401);
    }

    let bodyJson: unknown;
    try {
      bodyJson = await request.json();
    } catch {
      return apiErr("VALIDATION", "Invalid JSON body", undefined, 400);
    }

    const parseResult = createRequestSchema.safeParse(bodyJson);
    if (!parseResult.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parseResult.error.issues) {
        fieldErrors[issue.path.join(".")] = issue.message;
      }
      return apiErr("VALIDATION", "Invalid request parameters.", fieldErrors, 400);
    }

    const body = parseResult.data;

    // Rate limit: 3 per hour per user
    const { data: rateLimitOk, error: rateLimitErr } = await supabase.rpc(
      "check_rate_limit",
      {
        p_user_id: user.id,
        p_action: "create_request",
        p_max: 3,
        p_window_minutes: 60,
      }
    );

    if (rateLimitErr) {
      return apiErr("INTERNAL", "Failed to check rate limit.", undefined, 500);
    }

    if (!rateLimitOk) {
      return apiErr(
        "RATE_LIMITED",
        "You can only create 3 blood requests per hour.",
        undefined,
        429
      );
    }

    // Insert into requests
    const { data: newRequest, error: insertErr } = await supabase
      .from("requests")
      .insert({
        requester_id: user.id,
        blood_group: body.blood_group as "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-",
        units: body.units,
        hospital: body.hospital,
        urgency: body.urgency as "critical" | "urgent" | "planned",
        status: "open",
        location: `SRID=4326;POINT(${body.location.lng} ${body.location.lat})` as unknown,
        note: body.note ?? null,
        required_donors: body.required_donors,
        expires_at: body.expires_at ?? null,
      })
      .select("id, expires_at")
      .single();

    if (insertErr || !newRequest) {
      return apiErr("INTERNAL", insertErr?.message ?? "Failed to create request.", undefined, 500);
    }

    const requestId = newRequest.id;
    const expiresAt = newRequest.expires_at;

    // Find matching donors
    const { data: donors, error: matchErr } = await supabase.rpc("match_donors", {
      p_request_id: requestId,
      p_radius_km: 5,
    });

    if (matchErr) {
      console.error("match_donors error:", matchErr);
    }

    let invitedCount = 0;
    if (donors && donors.length > 0) {
      invitedCount = donors.length;

      // Bulk insert request_invites
      const inviteRows = donors.map((d: { donor_id: string; distance_km?: number }) => ({
        request_id: requestId,
        donor_id: d.donor_id,
        stage_radius_km: 5.0,
        status: "pending" as const,
      }));

      const { error: inviteErr } = await supabase.from("request_invites").insert(inviteRows);
      if (inviteErr) {
        console.error("Failed to insert request_invites:", inviteErr);
      }

      // Bulk insert notifications for each donor
      const notifRows = donors.map((d: { donor_id: string }) => ({
        user_id: d.donor_id,
        kind: "blood_request",
        type: "blood_request",
        body: "There is an urgent blood request near you.",
        request_id: requestId,
      }));

      const { error: notifErr } = await supabase.from("notifications").insert(notifRows);
      if (notifErr) {
        console.error("Failed to insert donor notifications:", notifErr);
      }
    }

    // Insert expansion job: expand_radius
    const { error: expandJobErr } = await supabase.from("expansion_jobs").insert({
      request_id: requestId,
      job_type: "expand_radius",
      scheduled_at: new Date(Date.now() + 300 * 1000).toISOString(),
      status: "pending",
    });
    if (expandJobErr) {
      console.error("Failed to insert expand_radius job:", expandJobErr);
    }

    // Insert expansion job: expire_request
    if (expiresAt) {
      const { error: expireJobErr } = await supabase.from("expansion_jobs").insert({
        request_id: requestId,
        job_type: "expire_request",
        scheduled_at: expiresAt,
        status: "pending",
      });
      if (expireJobErr) {
        console.error("Failed to insert expire_request job:", expireJobErr);
      }
    }

    return apiOk({ id: requestId, invited_count: invitedCount }, 201);
  } catch {
    return apiErr("INTERNAL", "An unexpected error occurred.", undefined, 500);
  }
}
