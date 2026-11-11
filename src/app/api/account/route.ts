import { createClient, createAdminClient } from "@/lib/supabase/server";
import { apiErr, apiOk } from "@/lib/server/response";
import { cleanupUserCnicStorage } from "@/lib/server/verification";

/**
 * DELETE /api/account
 * Deletes user profile, purges private CNIC images from storage,
 * cascades linked records, and anonymizes hospital emergency requests.
 */
export async function DELETE() {
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

    // 1. Storage cleanup: purge private CNIC document photos
    const cleanup = await cleanupUserCnicStorage(user.id);
    if (!cleanup.success) {
      console.error("Storage cleanup failed for user:", user.id, cleanup.errors);
      return apiErr(
        "INTERNAL",
        "Failed to safely delete stored verification documents. Account deletion aborted to prevent orphaned data.",
        undefined,
        500
      );
    }

    // 2. Anonymize emergency requests created by this user
    // Preserves hospital audit trails while removing personal link
    const { error: anonErr } = await adminClient
      .from("requests")
      .update({ requester_id: null })
      .eq("requester_id", user.id);

    if (anonErr) {
      console.error("Failed to anonymize requests for user:", user.id, anonErr);
    }

    // 3. Explicitly purge notifications for this user (in case not cascaded)
    await adminClient
      .from("notifications")
      .delete()
      .eq("user_id", user.id);

    // 4. Delete profile row (cascades to cnic_verifications, request_responses,
    // request_invites, donation_reports, donation_history, circle_members, scheduled_requirements)
    const { error: deleteProfileErr } = await adminClient
      .from("profiles")
      .delete()
      .eq("id", user.id);

    if (deleteProfileErr) {
      return apiErr("INTERNAL", "Failed to delete user profile.", undefined, 500);
    }

    // 5. Delete user account from Supabase Auth
    const { error: deleteAuthErr } = await adminClient.auth.admin.deleteUser(user.id);
    if (deleteAuthErr) {
      console.error("Failed to delete auth user:", user.id, deleteAuthErr);
    }

    return apiOk({
      deleted: true,
      purged_storage_files: cleanup.deletedCount,
    });
  } catch {
    return apiErr("INTERNAL", "An unexpected error occurred during account deletion.", undefined, 500);
  }
}
