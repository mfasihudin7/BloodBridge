import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { apiErr, apiOk } from "@/lib/server/response";

const PostBody = z.object({
  blood_group: z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]),
  required_donors: z.number().int().min(1).max(10),
  scheduled_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be an ISO date (YYYY-MM-DD)"),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
  }),
  notes: z.string().optional(),
});

/**
 * GET /api/thal/schedule
 * Returns scheduled_requirements created by or for auth.uid() (requester or invited donor).
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

    // Fetch requirements where user is the requester
    const { data: asRequester, error: reqErr } = await supabase
      .from("scheduled_requirements")
      .select(
        `
        id,
        requester_id,
        blood_group,
        required_donors,
        scheduled_date,
        location_lat,
        location_lng,
        notes,
        status,
        created_at,
        donor_circles (
          id,
          circle_members (
            donor_id,
            status
          )
        )
      `
      )
      .eq("requester_id", user.id);

    if (reqErr) {
      console.error("Error fetching requirements as requester:", reqErr);
      return apiErr("INTERNAL", "Failed to fetch scheduled requirements", undefined, 500);
    }

    // Fetch requirements where user is an invited/accepted donor via circle_members
    const { data: asDonor, error: donorErr } = await supabase
      .from("circle_members")
      .select(
        `
        status,
        donor_circles (
          id,
          scheduled_requirements (
            id,
            requester_id,
            blood_group,
            required_donors,
            scheduled_date,
            location_lat,
            location_lng,
            notes,
            status,
            created_at
          )
        )
      `
      )
      .eq("donor_id", user.id);

    if (donorErr) {
      console.error("Error fetching requirements as donor:", donorErr);
      return apiErr("INTERNAL", "Failed to fetch donor schedule", undefined, 500);
    }

    // Build response: combine both perspectives
    const asRequesterMapped = (asRequester ?? []).map((r) => {
      const circle = Array.isArray(r.donor_circles) ? r.donor_circles[0] : r.donor_circles;
      const myMembership = circle?.circle_members?.find(
        (m: { donor_id: string; status: string }) => m.donor_id === user.id
      );
      return {
        ...r,
        role: "requester" as const,
        my_circle_status: myMembership?.status ?? null,
        circle_id: circle?.id ?? null,
        donor_circles: undefined,
      };
    });

    const asDonorMapped = (asDonor ?? [])
      .flatMap((cm) => {
        const circles = Array.isArray(cm.donor_circles) ? cm.donor_circles : [cm.donor_circles];
        return circles.map((circle) => {
          const reqs = Array.isArray(circle?.scheduled_requirements)
            ? circle.scheduled_requirements
            : [circle?.scheduled_requirements];
          return reqs.map((req: Record<string, unknown> | null) =>
            req
              ? {
                  ...req,
                  role: "donor" as const,
                  my_circle_status: cm.status,
                  circle_id: circle?.id ?? null,
                }
              : null
          );
        });
      })
      .flat()
      .filter(Boolean);

    return apiOk({ as_requester: asRequesterMapped, as_donor: asDonorMapped });
  } catch {
    return apiErr("INTERNAL", "An unexpected error occurred", undefined, 500);
  }
}

/**
 * POST /api/thal/schedule
 * Creates a new scheduled requirement, a donor circle, finds eligible donors and invites them.
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiErr("VALIDATION", "Invalid JSON body");
    }

    const parsed = PostBody.safeParse(body);
    if (!parsed.success) {
      return apiErr("VALIDATION", parsed.error.issues[0]?.message ?? "Validation failed");
    }

    const { blood_group, required_donors, scheduled_date, location, notes } = parsed.data;

    // Validate scheduled_date > today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dateValue = new Date(scheduled_date);
    if (isNaN(dateValue.getTime()) || dateValue <= today) {
      return apiErr("VALIDATION", "scheduled_date must be a future date");
    }

    // 1. INSERT scheduled_requirements
    const { data: requirement, error: reqInsertErr } = await supabase
      .from("scheduled_requirements")
      .insert({
        requester_id: user.id,
        blood_group,
        required_donors,
        scheduled_date,
        location_lat: location.lat,
        location_lng: location.lng,
        notes: notes ?? null,
        status: "open",
      })
      .select("id")
      .single();

    if (reqInsertErr || !requirement) {
      console.error("Failed to insert scheduled_requirement:", reqInsertErr);
      return apiErr("INTERNAL", "Failed to create scheduled requirement", undefined, 500);
    }

    // 2. INSERT donor_circles for the new requirement
    const { data: circle, error: circleInsertErr } = await supabase
      .from("donor_circles")
      .insert({ requirement_id: requirement.id })
      .select("id")
      .single();

    if (circleInsertErr || !circle) {
      console.error("Failed to insert donor_circle:", circleInsertErr);
      return apiErr("INTERNAL", "Failed to create donor circle", undefined, 500);
    }

    // 3. Find eligible donors using raw SQL via RPC or manual query
    // We use a Postgres RPC to find donors with PostGIS distance filtering
    // Fallback: use the supabase client with a custom rpc call
    const { data: eligibleDonors, error: donorQueryErr } = await supabase.rpc(
      "find_scheduled_donors" as never,
      {
        p_blood_group: blood_group,
        p_lat: location.lat,
        p_lng: location.lng,
        p_scheduled_date: scheduled_date,
        p_requester_id: user.id,
        p_limit: 20,
      } as never
    );

    let donorIds: string[] = [];
    if (donorQueryErr) {
      // If the RPC doesn't exist yet, fall back to a basic query without PostGIS distance
      console.warn(
        "find_scheduled_donors RPC not available, falling back to basic donor query:",
        donorQueryErr.message
      );
      const { data: basicDonors } = await supabase
        .from("profiles")
        .select("id")
        .eq("is_verified", true)
        .eq("is_available", true)
        .eq("location_consent", true)
        .eq("in_app_request_notifications_enabled", true)
        .not("donation_location", "is", null)
        .neq("id", user.id)
        .eq("blood_group", blood_group)
        .limit(20);

      donorIds = (basicDonors ?? []).map((d: { id: string }) => d.id);
    } else {
      donorIds = ((eligibleDonors as Array<{ id: string }>) ?? []).map((d) => d.id);
    }

    // 4. For each found donor: INSERT circle_members + notification
    let invitedCount = 0;
    if (donorIds.length > 0) {
      const memberInserts = donorIds.map((donor_id) => ({
        circle_id: circle.id,
        donor_id,
        status: "invited" as const,
      }));

      const { error: memberInsertErr } = await supabase
        .from("circle_members")
        .insert(memberInserts);

      if (memberInsertErr) {
        console.error("Failed to insert circle_members:", memberInsertErr);
      } else {
        invitedCount = donorIds.length;
      }

      // Insert notifications for each invited donor
      const notificationInserts = donorIds.map((donor_id) => ({
        user_id: donor_id,
        kind: "circle_invitation",
        body: `You have been invited to donate blood (${blood_group}) on ${scheduled_date}.`,
        read: false,
      }));

      const { error: notifErr } = await supabase.from("notifications").insert(notificationInserts);

      if (notifErr) {
        console.error("Failed to insert notifications:", notifErr);
      }
    }

    return apiOk(
      {
        requirement_id: requirement.id,
        circle_id: circle.id,
        invited_count: invitedCount,
      },
      201
    );
  } catch {
    return apiErr("INTERNAL", "An unexpected error occurred", undefined, 500);
  }
}
