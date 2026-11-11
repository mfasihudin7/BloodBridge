import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { apiErr, apiOk } from "@/lib/server/response";

const locationSchema = z
  .object({
    lat: z.number().min(-90).max(90, "Latitude must be between -90 and 90."),
    lng: z.number().min(-180).max(180, "Longitude must be between -180 and 180."),
    consent: z.literal(true, { message: "Explicit location consent is required." }),
  })
  .strict();

/**
 * PUT /api/donor/location
 * Sets the donor's current donation location with explicit consent.
 */
export async function PUT(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return apiErr("UNAUTHENTICATED", "Authentication required", undefined, 401);
    }

    let bodyJson: unknown;
    try {
      bodyJson = await request.json();
    } catch {
      return apiErr("VALIDATION", "Invalid JSON body", undefined, 400);
    }

    const parseResult = locationSchema.safeParse(bodyJson);
    if (!parseResult.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parseResult.error.issues) {
        fieldErrors[issue.path.join(".")] = issue.message;
      }
      return apiErr("VALIDATION", "Invalid location parameters.", fieldErrors, 400);
    }

    const { lat, lng, consent } = parseResult.data;

    const { data, error } = await supabase.rpc("set_donor_location", {
      p_lat: lat,
      p_lng: lng,
      p_consent: consent,
    });

    if (error) {
      return apiErr("INTERNAL", error.message || "Failed to update donor location.", undefined, 500);
    }

    return apiOk(data, 200);
  } catch {
    return apiErr("INTERNAL", "An unexpected error occurred.", undefined, 500);
  }
}

/**
 * DELETE /api/donor/location
 * Clears the donor's donation location, revokes consent, and forces availability OFF.
 */
export async function DELETE() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return apiErr("UNAUTHENTICATED", "Authentication required", undefined, 401);
    }

    const { data, error } = await supabase.rpc("clear_donor_location");

    if (error) {
      return apiErr("INTERNAL", error.message || "Failed to clear donor location.", undefined, 500);
    }

    return apiOk(data, 200);
  } catch {
    return apiErr("INTERNAL", "An unexpected error occurred.", undefined, 500);
  }
}
