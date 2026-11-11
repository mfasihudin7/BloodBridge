import { z } from "zod";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { apiErr, apiOk } from "@/lib/server/response";

const ocrConsentSchema = z
  .object({
    consent: z.boolean({ message: "consent boolean is required." }),
  })
  .strict();

/**
 * PUT /api/verification/cnic/ocr-consent
 * Records or withdraws explicit user consent for external CNIC OCR processing.
 * Withdrawing consent immediately blocks future external OCR processing.
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

    const parseResult = ocrConsentSchema.safeParse(bodyJson);
    if (!parseResult.success) {
      return apiErr(
        "VALIDATION",
        parseResult.error.issues[0]?.message ?? "Invalid consent parameter.",
        undefined,
        400
      );
    }

    const { consent } = parseResult.data;
    const adminClient = createAdminClient();

    const ocrConsentAt = consent ? new Date().toISOString() : null;

    const { error: updateErr } = await adminClient
      .from("profiles")
      .update({ ocr_consent_at: ocrConsentAt })
      .eq("id", user.id);

    if (updateErr) {
      return apiErr("INTERNAL", "Failed to update OCR consent status.", undefined, 500);
    }

    return apiOk(
      {
        consent,
        ocr_consent_at: ocrConsentAt,
        policy_version: "2026.1",
      },
      200
    );
  } catch {
    return apiErr("INTERNAL", "An unexpected error occurred.", undefined, 500);
  }
}
