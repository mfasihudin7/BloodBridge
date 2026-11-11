import { timingSafeEqual } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { apiErr, apiOk } from "@/lib/server/response";
import {
  cleanupExpiredReservationsAndOrphans,
  purgeOldRejectedCnicDocuments,
  verifyAdmin,
} from "@/lib/server/verification";

function verifyCronSecret(authHeader: string | null, expectedSecret: string | undefined): boolean {
  if (!expectedSecret || expectedSecret.trim() === "" || !authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }
  const token = authHeader.slice(7);
  const tokenBuf = Buffer.from(token);
  const expectedBuf = Buffer.from(expectedSecret);
  if (tokenBuf.length !== expectedBuf.length) {
    return false;
  }
  return timingSafeEqual(tokenBuf, expectedBuf);
}

/**
 * POST /api/admin/verifications/cleanup
 * Scheduled / administrative cleanup for rejected CNIC documents and abandoned upload reservations.
 * Purges Storage files and database rows for submissions rejected >= 30 days ago.
 * Cleans up abandoned/expired upload reservations.
 * Protected by timing-safe CRON_SECRET header or an active administrator session.
 */
export async function POST(request: Request) {
  try {
    // 1. Authorization: check CRON_SECRET or Admin session
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    let isAuthorized = verifyCronSecret(authHeader, cronSecret);

    if (!isAuthorized) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        isAuthorized = await verifyAdmin(user.id);
      }
    }

    if (!isAuthorized) {
      return apiErr(
        "FORBIDDEN",
        "Administrative or scheduler credentials required.",
        undefined,
        403
      );
    }

    // 2. Execute 30-day purge and abandoned reservation cleanup
    const [retentionResult, orphanResult] = await Promise.all([
      purgeOldRejectedCnicDocuments(),
      cleanupExpiredReservationsAndOrphans(),
    ]);

    const allErrors = [...retentionResult.errors, ...orphanResult.errors];

    return apiOk({
      purged_rejected_records: retentionResult.purged_count,
      failed_rejected_records: retentionResult.failed_count,
      cleaned_abandoned_reservations: orphanResult.cleaned_reservations,
      purged_orphaned_files: orphanResult.purged_orphaned_files,
      errors: allErrors.length > 0 ? allErrors : undefined,
    });
  } catch {
    return apiErr(
      "INTERNAL",
      "An unexpected error occurred during retention cleanup.",
      undefined,
      500
    );
  }
}
