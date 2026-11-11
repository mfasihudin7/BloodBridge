import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { apiErr, apiOk } from "@/lib/server/response";

const preferencesSchema = z
  .object({
    enabled: z.boolean({ message: "enabled flag is required." }),
  })
  .strict();

/**
 * PUT /api/donor/notification-preferences
 * Toggles donor blood-request invitation notifications.
 * Disabling invitations forces availability OFF without deleting security/verification history.
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

    const parseResult = preferencesSchema.safeParse(bodyJson);
    if (!parseResult.success) {
      return apiErr(
        "VALIDATION",
        parseResult.error.issues[0]?.message ?? "Invalid notification preference parameters.",
        undefined,
        400
      );
    }

    const { enabled } = parseResult.data;

    const { data, error } = await supabase.rpc("set_donor_notification_preference", {
      p_enabled: enabled,
    });

    if (error) {
      return apiErr("INTERNAL", error.message || "Failed to update notification preferences.", undefined, 500);
    }

    return apiOk(data, 200);
  } catch {
    return apiErr("INTERNAL", "An unexpected error occurred.", undefined, 500);
  }
}
