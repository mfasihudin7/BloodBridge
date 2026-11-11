import { createClient } from "@/lib/supabase/server";
import { apiOk, apiErr } from "@/lib/server/response";


export async function GET(
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

    // Fetch request
    const { data: bloodRequest, error: reqErr } = await supabase
      .from("requests")
      .select("*")
      .eq("id", id)
      .single();

    if (reqErr || !bloodRequest) {
      return apiErr("NOT_FOUND", "Request not found.", undefined, 404);
    }

    const isRequester = bloodRequest.requester_id === user.id;

    // If not requester, verify access via invite or response
    if (!isRequester) {
      const { data: invite } = await supabase
        .from("request_invites")
        .select("id")
        .eq("request_id", id)
        .eq("donor_id", user.id)
        .maybeSingle();

      const { data: response } = await supabase
        .from("request_responses")
        .select("id")
        .eq("request_id", id)
        .eq("donor_id", user.id)
        .maybeSingle();

      if (!invite && !response) {
        return apiErr("FORBIDDEN", "You are not authorized to view this request.", undefined, 403);
      }
    }

    // If requester, also fetch accepted donors
    let acceptedDonors = null;
    if (isRequester) {
      const { data: responses } = await supabase
        .from("request_responses")
        .select(`
          donor_id,
          progress,
          profiles:donor_id (
            full_name
          )
        `)
        .eq("request_id", id)
        .in("progress", ["accepted", "en_route", "arrived", "donated"]);

      acceptedDonors = (responses ?? []).map((r) => ({
        donor_id: r.donor_id,
        progress: r.progress,
        full_name: (r.profiles as unknown as { full_name: string } | null)?.full_name ?? "Anonymous Donor",
      }));
    }

    // Query accurate count of invited donors
    const { count: invitedCount } = await supabase
      .from("request_invites")
      .select("*", { count: "exact", head: true })
      .eq("request_id", id);

    // Query authoritative next radius expansion timestamp from expansion_jobs
    const { data: nextJob } = await supabase
      .from("expansion_jobs")
      .select("scheduled_at")
      .eq("request_id", id)
      .eq("status", "pending")
      .eq("job_type", "expand_radius")
      .order("scheduled_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    return apiOk({
      request: bloodRequest,
      is_requester: isRequester,
      accepted_donors: acceptedDonors,
      invited_count: invitedCount ?? 0,
      next_expansion_at: nextJob?.scheduled_at ?? null,
    });
  } catch {
    return apiErr("INTERNAL", "An unexpected error occurred.", undefined, 500);
  }
}
