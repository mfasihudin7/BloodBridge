import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { apiErr, apiOk } from "@/lib/server/response";

const availabilitySchema = z
  .object({
    is_available: z.boolean({ message: "is_available boolean flag is required." }),
  })
  .strict();

/**
 * PUT /api/donor/availability
 * Turns donor availability ON or OFF.
 * Turning ON requires stored location + location consent + blood group + in-app request notifications enabled.
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

    const parseResult = availabilitySchema.safeParse(bodyJson);
    if (!parseResult.success) {
      return apiErr(
        "VALIDATION",
        parseResult.error.issues[0]?.message ?? "Invalid availability parameter.",
        undefined,
        400
      );
    }

    const { is_available } = parseResult.data;

    const { data, error } = await supabase.rpc("set_donor_availability", {
      p_is_available: is_available,
    });

    if (error) {
      // Prerequisite violation returns HTTP 409 Conflict
      return apiErr(
        "CONFLICT",
        error.message || "Cannot enable availability until all eligibility prerequisites are met.",
        undefined,
        409
      );
    }

    return apiOk(data, 200);
  } catch {
    return apiErr("INTERNAL", "An unexpected error occurred.", undefined, 500);
  }
}
