import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { apiOk, apiErr } from "@/lib/server/response";


const RespondSchema = z.object({
  action: z.enum(["accept", "decline"], {
    message: "Action must be either 'accept' or 'decline'.",
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
    const parsed = RespondSchema.safeParse(body);
    if (!parsed.success) {
      return apiErr("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid body.");
    }

    // Find circle_id for this requirement
    const { data: circle, error: circleErr } = await supabase
      .from("donor_circles")
      .select("id")
      .eq("requirement_id", id)
      .single();

    if (circleErr || !circle) {
      return apiErr("NOT_FOUND", "Donor circle not found for this requirement.", undefined, 404);
    }

    if (parsed.data.action === "accept") {
      const { data, error } = await supabase.rpc("accept_circle_invitation", {
        p_circle_id: circle.id,
      });

      if (error) {
        const msg = error.message;
        if (msg.includes("not_authorized")) return apiErr("FORBIDDEN", msg, undefined, 403);
        if (msg.includes("already_responded") || msg.includes("schedule_conflict") || msg.includes("requirement_not_active")) {
          return apiErr("CONFLICT", msg, undefined, 409);
        }
        return apiErr("INTERNAL", msg, undefined, 500);
      }

      return apiOk(data);
    } else {
      const { data, error } = await supabase.rpc("decline_circle_invitation", {
        p_circle_id: circle.id,
      });

      if (error) {
        const msg = error.message;
        if (msg.includes("not_authorized")) return apiErr("FORBIDDEN", msg, undefined, 403);
        if (msg.includes("already_responded")) return apiErr("CONFLICT", msg, undefined, 409);
        return apiErr("INTERNAL", msg, undefined, 500);
      }

      return apiOk(data);
    }
  } catch {
    return apiErr("INTERNAL", "An unexpected error occurred.", undefined, 500);
  }
}
