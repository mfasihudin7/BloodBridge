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

    // Check requirement ownership
    const { data: req, error: reqErr } = await supabase
      .from("scheduled_requirements")
      .select("id, requester_id, status")
      .eq("id", id)
      .single();

    if (reqErr || !req) {
      return apiErr("NOT_FOUND", "Scheduled requirement not found.", undefined, 404);
    }

    if (req.requester_id !== user.id) {
      return apiErr("FORBIDDEN", "Only the requester can cancel this requirement.", undefined, 403);
    }

    if (!["open", "partially_filled"].includes(req.status)) {
      return apiErr("CONFLICT", "Requirement is already filled, cancelled or expired.", undefined, 409);
    }

    await supabase
      .from("scheduled_requirements")
      .update({ status: "cancelled" })
      .eq("id", id);

    // Notify circle members
    const { data: circle } = await supabase
      .from("donor_circles")
      .select("id, circle_members (donor_id, status)")
      .eq("requirement_id", id)
      .single();

    if (circle && circle.circle_members) {
      const activeMembers = circle.circle_members.filter((m) =>
        ["invited", "accepted"].includes(m.status)
      );
      if (activeMembers.length > 0) {
        const notifs = activeMembers.map((m) => ({
          user_id: m.donor_id,
          kind: "circle_cancelled",
          type: "request_cancelled",
          title: "Scheduled Requirement Cancelled",
          body: "A scheduled donation requirement you were part of has been cancelled.",
        }));
        await supabase.from("notifications").insert(notifs);
      }
    }

    return apiOk({ cancelled: true });
  } catch {
    return apiErr("INTERNAL", "An unexpected error occurred.", undefined, 500);
  }
}
