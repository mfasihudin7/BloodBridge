import { createClient, createAdminClient } from "@/lib/supabase/server";
import { apiErr, apiOk } from "@/lib/server/response";
import { verifyAdmin } from "@/lib/server/verification";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/admin/verifications/[id]/review
 * Atomically approves or rejects a pending identity verification via PostgreSQL RPC.
 * Verifies admin role both in API route and inside the database function.
 * Atomic: updates cnic_verifications, profiles.is_verified, and notifications in ONE transaction.
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return apiErr("UNAUTHENTICATED", "Authentication required", undefined, 401);
    }

    // 1. Verify administrator role via database lookup
    const isAdmin = await verifyAdmin(user.id);
    if (!isAdmin) {
      return apiErr(
        "FORBIDDEN",
        "Administrative privileges required.",
        undefined,
        403
      );
    }

    let body: {
      action?: "approve" | "reject";
      rejection_reason?: string;
    };

    try {
      body = await request.json();
    } catch {
      return apiErr("VALIDATION", "Invalid JSON body", undefined, 400);
    }

    const { action, rejection_reason } = body;

    if (action !== "approve" && action !== "reject") {
      return apiErr(
        "VALIDATION",
        "Action must be either 'approve' or 'reject'.",
        { action: "Must be 'approve' or 'reject'." },
        400
      );
    }

    if (action === "reject" && (!rejection_reason || rejection_reason.trim() === "")) {
      return apiErr(
        "VALIDATION",
        "A rejection reason is required when rejecting verification.",
        { rejection_reason: "Rejection reason is required." },
        400
      );
    }

    const adminClient = createAdminClient();

    // 2. Execute Atomic Review via PostgreSQL RPC
    // All 3 updates (cnic_verifications, profiles.is_verified, notifications)
    // occur in a single PostgreSQL transaction with full rollback on failure.
    const { data: rpcResult, error: rpcErr } = await adminClient.rpc(
      "admin_review_verification",
      {
        p_verification_id: id,
        p_admin_id: user.id,
        p_action: action,
        p_rejection_reason: action === "reject" ? rejection_reason!.trim() : null,
      }
    );

    if (rpcErr) {
      // Map PostgreSQL error codes to standard contract errors
      if (rpcErr.code === "P0002" || rpcErr.message.includes("NOT_FOUND")) {
        return apiErr("NOT_FOUND", "Verification record not found.", undefined, 404);
      }
      if (rpcErr.code === "23505" || rpcErr.message.includes("CONFLICT")) {
        return apiErr(
          "CONFLICT",
          "Verification record has already been reviewed or concurrent review occurred.",
          undefined,
          409
        );
      }
      if (rpcErr.code === "42501" || rpcErr.message.includes("FORBIDDEN")) {
        return apiErr("FORBIDDEN", "Caller is not an administrator.", undefined, 403);
      }
      if (rpcErr.code === "22023" || rpcErr.message.includes("VALIDATION")) {
        return apiErr("VALIDATION", rpcErr.message, undefined, 400);
      }

      return apiErr("INTERNAL", `Failed to complete review: ${rpcErr.message}`, undefined, 500);
    }

    return apiOk(rpcResult);
  } catch {
    return apiErr("INTERNAL", "An unexpected error occurred.", undefined, 500);
  }
}
