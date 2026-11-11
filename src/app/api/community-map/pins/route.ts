import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { apiOk, apiErr } from "@/lib/server/response";


const QuerySchema = z.object({
  min_lat: z.coerce.number().min(-90).max(90),
  min_lng: z.coerce.number().min(-180).max(180),
  max_lat: z.coerce.number().min(-90).max(90),
  max_lng: z.coerce.number().min(-180).max(180),
  status: z.enum(["open", "accepted", "partially_filled", "filled", "fulfilled", "cancelled", "expired", "no_donors_found"]).optional(),
});

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
    const parsed = QuerySchema.safeParse({
      min_lat: searchParams.get("min_lat"),
      min_lng: searchParams.get("min_lng"),
      max_lat: searchParams.get("max_lat"),
      max_lng: searchParams.get("max_lng"),
      status: searchParams.get("status") || undefined,
    });

    if (!parsed.success) {
      return apiErr("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid query parameters.");
    }

    const { min_lat, min_lng, max_lat, max_lng, status } = parsed.data;

    // Enforce max bounding box area to prevent mass scraping (max 1.0 degree^2)
    const latSpan = Math.abs(max_lat - min_lat);
    const lngSpan = Math.abs(max_lng - min_lng);
    if (latSpan * lngSpan > 1.0) {
      return apiErr("VALIDATION", "Bounding box area is too large. Max area is 1.0 square degree.");
    }

    const { data: pins, error } = await supabase.rpc("requests_in_bounds", {
      min_lat,
      min_lng,
      max_lat,
      max_lng,
    });

    if (error) {
      return apiErr("INTERNAL", error.message, undefined, 500);
    }

    let filtered = pins ?? [];
    if (status) {
      filtered = filtered.filter((p) => p.status === status);
    }

    return apiOk(filtered);
  } catch {
    return apiErr("INTERNAL", "An unexpected error occurred.", undefined, 500);
  }
}
