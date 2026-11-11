import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { apiOk, apiErr } from "@/lib/server/response";


const ProgressSchema = z.object({
  progress: z.enum(["en_route", "arrived", "donated"], {
    message: "Invalid progress value. Allowed: en_route, arrived, donated.",
  }),
});

const VALID_PROGRESSION: Record<string, string[]> = {
  accepted: ["en_route"],
  en_route: ["arrived"],
  arrived: ["donated"],
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return apiErr("UNAUTHENTICATED", "Authentication required.", undefined, 401);
    }

    const body = await request.json().catch(() => null);
    const parsed = ProgressSchema.safeParse(body);
    if (!parsed.success) {
      return apiErr("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid request body.");
    }

    const nextProgress = parsed.data.progress;

    // Fetch current progress
    const { data: currentResp, error: fetchErr } = await supabase
      .from("request_responses")
      .select("id, progress, requests:request_id (requester_id, units_filled)")
      .eq("request_id", id)
      .eq("donor_id", user.id)
      .maybeSingle();

    if (fetchErr || !currentResp) {
      return apiErr("FORBIDDEN", "No active commitment found for this request.", undefined, 403);
    }

    const allowedNext = VALID_PROGRESSION[currentResp.progress] ?? [];
    if (!allowedNext.includes(nextProgress)) {
      return apiErr(
        "INVALID_TRANSITION",
        `Cannot transition from '${currentResp.progress}' to '${nextProgress}'.`,
        undefined,
        409
      );
    }

    // Update progress
    await supabase
      .from("request_responses")
      .update({ progress: nextProgress })
      .eq("id", currentResp.id);

    const reqData = currentResp.requests as unknown as { requester_id: string; units_filled: number } | null;

    // If donated, increment units_filled
    if (nextProgress === "donated" && reqData) {
      await supabase
        .from("requests")
        .update({ units_filled: (reqData.units_filled || 0) + 1 })
        .eq("id", id);
    }

    // Notify requester
    if (reqData?.requester_id) {
      const titles: Record<string, string> = {
        en_route: "Donor En Route",
        arrived: "Donor Arrived",
        donated: "Donation Complete",
      };
      await supabase.from("notifications").insert({
        user_id: reqData.requester_id,
        kind: `donor_${nextProgress}`,
        type: nextProgress,
        title: titles[nextProgress] ?? "Donor Update",
        body: `A donor is now ${nextProgress.replace("_", " ")} for your request.`,
        request_id: id,
      });
    }

    return apiOk({ progress: nextProgress });
  } catch {
    return apiErr("INTERNAL", "An unexpected error occurred.", undefined, 500);
  }
}
