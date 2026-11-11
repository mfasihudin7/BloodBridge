import { createClient } from "@/lib/supabase/server";
import { apiOk, apiErr } from "@/lib/server/response";


export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return apiErr("UNAUTHENTICATED", "Authentication required.", undefined, 401);
    }

    // 1. Pending invitations
    const { data: invitations, error: invErr } = await supabase
      .from("request_invites")
      .select(`
        id,
        stage_radius_km,
        invited_at,
        status,
        requests:request_id (
          id,
          blood_group,
          units,
          hospital,
          urgency,
          status,
          note,
          expires_at,
          requester_id,
          profiles:requester_id (
            full_name
          )
        )
      `)
      .eq("donor_id", user.id)
      .eq("status", "pending")
      .order("invited_at", { ascending: false });

    if (invErr) {
      return apiErr("INTERNAL", "Failed to fetch invitations.", undefined, 500);
    }

    // 2. Active commitments (accepted, en_route, arrived)
    const { data: commitments, error: commErr } = await supabase
      .from("request_responses")
      .select(`
        id,
        progress,
        requests:request_id (
          id,
          blood_group,
          units,
          hospital,
          urgency,
          status,
          note,
          expires_at,
          requester_id,
          profiles:requester_id (
            full_name
          )
        )
      `)
      .eq("donor_id", user.id)
      .in("progress", ["accepted", "en_route", "arrived"]);

    if (commErr) {
      return apiErr("INTERNAL", "Failed to fetch active commitments.", undefined, 500);
    }

    return apiOk({
      invitations: invitations ?? [],
      active_commitments: commitments ?? [],
    });
  } catch {
    return apiErr("INTERNAL", "An unexpected error occurred.", undefined, 500);
  }
}
