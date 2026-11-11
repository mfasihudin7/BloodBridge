import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { apiOk, apiErr } from "@/lib/server/response";


const StatusSchema = z.object({
  status: z.enum(["fulfilled", "cancelled"], {
    message: "Invalid status value. Allowed: fulfilled, cancelled.",
  }),
});

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

    const body = await request.json().catch(() => null);
    const parsed = StatusSchema.safeParse(body);
    if (!parsed.success) {
      return apiErr("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid request body.");
    }

    const { status } = parsed.data;

    // Verify requester ownership
    const { data: bloodReq, error: reqErr } = await supabase
      .from("requests")
      .select("id, requester_id, status")
      .eq("id", id)
      .single();

    if (reqErr || !bloodReq) {
      return apiErr("NOT_FOUND", "Request not found.", undefined, 404);
    }

    if (bloodReq.requester_id !== user.id) {
      return apiErr("FORBIDDEN", "Only the requester can update this request's status.", undefined, 403);
    }

    if (!["open", "accepted", "partially_filled"].includes(bloodReq.status)) {
      return apiErr("CONFLICT", "Request is already in a terminal state.", undefined, 409);
    }

    await supabase
      .from("requests")
      .update({
        status,
        ...(status === "cancelled" ? { terminal_reason: "requester_cancelled" } : {}),
      })
      .eq("id", id);

    // Cancel pending expansion jobs
    await supabase
      .from("expansion_jobs")
      .update({ status: "completed" })
      .eq("request_id", id)
      .eq("status", "pending");

    return apiOk({ status });
  } catch {
    return apiErr("INTERNAL", "An unexpected error occurred.", undefined, 500);
  }
}
