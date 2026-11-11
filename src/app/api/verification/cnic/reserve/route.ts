import { createClient } from "@/lib/supabase/server";
import { apiErr, apiOk } from "@/lib/server/response";
import { createUploadReservation } from "@/lib/server/verification";
import type { ErrorCode } from "@/types/contract";

/**
 * POST /api/verification/cnic/reserve
 * Pre-authorizes and reserves exactly two unpredictable object paths for CNIC upload.
 * Normal authenticated uploads are verified at upload time by the cnic_storage_upload_reserved RLS policy.
 * Rate limited to 3 reservations per user per 24 hours.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return apiErr("UNAUTHENTICATED", "Authentication required", undefined, 401);
    }

    const reservation = await createUploadReservation(user.id);

    if (!reservation.success || !reservation.data) {
      const statusCode =
        reservation.code === "CONFLICT"
          ? 409
          : reservation.code === "RATE_LIMITED"
          ? 429
          : 500;

      return apiErr(
        (reservation.code as ErrorCode) ?? "INTERNAL",
        reservation.error ?? "Failed to reserve upload paths.",
        undefined,
        statusCode
      );
    }

    return apiOk(
      {
        reservation_id: reservation.data.reservation_id,
        front_path: reservation.data.front_path,
        back_path: reservation.data.back_path,
        expires_at: reservation.data.expires_at,
      },
      201
    );
  } catch {
    return apiErr(
      "INTERNAL",
      "An unexpected error occurred while reserving upload paths.",
      undefined,
      500
    );
  }
}
