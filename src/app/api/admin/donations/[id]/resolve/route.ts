import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { apiOk, apiErr } from "@/lib/server/response";
import { verifyAdmin } from "@/lib/server/verification";

const ResolveSchema = z.object({
  resolution: z.enum(["confirmed", "rejected"], {
    message: "Resolution must be either 'confirmed' or 'rejected'.",
  }),
  note: z.string().min(5, { message: "Resolution note must be at least 5 characters." }),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: reportId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return apiErr("UNAUTHENTICATED", "Authentication required.", undefined, 401);
    }

    const isAdmin = await verifyAdmin(user.id);
    if (!isAdmin) {
      return apiErr("FORBIDDEN", "Administrator privileges required.", undefined, 403);
    }

    const body = await request.json().catch(() => null);
    const parsed = ResolveSchema.safeParse(body);
    if (!parsed.success) {
      return apiErr("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid body.");
    }

    const { resolution, note } = parsed.data;

    const { data, error } = await supabase.rpc("admin_resolve_report", {
      p_report_id: reportId,
      p_resolution: resolution,
      p_note: note,
    });

    if (error) {
      const msg = error.message;
      if (msg.includes("not_authorized")) return apiErr("FORBIDDEN", msg, undefined, 403);
      if (msg.includes("not_found")) return apiErr("NOT_FOUND", "Donation report not found.", undefined, 404);
      if (msg.includes("invalid_status")) return apiErr("CONFLICT", msg, undefined, 409);
      return apiErr("INTERNAL", msg, undefined, 500);
    }

    return apiOk(data);
  } catch {
    return apiErr("INTERNAL", "An unexpected error occurred.", undefined, 500);
  }
}

