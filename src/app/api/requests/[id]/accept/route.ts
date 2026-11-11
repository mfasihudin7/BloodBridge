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

    const { data, error } = await supabase.rpc("accept_request", {
      p_request_id: id,
    });

    if (error) {
      const msg = error.message;
      if (msg.includes("not_authorized") || msg.includes("donor_not_verified") || msg.includes("donor_not_available")) {
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
