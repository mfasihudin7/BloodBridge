import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { apiErr, apiOk } from "@/lib/server/response";

const disputeSchema = z
  .object({
    reason: z.string().min(10, { message: "reason must be at least 10 characters." }),
  })
  .strict();

/**
 * POST /api/donations/[id]/dispute
 * Donor disputes a donation report via RPC.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const parseResult = disputeSchema.safeParse(bodyJson);
    if (!parseResult.success) {
      return apiErr(
        "VALIDATION",
        parseResult.error.issues[0]?.message ?? "Invalid request body.",
        undefined,
        400
      );
    }

    const { reason } = parseResult.data;
    const { id } = await params;

    const { data, error } = await supabase.rpc("dispute_donation_report", {
      p_report_id: id,
      p_reason: reason,
    });

    if (error) {
      const msg = error.message ?? "";
      if (msg.includes("not_authorized")) {
        return apiErr("FORBIDDEN", "You are not authorized to dispute this report.", undefined, 403);
      }
      if (msg.includes("invalid_status")) {
        return apiErr("CONFLICT", "The report cannot be disputed in its current status.", undefined, 409);
      }
      if (msg.includes("not found") || msg.includes("no rows")) {
        return apiErr("NOT_FOUND", "Donation report not found.", undefined, 404);
      }
      return apiErr("INTERNAL", "Failed to dispute donation report.", undefined, 500);
    }

    return apiOk(data, 200);
  } catch {
    return apiErr("INTERNAL", "An unexpected error occurred.", undefined, 500);
  }
}
