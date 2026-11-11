import { z } from "zod";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { apiErr, apiOk } from "@/lib/server/response";
import { CNIC_BUCKET } from "@/lib/server/verification";
import { checkAndRecordExtractionRateLimit } from "@/lib/server/ocr/rate-limit";
import { processAndMaskCnicCrops } from "@/lib/server/ocr/image-safety";
import { getOcrProvider } from "@/lib/server/ocr/provider";

const extractRequestSchema = z
  .object({
    reservation_id: z.string().uuid().optional(),
    verification_id: z.string().uuid().optional(),
  })
  .refine((data) => Boolean(data.reservation_id || data.verification_id), {
    message: "Either reservation_id or verification_id must be provided.",
  });

/**
 * POST /api/verification/cnic/extract
 * Extracts identity information from uploaded CNIC images server-side.
 * Resolves paths strictly from the database; never trusts client-supplied paths.
 * Enforces OCR consent, atomic 5/hour rate limiting, image crop minimization, and 9-digit masking.
 * Never writes directly to the profile.
 */
export async function POST(request: Request) {
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

    const parseResult = extractRequestSchema.safeParse(bodyJson);
    if (!parseResult.success) {
      return apiErr(
        "VALIDATION",
        parseResult.error.issues[0]?.message ?? "Invalid extraction parameters.",
        undefined,
        400
      );
    }

    const { reservation_id, verification_id } = parseResult.data;
    const adminClient = createAdminClient();

    // 1. Verify user's OCR consent
    const { data: profile, error: profileErr } = await adminClient
      .from("profiles")
      .select("ocr_consent_at")
      .eq("id", user.id)
      .single();

    if (profileErr || !profile || !profile.ocr_consent_at) {
      return apiErr(
        "FORBIDDEN",
        "Explicit OCR consent has not been granted. Please consent to OCR processing or use manual entry.",
        undefined,
        403
      );
    }

    // 2. Enforce persistent atomic 5/hour rate limit
    const allowed = await checkAndRecordExtractionRateLimit(user.id);
    if (!allowed) {
      return apiErr(
        "RATE_LIMITED",
        "Extraction rate limit exceeded. You may extract up to 5 times per hour.",
        undefined,
        429
      );
    }

    // 3. Resolve paths from DB using reservation_id or verification_id
    let frontPath: string | undefined;
    let backPath: string | undefined;

    if (reservation_id) {
      const { data: resData, error: resErr } = await adminClient
        .from("cnic_upload_reservations")
        .select("front_path, back_path, user_id, status, expires_at")
        .eq("id", reservation_id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (resErr || !resData) {
        return apiErr("NOT_FOUND", "Valid upload reservation not found.", undefined, 404);
      }

      frontPath = resData.front_path;
      backPath = resData.back_path;
    } else if (verification_id) {
      const { data: verData, error: verErr } = await adminClient
        .from("cnic_verifications")
        .select("front_image_path, back_image_path, user_id")
        .eq("id", verification_id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (verErr || !verData) {
        return apiErr("NOT_FOUND", "Verification record not found.", undefined, 404);
      }

      frontPath = verData.front_image_path;
      backPath = verData.back_image_path;
    }

    if (!frontPath || !backPath) {
      return apiErr("NOT_FOUND", "Image paths could not be resolved.", undefined, 404);
    }

    // 4. Download images server-side from private storage
    const [frontDownload, backDownload] = await Promise.all([
      adminClient.storage.from(CNIC_BUCKET).download(frontPath),
      adminClient.storage.from(CNIC_BUCKET).download(backPath),
    ]);

    if (frontDownload.error || !frontDownload.data || backDownload.error || !backDownload.data) {
      return apiErr(
        "VALIDATION",
        "One or both CNIC images have not been uploaded to storage yet.",
        undefined,
        400
      );
    }

    const frontBuffer = Buffer.from(await frontDownload.data.arrayBuffer());
    const backBuffer = Buffer.from(await backDownload.data.arrayBuffer());

    // 5. Card layout assessment & number masking
    const { assessment, crops } = processAndMaskCnicCrops(frontBuffer, backBuffer);

    if (!assessment.isValidLayout || !crops) {
      return apiOk({ status: "manual_entry_required" });
    }

    // 6. Invoke active OCR provider with masked crops
    const provider = getOcrProvider();
    const result = await provider.extractFromCrops(crops);

    if (result.status !== "success") {
      return apiOk({ status: "manual_entry_required" });
    }

    return apiOk({
      status: "success",
      full_name_en: result.full_name_en,
      cnic_last4: result.cnic_last4,
      address_en: result.address_en,
      area_en: result.area_en,
      confidence: result.confidence,
      script_detected: result.script_detected,
      needs_review: result.needs_review ?? false,
    });
  } catch {
    return apiErr("INTERNAL", "An unexpected error occurred during extraction.", undefined, 500);
  }
}
