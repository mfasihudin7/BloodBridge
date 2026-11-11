import { createClient, createAdminClient } from "@/lib/supabase/server";
import { apiErr, apiOk } from "@/lib/server/response";
import {
  CNIC_BUCKET,
  SIGNED_URL_TTL_SECONDS,
  verifyAdmin,
} from "@/lib/server/verification";

/**
 * GET /api/admin/verifications
 * Returns pending identity verifications for administrative review.
 * Strictly verifies admin role server-side.
 * Employs data minimization (no medical/blood data).
 * Generates short-lived signed URLs (5 minutes).
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return apiErr("UNAUTHENTICATED", "Authentication required", undefined, 401);
    }

    // 1. Verify administrative privileges from trusted database
    const isAdmin = await verifyAdmin(user.id);
    if (!isAdmin) {
      return apiErr(
        "FORBIDDEN",
        "Administrative privileges required.",
        undefined,
        403
      );
    }

    const { searchParams } = new URL(request.url);
    const rawStatus = searchParams.get("status");
    const statusFilter: "pending" | "approved" | "rejected" =
      rawStatus === "approved" || rawStatus === "rejected"
        ? rawStatus
        : "pending";
    const limit = Math.min(Number(searchParams.get("limit") ?? "50"), 100);

    const adminClient = createAdminClient();

    // 2. Query verifications with user full_name (no blood_group, no location)
    const { data: verifications, error } = await adminClient
      .from("cnic_verifications")
      .select(`
        id,
        user_id,
        status,
        submitted_at,
        front_image_path,
        back_image_path,
        profiles!cnic_verifications_user_id_fkey(full_name)
      `)
      .eq("status", statusFilter)
      .order("submitted_at", { ascending: true })
      .limit(limit);

    if (error) {
      return apiErr("INTERNAL", "Failed to retrieve verifications.", undefined, 500);
    }

    if (!verifications || verifications.length === 0) {
      return apiOk([]);
    }

    // 3. Generate short-lived signed URLs for documents (5 minutes TTL)
    const items = await Promise.all(
      verifications.map(async (v) => {
        const [frontSigned, backSigned] = await Promise.all([
          adminClient.storage
            .from(CNIC_BUCKET)
            .createSignedUrl(v.front_image_path, SIGNED_URL_TTL_SECONDS),
          adminClient.storage
            .from(CNIC_BUCKET)
            .createSignedUrl(v.back_image_path, SIGNED_URL_TTL_SECONDS),
        ]);

        const profileData = v.profiles as unknown as { full_name: string } | null;

        return {
          id: v.id,
          user_id: v.user_id,
          user_full_name: profileData?.full_name ?? "Unknown",
          status: v.status,
          submitted_at: v.submitted_at,
          front_image_signed_url: frontSigned.data?.signedUrl ?? "",
          back_image_signed_url: backSigned.data?.signedUrl ?? "",
        };
      })
    );

    return apiOk(items);
  } catch {
    return apiErr("INTERNAL", "An unexpected error occurred.", undefined, 500);
  }
}
