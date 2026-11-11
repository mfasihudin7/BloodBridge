import { createClient, createAdminClient } from "@/lib/supabase/server";
import { apiErr, apiOk } from "@/lib/server/response";
import {
  checkReservationRateLimit,
  validateAndConsumeReservation,
  verifyStoragePaths,
} from "@/lib/server/verification";
import type { ErrorCode } from "@/types/contract";

/**
 * POST /api/verification/cnic
 * Submit CNIC front and back photos for identity verification.
 * Supports upload reservation verification and prevents image reuse.
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

    let body: {
      front_image_path?: string;
      back_image_path?: string;
      consent?: boolean;
      reservation_id?: string;
    };

    try {
      body = await request.json();
    } catch {
      return apiErr("VALIDATION", "Invalid JSON body", undefined, 400);
    }

    const { front_image_path, back_image_path, consent, reservation_id } = body;

    // 1. Validate explicit consent
    if (consent !== true) {
      return apiErr(
        "VALIDATION",
        "Explicit user consent is mandatory for identity document verification.",
        { consent: "You must consent to document verification." },
        400
      );
    }

    // 2. Validate input fields
    const fields: Record<string, string> = {};
    if (!front_image_path || typeof front_image_path !== "string") {
      fields.front_image_path = "Front document image path is required.";
    }
    if (!back_image_path || typeof back_image_path !== "string") {
      fields.back_image_path = "Back document image path is required.";
    }

    if (Object.keys(fields).length > 0) {
      return apiErr("VALIDATION", "Missing required image paths.", fields, 400);
    }

    if (front_image_path === back_image_path) {
      return apiErr("VALIDATION", "Front and back image paths must be distinct files.", undefined, 400);
    }

    const adminClient = createAdminClient();

    // 3. Check for active pending submission
    const { data: existingPending, error: checkErr } = await adminClient
      .from("cnic_verifications")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .maybeSingle();

    if (checkErr) {
      return apiErr("INTERNAL", "Failed to check existing submissions.", undefined, 500);
    }

    if (existingPending) {
      return apiErr(
        "CONFLICT",
        "You already have a pending verification request under review.",
        undefined,
        409
      );
    }

    // 4. Validate upload reservation if provided; otherwise fallback to strict storage path validation
    if (reservation_id) {
      const resCheck = await validateAndConsumeReservation(
        user.id,
        reservation_id,
        front_image_path!,
        back_image_path!
      );

      if (!resCheck.valid) {
        return apiErr(
          (resCheck.code as ErrorCode) ?? "VALIDATION",
          resCheck.error ?? "Invalid upload reservation.",
          undefined,
          resCheck.code === "NOT_FOUND" ? 404 : resCheck.code === "CONFLICT" ? 409 : 400
        );
      }
    } else {
      // Direct path check if reservation was not used (backward compatibility)
      const withinLimit = await checkReservationRateLimit(user.id);
      if (!withinLimit) {
        return apiErr("RATE_LIMITED", "Submission rate limit exceeded.", undefined, 429);
      }

      const pathCheck = await verifyStoragePaths(
        user.id,
        front_image_path!,
        back_image_path!
      );

      if (!pathCheck.valid) {
        return apiErr(
          "VALIDATION",
          pathCheck.error ?? "Invalid storage paths.",
          { paths: pathCheck.error ?? "Invalid paths." },
          400
        );
      }
    }

    // 5. Insert new verification record via trusted server client
    // Trigger trg_check_cnic_image_uniqueness and unique indexes will reject reuse
    const { data: inserted, error: insertErr } = await adminClient
      .from("cnic_verifications")
      .insert({
        user_id: user.id,
        front_image_path: front_image_path!,
        back_image_path: back_image_path!,
        status: "pending",
      })
      .select("id, status, submitted_at")
      .single();

    if (insertErr || !inserted) {
      if (insertErr?.code === "23505") {
        return apiErr(
          "CONFLICT",
          "One or both image paths have already been used in another verification submission.",
          undefined,
          409
        );
      }
      return apiErr("INTERNAL", "Failed to create verification record.", undefined, 500);
    }

    return apiOk(
      {
        id: inserted.id,
        status: inserted.status,
        submitted_at: inserted.submitted_at,
      },
      201
    );
  } catch {
    return apiErr("INTERNAL", "An unexpected error occurred.", undefined, 500);
  }
}

/**
 * GET /api/verification/cnic
 * Retrieves the authenticated user's verification status.
 * Never leaks image paths or signed URLs.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return apiErr("UNAUTHENTICATED", "Authentication required", undefined, 401);
    }

    const adminClient = createAdminClient();

    const { data: verification, error } = await adminClient
      .from("cnic_verifications")
      .select("id, status, submitted_at, reviewed_at, rejection_reason")
      .eq("user_id", user.id)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return apiErr("INTERNAL", "Failed to fetch verification status.", undefined, 500);
    }

    if (!verification) {
      return apiOk({
        status: "unsubmitted",
        submitted_at: null,
        reviewed_at: null,
        rejection_reason: null,
      });
    }

    return apiOk({
      id: verification.id,
      status: verification.status,
      submitted_at: verification.submitted_at,
      reviewed_at: verification.reviewed_at,
      rejection_reason: verification.rejection_reason,
    });
  } catch {
    return apiErr("INTERNAL", "An unexpected error occurred.", undefined, 500);
  }
}
