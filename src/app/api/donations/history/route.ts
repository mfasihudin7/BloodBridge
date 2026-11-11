import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { apiErr, apiOk } from "@/lib/server/response";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const querySchema = z.object({
  cursor: z
    .string()
    .regex(UUID_RE, { message: "cursor must be a valid UUID." })
    .optional(),
  limit: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? parseInt(v, 10) : 20))
    .pipe(
      z.number().int().min(1, { message: "limit must be at least 1." }).max(50, { message: "limit must be at most 50." })
    ),
});

/**
 * GET /api/donations/history
 * Returns the authenticated donor's confirmed donation history with keyset pagination.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();

    // Auth check
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) {
      return apiErr("UNAUTHENTICATED", "Authentication required.", undefined, 401);
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const rawParams = {
      cursor: searchParams.get("cursor") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    };

    const parseResult = querySchema.safeParse(rawParams);
    if (!parseResult.success) {
      return apiErr(
        "VALIDATION",
        parseResult.error.issues[0]?.message ?? "Invalid query parameters.",
        undefined,
        400
      );
    }

    const { cursor, limit } = parseResult.data;

    // Build query: select from donation_history joined with donation_reports
    // RLS ensures donor_id = auth.uid()
    let query = (supabase as ReturnType<typeof supabase.from> extends never ? never : typeof supabase)
      .from("donation_history" as never)
      .select(
        `
        id,
        donor_id,
        donation_date,
        confirmed_at,
        source,
        report_id,
        donation_reports!inner (
          id,
          request_id,
          outcome,
          feedback,
          status,
          reported_donation_date,
          created_at
        )
      `
      )
      .eq("donor_id" as never, user.id)
      .order("confirmed_at", { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      // Keyset pagination: get the confirmed_at for the cursor row, then filter
      const { data: cursorRow } = await supabase
        .from("donation_history" as never)
        .select("confirmed_at")
        .eq("id", cursor)
        .maybeSingle();

      if (cursorRow) {
        query = query.lt("confirmed_at" as never, (cursorRow as { confirmed_at: string }).confirmed_at);
      }
    }

    const { data, error } = await query;

    if (error) {
      return apiErr("INTERNAL", "Failed to fetch donation history.", undefined, 500);
    }

    const rows = (data ?? []) as unknown[];
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const lastItem = items[items.length - 1] as { id: string } | undefined;
    const next_cursor = hasMore && lastItem ? lastItem.id : null;

    return apiOk({ items, next_cursor }, 200);
  } catch {
    return apiErr("INTERNAL", "An unexpected error occurred.", undefined, 500);
  }
}
