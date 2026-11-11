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

    // Check that caller is an active accepted donor
    const { data: response, error: respErr } = await supabase
      .from("request_responses")
      .select("id, progress")
      .eq("request_id", id)
      .eq("donor_id", user.id)
      .maybeSingle();

    if (respErr || !response || ["declined", "withdrawn"].includes(response.progress)) {
      return apiErr("FORBIDDEN", "You are not an active donor on this request.", undefined, 403);
    }

    // Withdraw progress
    await supabase
      .from("request_responses")
      .update({ progress: "withdrawn" })
      .eq("id", response.id);

    // Update request count and reopen if needed
    const { data: req } = await supabase
      .from("requests")
      .select("requester_id, accepted_donors_count, required_donors, status")
      .eq("id", id)
      .single();

    if (req) {
      const newCount = Math.max(0, req.accepted_donors_count - 1);
      const newStatus =
        req.status === "accepted" && newCount < req.required_donors
          ? newCount > 0
            ? "partially_filled"
            : "open"
          : req.status;

      await supabase
        .from("requests")
        .update({
          accepted_donors_count: newCount,
          status: newStatus,
        })
        .eq("id", id);

      // Notify requester if still linked
      if (req.requester_id) {
        await supabase.from("notifications").insert({
          user_id: req.requester_id,
          kind: "donor_withdrawn",
          type: "request_cancelled",
          title: "Donor Withdrawn",
          body: "A donor has withdrawn their commitment to your blood request.",
          request_id: id,
        });
      }
    }

    return apiOk({ withdrawn: true });
  } catch {
    return apiErr("INTERNAL", "An unexpected error occurred.", undefined, 500);
  }
}
