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

    const { error } = await supabase.rpc("mark_notification_read", {
      p_notification_id: id,
    });

    if (error) {
      return apiErr("INTERNAL", error.message, undefined, 500);
    }

    return apiOk({ read: true });
  } catch {
    return apiErr("INTERNAL", "An unexpected error occurred.", undefined, 500);
  }
}
