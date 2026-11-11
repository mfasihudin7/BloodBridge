import { createClient } from "@supabase/supabase-js";
import { apiOk, apiErr } from "@/lib/server/response";
import type { Database } from "@/types/database";


export async function POST(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const incomingSecret =
      request.headers.get("x-cron-secret") ??
      request.headers.get("authorization")?.replace("Bearer ", "");

    if (!cronSecret || incomingSecret !== cronSecret) {
      return apiErr("UNAUTHENTICATED", "Invalid or missing cron secret.", undefined, 401);
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return apiErr("INTERNAL", "Server configuration error.", undefined, 500);
    }

    const supabase = createClient<Database>(supabaseUrl, serviceRoleKey);

    const { data: processedCount, error } = await supabase.rpc("process_expansion_jobs");

    if (error) {
      return apiErr("INTERNAL", error.message, undefined, 500);
    }

    return apiOk({ processed: processedCount ?? 0 });
  } catch {
    return apiErr("INTERNAL", "An unexpected error occurred.", undefined, 500);
  }
}
