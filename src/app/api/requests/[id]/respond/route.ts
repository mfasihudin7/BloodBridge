import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { apiOk, apiErr } from "@/lib/server/response";

const RespondSchema = z.object({
  action: z.enum(["accept", "decline"], {
    message: "Action must be either 'accept' or 'decline'.",
  }),
});

/**
 * POST /api/requests/[id]/respond
 * Unified invitation response endpoint.
 * Dispatches to accept_request RPC or marks request_invites rejected.
 */
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

    let bodyJson: unknown;
    try {
      bodyJson = await request.json();
    } catch {
      return apiErr("VALIDATION", "Invalid JSON body.", undefined, 400);
    }

    const parseResult = RespondSchema.safeParse(bodyJson);
    if (!parseResult.success) {
      return apiErr(
        "VALIDATION",
        parseResult.error.issues[0]?.message ?? "Invalid body",
        undefined,
        400
      );
    }

    const { action } = parseResult.data;

    if (action === "accept") {
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

      return apiOk(data, 200);
    } else {
      // decline
      const { error } = await supabase
        .from("request_invites")
        .update({ status: "declined" as const })
        .eq("request_id", id)
        .eq("donor_id", user.id);

      if (error) {
        return apiErr("INTERNAL", "Failed to decline invitation.", undefined, 500);
      }

      return apiOk({ declined: true }, 200);
    }
  } catch {
    return apiErr("INTERNAL", "An unexpected error occurred.", undefined, 500);
  }
}
