import { createClient } from "@/lib/supabase/server";
import { apiOk, apiErr } from "@/lib/server/response";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return apiErr("UNAUTHENTICATED", "Authentication required.", undefined, 401);
    }

    // Rate limit: 10 map responses per hour per user
    const { data: allowed, error: rateErr } = await supabase.rpc("check_rate_limit", {
      p_user_id: user.id,
      p_action: "map_respond",
      p_max: 10,
      p_window_minutes: 60,
    });

    if (rateErr || allowed === false) {
      return apiErr("RATE_LIMITED", "Too many map pin responses. Please try again later.", undefined, 429);
    }

    // 1. Unified SQL function checks eligibility, radius (ST_DWithin), conflicts, and creates invite
    const { data: eligibility, error: eligErr } = await supabase.rpc(
      "check_map_pin_respond_eligibility",
      {
        p_request_id: id,
        p_donor_id: user.id,
        p_max_radius_km: 50.0,
      }
    );

    if (eligErr) {
      return apiErr("INTERNAL", eligErr.message, undefined, 500);
    }

    const eligResult = eligibility as unknown as {
      eligible: boolean;
      reason?: string;
      code?: number;
      distance_km?: number;
    };

    if (!eligResult.eligible) {
      const statusCode = eligResult.code || 403;
      const code = statusCode === 404 ? "NOT_FOUND" : statusCode === 409 ? "CONFLICT" : "FORBIDDEN";
      return apiErr(code, `Eligibility check failed: ${eligResult.reason}`, undefined, statusCode);
    }

    // 2. Call accept_request RPC
    const { data, error } = await supabase.rpc("accept_request", {
      p_request_id: id,
    });

    if (error) {
      const msg = error.message;
      if (msg.includes("not_authorized") || msg.includes("donor_not_available")) {
        return apiErr("FORBIDDEN", msg, undefined, 403);
      }
      if (msg.includes("not_found")) {
        return apiErr("NOT_FOUND", "Request not found.", undefined, 404);
      }
      if (msg.includes("request_full") || msg.includes("request_not_active") || msg.includes("conflicting_commitment")) {
        return apiErr("CONFLICT", msg, undefined, 409);
      }
      return apiErr("INTERNAL", msg, undefined, 500);
    }

    return apiOk(data);
  } catch {
    return apiErr("INTERNAL", "An unexpected error occurred.", undefined, 500);
  }
}
