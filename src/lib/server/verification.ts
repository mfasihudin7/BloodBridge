import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";

export const CNIC_BUCKET = "cnic-verification";
export const SIGNED_URL_TTL_SECONDS = 300; // 5 minutes for admin review read URLs
export const RESERVATION_TTL_MINUTES = 15;
export const MAX_RESERVATIONS_PER_24H = 3;

/**
 * Checks whether a given user is an administrator via trusted database lookup.
 * Never trusts client headers or claims.
 */
export async function verifyAdmin(userId: string): Promise<boolean> {
  const adminClient = createAdminClient();

  const { data: profile, error } = await adminClient
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .single();

  if (error || !profile) {
    return false;
  }

  return profile.is_admin === true;
}

/**
 * Enforces rate limiting on upload reservations: Maximum 3 reservations per 24 hours.
 */
export async function checkReservationRateLimit(userId: string): Promise<boolean> {
  const adminClient = createAdminClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { count, error } = await adminClient
    .from("cnic_upload_reservations")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);

  if (error) {
    return false;
  }

  return (count ?? 0) < MAX_RESERVATIONS_PER_24H;
}

export interface UploadReservationResult {
  reservation_id: string;
  front_path: string;
  back_path: string;
  expires_at: string;
}

/**
 * Creates an upload reservation for exactly two unique, unpredictable object paths.
 * Normal authenticated uploads are verified at upload-time by the cnic_storage_upload_reserved RLS policy.
 */
export async function createUploadReservation(
  userId: string
): Promise<{ success: boolean; data?: UploadReservationResult; error?: string; code?: string }> {
  const adminClient = createAdminClient();

  // 1. Check if user already has an active pending submission
  const { data: existingPending } = await adminClient
    .from("cnic_verifications")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "pending")
    .maybeSingle();

  if (existingPending) {
    return {
      success: false,
      error: "You already have a verification request pending review.",
      code: "CONFLICT",
    };
  }

  // 2. Rate limit reservations (max 3 per 24h)
  const withinLimit = await checkReservationRateLimit(userId);
  if (!withinLimit) {
    return {
      success: false,
      error: "Upload reservation rate limit exceeded. You may reserve up to 3 times per 24 hours.",
      code: "RATE_LIMITED",
    };
  }

  // 3. Generate unpredictable paths
  const frontPath = `${userId}/front_${randomUUID()}.jpg`;
  const backPath = `${userId}/back_${randomUUID()}.jpg`;
  const expiresAt = new Date(Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000).toISOString();

  // 4. Record reservation in database
  const { data: reservation, error: insertErr } = await adminClient
    .from("cnic_upload_reservations")
    .insert({
      user_id: userId,
      front_path: frontPath,
      back_path: backPath,
      status: "reserved",
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (insertErr || !reservation) {
    return {
      success: false,
      error: "Failed to record upload reservation.",
      code: "INTERNAL",
    };
  }

  return {
    success: true,
    data: {
      reservation_id: reservation.id,
      front_path: frontPath,
      back_path: backPath,
      expires_at: expiresAt,
    },
  };
}

/**
 * Validates and consumes an upload reservation during verification submission.
 * Ensures the submitted paths match the reservation, have not expired, and both files exist.
 */
export async function validateAndConsumeReservation(
  userId: string,
  reservationId: string,
  frontPath: string,
  backPath: string
): Promise<{ valid: boolean; error?: string; code?: string }> {
  const adminClient = createAdminClient();

  const { data: reservation, error: fetchErr } = await adminClient
    .from("cnic_upload_reservations")
    .select("id, user_id, front_path, back_path, status, expires_at")
    .eq("id", reservationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchErr || !reservation) {
    return {
      valid: false,
      error: "Valid upload reservation not found.",
      code: "NOT_FOUND",
    };
  }

  if (reservation.status !== "reserved") {
    return {
      valid: false,
      error: `Upload reservation is already ${reservation.status}.`,
      code: "CONFLICT",
    };
  }

  if (new Date(reservation.expires_at) < new Date()) {
    await adminClient
      .from("cnic_upload_reservations")
      .update({ status: "expired" })
      .eq("id", reservationId);

    return {
      valid: false,
      error: "Upload reservation has expired. Please request a new upload reservation.",
      code: "VALIDATION",
    };
  }

  if (reservation.front_path !== frontPath || reservation.back_path !== backPath) {
    return {
      valid: false,
      error: "Submitted image paths do not match the reserved upload paths.",
      code: "VALIDATION",
    };
  }

  // Verify both files actually exist in storage
  const expectedPrefix = `${userId}/`;
  const frontFilename = frontPath.slice(expectedPrefix.length);
  const backFilename = backPath.slice(expectedPrefix.length);

  const [frontList, backList] = await Promise.all([
    adminClient.storage.from(CNIC_BUCKET).list(userId, { search: frontFilename }),
    adminClient.storage.from(CNIC_BUCKET).list(userId, { search: backFilename }),
  ]);

  if (!frontList.data || !frontList.data.some((f) => f.name === frontFilename)) {
    return {
      valid: false,
      error: "Front document image was not uploaded to the reserved path.",
      code: "VALIDATION",
    };
  }

  if (!backList.data || !backList.data.some((f) => f.name === backFilename)) {
    return {
      valid: false,
      error: "Back document image was not uploaded to the reserved path.",
      code: "VALIDATION",
    };
  }

  // Mark reservation as used
  await adminClient
    .from("cnic_upload_reservations")
    .update({ status: "used" })
    .eq("id", reservationId);

  return { valid: true };
}

/**
 * Validates ownership and existence of uploaded CNIC photos in the private bucket.
 * Used for direct storage path checks when reservation is not provided.
 */
export async function verifyStoragePaths(
  userId: string,
  frontPath: string,
  backPath: string
): Promise<{ valid: boolean; error?: string }> {
  const expectedPrefix = `${userId}/`;

  if (!frontPath.startsWith(expectedPrefix) || !backPath.startsWith(expectedPrefix)) {
    return {
      valid: false,
      error: "Object paths must reside in the authenticated user's folder.",
    };
  }

  if (frontPath === backPath) {
    return {
      valid: false,
      error: "Front and back image paths must be distinct files.",
    };
  }

  // Prevent path traversal
  if (frontPath.includes("..") || backPath.includes("..")) {
    return {
      valid: false,
      error: "Invalid object path containing directory traversal.",
    };
  }

  const adminClient = createAdminClient();

  const frontFilename = frontPath.slice(expectedPrefix.length);
  const backFilename = backPath.slice(expectedPrefix.length);

  const [frontFiles, backFiles] = await Promise.all([
    adminClient.storage.from(CNIC_BUCKET).list(userId, { search: frontFilename }),
    adminClient.storage.from(CNIC_BUCKET).list(userId, { search: backFilename }),
  ]);

  if (!frontFiles.data || !frontFiles.data.some((f) => f.name === frontFilename)) {
    return {
      valid: false,
      error: "Front document image was not found in storage.",
    };
  }

  if (!backFiles.data || !backFiles.data.some((f) => f.name === backFilename)) {
    return {
      valid: false,
      error: "Back document image was not found in storage.",
    };
  }

  return { valid: true };
}

/**
 * Robust account-deletion storage cleanup.
 * Retrieves all objects under user's folder in cnic-verification and deletes them.
 * Missing objects are treated as already deleted (idempotent).
 */
export async function cleanupUserCnicStorage(
  userId: string
): Promise<{ success: boolean; deletedCount: number; errors?: string[] }> {
  const adminClient = createAdminClient();
  const errors: string[] = [];
  let deletedCount = 0;

  try {
    const { data: files, error: listErr } = await adminClient.storage
      .from(CNIC_BUCKET)
      .list(userId);

    if (listErr) {
      errors.push(`Failed to list files: ${listErr.message}`);
      return { success: false, deletedCount: 0, errors };
    }

    if (!files || files.length === 0) {
      return { success: true, deletedCount: 0 };
    }

    const pathsToDelete = files.map((f) => `${userId}/${f.name}`);

    const { data: removed, error: removeErr } = await adminClient.storage
      .from(CNIC_BUCKET)
      .remove(pathsToDelete);

    if (removeErr) {
      errors.push(`Batch deletion failed: ${removeErr.message}`);

      for (const path of pathsToDelete) {
        const { error: singleErr } = await adminClient.storage
          .from(CNIC_BUCKET)
          .remove([path]);
        if (singleErr) {
          errors.push(`Failed to remove file ${path}: ${singleErr.message}`);
        } else {
          deletedCount += 1;
        }
      }
    } else {
      deletedCount = removed?.length ?? pathsToDelete.length;
    }

    // Verify cleanup
    const { data: remainingFiles } = await adminClient.storage
      .from(CNIC_BUCKET)
      .list(userId);

    if (remainingFiles && remainingFiles.length > 0) {
      errors.push(`${remainingFiles.length} files still remained after deletion attempt.`);
      return { success: false, deletedCount, errors };
    }

    return { success: errors.length === 0, deletedCount, errors: errors.length > 0 ? errors : undefined };
  } catch (err) {
    errors.push(`Unexpected error during storage cleanup: ${String(err)}`);
    return { success: false, deletedCount, errors };
  }
}

/**
 * Clean up expired, abandoned upload reservations and any orphaned images.
 * Never touches images belonging to used reservations or pending/approved records.
 */
export async function cleanupExpiredReservationsAndOrphans(): Promise<{
  cleaned_reservations: number;
  purged_orphaned_files: number;
  errors: string[];
}> {
  const adminClient = createAdminClient();
  const errors: string[] = [];
  let cleanedReservations = 0;
  let purgedOrphanedFiles = 0;

  // Query expired reservations that were never completed (status = 'reserved' and expires_at < now())
  const { data: expired, error: fetchErr } = await adminClient
    .from("cnic_upload_reservations")
    .select("id, user_id, front_path, back_path")
    .eq("status", "reserved")
    .lt("expires_at", new Date().toISOString());

  if (fetchErr || !expired) {
    if (fetchErr) errors.push(`Failed to fetch expired reservations: ${fetchErr.message}`);
    return { cleaned_reservations: 0, purged_orphaned_files: 0, errors };
  }

  for (const res of expired) {
    try {
      // Remove any partial files uploaded under this abandoned reservation
      const pathsToCheck = [res.front_path, res.back_path];
      const { data: removed } = await adminClient.storage
        .from(CNIC_BUCKET)
        .remove(pathsToCheck);

      if (removed && removed.length > 0) {
        purgedOrphanedFiles += removed.length;
      }

      // Mark reservation as expired
      await adminClient
        .from("cnic_upload_reservations")
        .update({ status: "expired" })
        .eq("id", res.id);

      cleanedReservations += 1;
    } catch (err) {
      errors.push(`Failed to process expired reservation ${res.id}: ${String(err)}`);
    }
  }

  return { cleaned_reservations: cleanedReservations, purged_orphaned_files: purgedOrphanedFiles, errors };
}

/**
 * 30-Day Retention Cleanup for Rejected CNIC Documents.
 * Purges storage objects for records rejected at least 30 days ago.
 * Idempotent: missing storage objects are ignored.
 * Never purges pending or approved records.
 * Never logs user PII or sensitive path contents.
 */
export async function purgeOldRejectedCnicDocuments(): Promise<{
  purged_count: number;
  failed_count: number;
  errors: string[];
}> {
  const adminClient = createAdminClient();
  const errors: string[] = [];
  let purgedCount = 0;
  let failedCount = 0;

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Query records rejected at least 30 days ago
  const { data: records, error: fetchErr } = await adminClient
    .from("cnic_verifications")
    .select("id, user_id, front_image_path, back_image_path, reviewed_at")
    .eq("status", "rejected")
    .lte("reviewed_at", cutoff);

  if (fetchErr) {
    errors.push(`Failed to fetch rejected records: ${fetchErr.message}`);
    return { purged_count: 0, failed_count: 0, errors };
  }

  if (!records || records.length === 0) {
    return { purged_count: 0, failed_count: 0, errors: [] };
  }

  for (const record of records) {
    try {
      const pathsToDelete: string[] = [];
      if (record.front_image_path) pathsToDelete.push(record.front_image_path);
      if (record.back_image_path) pathsToDelete.push(record.back_image_path);

      if (pathsToDelete.length > 0) {
        // Delete actual files from storage
        const { error: storageErr } = await adminClient.storage
          .from(CNIC_BUCKET)
          .remove(pathsToDelete);

        if (storageErr) {
          failedCount += 1;
          errors.push(`Storage deletion failed for record ID ${record.id}`);
          continue; // Do NOT delete DB record if storage deletion fails
        }
      }

      // 2. Delete database record only after storage files are removed
      const { error: dbErr } = await adminClient
        .from("cnic_verifications")
        .delete()
        .eq("id", record.id);

      if (dbErr) {
        failedCount += 1;
        errors.push(`Database deletion failed for record ID ${record.id}`);
      } else {
        purgedCount += 1;
      }
    } catch {
      failedCount += 1;
      errors.push(`Unexpected error processing record ID ${record.id}`);
    }
  }

  return { purged_count: purgedCount, failed_count: failedCount, errors };
}
