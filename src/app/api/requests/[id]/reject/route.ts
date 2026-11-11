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

    // Check for pending invite
    const { data: invite, error: invErr } = await supabase
      .from("request_invites")
      .select("id")
      .eq("request_id", id)
      .eq("donor_id", user.id)
      .eq("status", "pending")
      .maybeSingle();

    if (invErr || !invite) {
      return apiErr("FORBIDDEN", "No pending invitation found for this request.", undefined, 403);
    }

    // Update invite status to declined
    await supabase
      .from("request_invites")
      .update({ status: "declined" })
      .eq("id", invite.id);

    // Record response
    await supabase
      .from("request_responses")
      .upsert(
        { request_id: id, donor_id: user.id, progress: "declined" },
        { onConflict: "request_id,donor_id" }
      );

    return apiOk({ declined: true });
  } catch {
    return apiErr("INTERNAL", "An unexpected error occurred.", undefined, 500);
  }
}
