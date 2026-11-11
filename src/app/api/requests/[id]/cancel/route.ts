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

    // Check request ownership
    const { data: bloodReq, error: reqErr } = await supabase
      .from("requests")
      .select("id, requester_id, status")
      .eq("id", id)
      .single();

    if (reqErr || !bloodReq) {
      return apiErr("NOT_FOUND", "Request not found.", undefined, 404);
    }

    if (bloodReq.requester_id !== user.id) {
      return apiErr("FORBIDDEN", "Only the requester can cancel this request.", undefined, 403);
    }

    if (!["open", "accepted", "partially_filled"].includes(bloodReq.status)) {
      return apiErr("CONFLICT", "Request is already in a terminal state.", undefined, 409);
    }

    // Cancel request
    await supabase
      .from("requests")
      .update({
        status: "cancelled",
        terminal_reason: "requester_cancelled",
      })
      .eq("id", id);

    // Cancel pending expansion jobs
    await supabase
      .from("expansion_jobs")
      .update({ status: "completed" })
      .eq("request_id", id)
      .eq("status", "pending");

    // Notify any accepted donors
    const { data: activeDonors } = await supabase
      .from("request_responses")
      .select("donor_id")
      .eq("request_id", id)
      .in("progress", ["accepted", "en_route", "arrived"]);

    if (activeDonors && activeDonors.length > 0) {
      const notifs = activeDonors.map((d) => ({
        user_id: d.donor_id,
        kind: "request_cancelled",
        type: "request_cancelled",
        title: "Request Cancelled",
        body: "A blood request you accepted has been cancelled by the requester.",
        request_id: id,
      }));
      await supabase.from("notifications").insert(notifs);
    }

    return apiOk({ cancelled: true });
  } catch {
    return apiErr("INTERNAL", "An unexpected error occurred.", undefined, 500);
  }
}
