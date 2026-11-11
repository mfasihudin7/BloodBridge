import { createClient } from "@/lib/supabase/server";
import { apiOk, apiErr } from "@/lib/server/response";


export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return apiErr("UNAUTHENTICATED", "Authentication required.", undefined, 401);
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "20", 10), 1), 50);
    const cursor = searchParams.get("cursor");

    let query = supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    const { data: notifications, error } = await query;

    if (error) {
      return apiErr("INTERNAL", "Failed to fetch notifications.", undefined, 500);
    }

    const hasMore = (notifications?.length ?? 0) > limit;
    const items = hasMore ? notifications!.slice(0, limit) : (notifications ?? []);
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].created_at : null;

    // Get unread count
    const { count: unreadCount } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("read", false);

    return apiOk({
      items,
      next_cursor: nextCursor,
      unread_count: unreadCount ?? 0,
    });
  } catch {
    return apiErr("INTERNAL", "An unexpected error occurred.", undefined, 500);
  }
}
