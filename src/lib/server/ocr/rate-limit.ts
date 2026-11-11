import { createAdminClient } from "@/lib/supabase/server";

export const MAX_EXTRACTIONS_PER_HOUR = 5;

/**
 * Enforces a persistent, database-backed atomic rate limit on CNIC OCR extraction.
 * Maximum 5 extractions per rolling hour per user.
 */
export async function checkAndRecordExtractionRateLimit(userId: string): Promise<boolean> {
  const adminClient = createAdminClient();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  // 1. Count extractions within the rolling 1-hour window
  const { count, error: countErr } = await adminClient
    .from("cnic_extraction_rate_limits")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", oneHourAgo);

  if (countErr) {
    return false;
  }

  if ((count ?? 0) >= MAX_EXTRACTIONS_PER_HOUR) {
    return false;
  }

  // 2. Record this extraction attempt atomically
  const { error: insertErr } = await adminClient
    .from("cnic_extraction_rate_limits")
    .insert({ user_id: userId });

  if (insertErr) {
    return false;
  }

  return true;
}

