import { z } from "zod";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { apiErr, apiOk } from "@/lib/server/response";

const cnicDetailsSchema = z
  .object({
    full_name: z
      .string()
      .min(2, "Full name must be at least 2 characters.")
      .max(100, "Full name cannot exceed 100 characters.")
      .regex(/^[a-zA-Z\s.'-]+$/, "Full name contains invalid characters."),
    address: z.string().max(300, "Address cannot exceed 300 characters.").optional(),
    area: z.string().max(100, "Area cannot exceed 100 characters.").optional(),
    cnic_last4: z.string().regex(/^\d{4}$/, "CNIC last 4 must be exactly four digits."),
    source: z.enum(["ocr", "manual"] as const, {
      message: "Source must be either 'ocr' or 'manual'.",
    }),
    allow_overwrite: z.boolean().optional(),
    field_overwrites: z
      .object({
        full_name: z.boolean().optional(),
        address: z.boolean().optional(),
        area: z.boolean().optional(),
        cnic_last4: z.boolean().optional(),
      })
      .optional(),
  })
  .strict();

/**
 * PUT /api/profile/cnic-details
 * Updates the user's profile with user-reviewed CNIC details.
 * Prevents silent overwrite of existing non-empty fields without explicit overwrite flag.
 * Never modifies is_verified or is_admin.
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

    const parseResult = cnicDetailsSchema.safeParse(bodyJson);
    if (!parseResult.success) {
      const fields: Record<string, string> = {};
      for (const issue of parseResult.error.issues) {
        fields[issue.path.join(".")] = issue.message;
      }
      return apiErr("VALIDATION", "Invalid CNIC profile details.", fields, 400);
    }

    const { full_name, address, area, cnic_last4, allow_overwrite, field_overwrites } = parseResult.data;
    const adminClient = createAdminClient();

    // 1. Fetch existing profile to check for existing non-empty values
    const { data: currentProfile, error: fetchErr } = await adminClient
      .from("profiles")
      .select("full_name, address, cnic_last4, area_en")
      .eq("id", user.id)
      .single();

    if (fetchErr || !currentProfile) {
      return apiErr("INTERNAL", "Failed to retrieve profile record.", undefined, 500);
    }

    // 2. Prevent silent overwrite of differing non-empty values
    const conflicts: Record<string, string> = {};

    if (
      currentProfile.full_name &&
      currentProfile.full_name !== full_name &&
      !allow_overwrite &&
      !field_overwrites?.full_name
    ) {
      conflicts.full_name = "Existing full name differs. Explicit overwrite confirmation required.";
    }

    if (
      currentProfile.address &&
      address &&
      currentProfile.address !== address &&
      !allow_overwrite &&
      !field_overwrites?.address
    ) {
      conflicts.address = "Existing address differs. Explicit overwrite confirmation required.";
    }

    if (
      currentProfile.cnic_last4 &&
      currentProfile.cnic_last4 !== cnic_last4 &&
      !allow_overwrite &&
      !field_overwrites?.cnic_last4
    ) {
      conflicts.cnic_last4 = "Existing CNIC last 4 digits differ. Explicit overwrite confirmation required.";
    }

    if (Object.keys(conflicts).length > 0) {
      return apiErr(
        "CONFLICT",
        "Profile contains existing non-empty information that differs from submission. Explicit overwrite flag is required.",
        conflicts,
        409
      );
    }

    // 3. Update profile record
    const { error: updateErr } = await adminClient
      .from("profiles")
      .update({
        full_name,
        address: address ?? currentProfile.address,
        area_en: area ?? currentProfile.area_en,
        cnic_last4,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (updateErr) {
      return apiErr("INTERNAL", "Failed to update CNIC profile details.", undefined, 500);
    }

    return apiOk(
      {
        full_name,
        address: address ?? currentProfile.address,
        area: area ?? currentProfile.area_en,
        cnic_last4,
        updated: true,
      },
      200
    );
  } catch {
    return apiErr("INTERNAL", "An unexpected error occurred.", undefined, 500);
  }
}
