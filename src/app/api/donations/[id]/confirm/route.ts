import { createClient } from "@/lib/supabase/server";
import { apiErr, apiOk } from "@/lib/server/response";

/**
 * POST /api/donations/[id]/confirm
 * Donor confirms a donation report via RPC.
 */
export async function POST(
  _request: Request,
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

    const { id } = await params;

    const { data, error } = await supabase.rpc("confirm_donation_report", {
      p_report_id: id,
    });

    if (error) {
      const msg = error.message ?? "";
      if (msg.includes("not_authorized")) {
        return apiErr("FORBIDDEN", "You are not authorized to confirm this report.", undefined, 403);
      }
      if (msg.includes("invalid_status")) {
        return apiErr("CONFLICT", "The report is not in a confirmable status.", undefined, 409);
      }
      if (msg.includes("not found") || msg.includes("no rows")) {
        return apiErr("NOT_FOUND", "Donation report not found.", undefined, 404);
      }
      return apiErr("INTERNAL", "Failed to confirm donation report.", undefined, 500);
    }

    return apiOk(data, 200);
  } catch {
    return apiErr("INTERNAL", "An unexpected error occurred.", undefined, 500);
  }
}
