import type { ApiResult } from "@/types/contract";

/**
 * Type-safe API client wrapper calling backend /api/** routes.
 * Always handles JSON envelopes { ok: true, data } | { ok: false, code, message }
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResult<T>> {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body && typeof options.body === "string") {
    headers.set("Content-Type", "application/json");
  }

  try {
    const res = await fetch(endpoint, {
      ...options,
      headers,
    });

    const data = await res.json().catch(() => null);

    if (!data) {
      return {
        ok: false,
        code: "INTERNAL",
        message: "Failed to parse server response.",
      };
    }

    return data as ApiResult<T>;
  } catch (err) {
    return {
      ok: false,
      code: "INTERNAL",
      message: err instanceof Error ? err.message : "Network error",
    };
  }
}

export const api = {
  // Donor availability and preferences
  setAvailability: (available: boolean) =>
    apiRequest<{ is_available: boolean }>("/api/donor/availability", {
      method: "PUT",
      body: JSON.stringify({ available }),
    }),

  setLocation: (lat: number, lng: number, consent: boolean) =>
    apiRequest<{ location_updated: boolean }>("/api/donor/location", {
      method: "PUT",
      body: JSON.stringify({ lat, lng, consent }),
    }),

  clearLocation: () =>
    apiRequest<{ cleared: boolean }>("/api/donor/location", {
      method: "DELETE",
    }),

  setNotificationPreference: (enabled: boolean) =>
    apiRequest<{ in_app_request_notifications_enabled: boolean }>(
      "/api/donor/notification-preferences",
      {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      }
    ),

  // Blood requests
  createRequest: (body: {
    blood_group: string;
    units: number;
    hospital: string;
    urgency: "critical" | "urgent" | "planned";
    location: { lat: number; lng: number };
    note?: string;
    required_donors?: number;
  }) =>
    apiRequest<{ id: string; invited_count: number }>("/api/requests", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getRequest: (id: string) =>
    apiRequest<{
      request: unknown;
      is_requester: boolean;
      is_accepted_donor: boolean;
      invited_count: number;
      responses: unknown[];
      expansion_jobs: unknown[];
      next_expansion_at: string | null;
      accepted_donors: unknown[];
    }>(`/api/requests/${id}`),

  cancelRequest: (id: string) =>
    apiRequest<{ cancelled: boolean }>(`/api/requests/${id}/cancel`, {
      method: "POST",
    }),

  respondToInvite: (requestId: string, action: "accept" | "decline") =>
    apiRequest<{ accepted?: boolean; declined?: boolean }>(
      `/api/requests/${requestId}/respond`,
      {
        method: "POST",
        body: JSON.stringify({ action }),
      }
    ),

  updateProgress: (requestId: string, progress: "en_route" | "arrived" | "donated") =>
    apiRequest<{ progress: string }>(`/api/requests/${requestId}/progress`, {
      method: "POST",
      body: JSON.stringify({ progress }),
    }),

  withdrawCommitment: (requestId: string) =>
    apiRequest<{ withdrawn: boolean }>(`/api/requests/${requestId}/donor-cancel`, {
      method: "POST",
    }),

  // Inbox & notifications
  getInbox: () =>
    apiRequest<{
      invitations: Array<{
        id: string;
        stage_radius_km: number;
        invited_at: string;
        status: string;
        requests: {
          id: string;
          blood_group: string;
          units: number;
          hospital: string;
          urgency: string;
          status: string;
          note: string | null;
          expires_at: string | null;
          requester_id: string;
          profiles: { full_name: string | null } | null;
        } | null;
      }>;
      active_commitments: Array<{
        id: string;
        progress: "accepted" | "en_route" | "arrived" | "donated";
        requests: {
          id: string;
          blood_group: string;
          units: number;
          hospital: string;
          urgency: string;
          status: string;
          note: string | null;
          expires_at: string | null;
          requester_id: string;
          profiles: { full_name: string | null } | null;
        } | null;
      }>;
    }>("/api/inbox"),

  getNotifications: (limit = 20, cursor?: string) => {
    const url = new URL("/api/notifications", window.location.origin);
    url.searchParams.set("limit", String(limit));
    if (cursor) url.searchParams.set("cursor", cursor);
    return apiRequest<{
      items: unknown[];
      next_cursor: string | null;
      unread_count: number;
    }>(url.toString());
  },

  getUnreadCount: () =>
    apiRequest<{ count: number }>("/api/notifications/unread-count"),

  markNotificationRead: (id: string) =>
    apiRequest<{ read: boolean }>(`/api/notifications/${id}/read`, {
      method: "POST",
    }),

  markAllNotificationsRead: () =>
    apiRequest<{ marked_all: boolean }>("/api/notifications/read-all", {
      method: "POST",
    }),

  // Community Map
  getMapPins: (bounds: { min_lat: number; min_lng: number; max_lat: number; max_lng: number }, status?: string) => {
    const params = new URLSearchParams({
      min_lat: bounds.min_lat.toFixed(5),
      min_lng: bounds.min_lng.toFixed(5),
      max_lat: bounds.max_lat.toFixed(5),
      max_lng: bounds.max_lng.toFixed(5),
    });
    if (status) params.set("status", status);
    return apiRequest<
      Array<{
        id: string;
        blood_group: string;
        units: number;
        units_filled: number;
        hospital: string;
        urgency: "critical" | "urgent" | "planned";
        status: string;
        lat: number;
        lng: number;
        created_at: string;
        distance_m: number;
      }>
    >(`/api/community-map/pins?${params.toString()}`);
  },

  respondToMapPin: (pinId: string) =>
    apiRequest<{
      request_id: string;
      donor_id: string;
      status: string;
      recipient_contact: { full_name: string | null; phone: string | null } | null;
    }>(`/api/community-map/pins/${pinId}/respond`, {
      method: "POST",
    }),

  // Donations & Reporting
  reportDonationOutcome: (data: {
    request_id: string;
    donor_id: string;
    outcome: "donated" | "not_donated";
    reported_donation_date: string;
    feedback?: string;
  }) =>
    apiRequest<{
      id: string;
      request_id: string;
      donor_id: string;
      outcome: string;
      status: string;
    }>("/api/donations/report", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  confirmDonationReport: (reportId: string) =>
    apiRequest<{
      id: string;
      status: string;
      confirmed_at: string;
    }>(`/api/donations/${reportId}/confirm`, {
      method: "POST",
    }),

  disputeDonationReport: (reportId: string, reason: string) =>
    apiRequest<{
      id: string;
      status: string;
      disputed_at: string;
    }>(`/api/donations/${reportId}/dispute`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),

  getDonationHistory: (limit = 20, cursor?: string) => {
    const url = new URL("/api/donations/history", window.location.origin);
    url.searchParams.set("limit", String(limit));
    if (cursor) url.searchParams.set("cursor", cursor);
    return apiRequest<{
      items: Array<{
        id: string;
        request_id: string;
        donor_id: string;
        donation_date: string;
        confirmed_at: string;
        blood_group: string;
        units: number;
        hospital: string;
      }>;
      next_cursor: string | null;
      has_more: boolean;
    }>(url.toString());
  },

  // Thalassemia Schedules
  getThalSchedules: () =>
    apiRequest<{
      as_requester: Array<{
        id: string;
        requester_id: string;
        blood_group: string;
        required_donors: number;
        scheduled_date: string;
        location_lat: number;
        location_lng: number;
        notes: string | null;
        status: string;
        created_at: string;
        donor_circles: Array<{
          id: string;
          status: string;
          circle_members: Array<{
            id: string;
            donor_id: string;
            status: string;
            profiles: { full_name: string | null; phone: string | null } | null;
          }>;
        }>;
      }>;
      as_donor: Array<{
        circle_id: string;
        membership_id: string;
        status: string;
        scheduled_requirements: {
          id: string;
          blood_group: string;
          required_donors: number;
          scheduled_date: string;
          notes: string | null;
          status: string;
        } | null;
      }>;
    }>("/api/thal/schedule"),

  createThalSchedule: (data: {
    blood_group: string;
    required_donors: number;
    scheduled_date: string;
    location: { lat: number; lng: number };
    notes?: string;
  }) =>
    apiRequest<{ id: string; requirement_id: string }>("/api/thal/schedule", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  respondToThalSchedule: (requirementId: string, action: "accept" | "decline") =>
    apiRequest<{ success: boolean; status: string }>(`/api/thal/schedule/${requirementId}/respond`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),

  cancelThalSchedule: (requirementId: string) =>
    apiRequest<{ success: boolean; status: string }>(`/api/thal/schedule/${requirementId}/cancel`, {
      method: "POST",
    }),

  // Identity & CNIC Verification
  reserveCnicUpload: () =>
    apiRequest<{
      reservation_id: string;
      front_path: string;
      back_path: string;
      expires_at: string;
    }>("/api/verification/cnic/reserve", {
      method: "POST",
    }),

  submitCnicVerification: (data: {
    front_image_path: string;
    back_image_path: string;
    consent: boolean;
    reservation_id: string;
  }) =>
    apiRequest<{
      id: string;
      status: string;
      submitted_at: string;
    }>("/api/verification/cnic", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  saveCnicDetails: (data: {
    full_name: string;
    cnic_last4: string;
    address?: string;
    area?: string;
    source: "ocr" | "manual";
    allow_overwrite?: boolean;
  }) =>
    apiRequest<{
      success: boolean;
      updated_fields: string[];
    }>("/api/profile/cnic-details", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // Admin APIs
  getAdminVerifications: (status: "pending" | "approved" | "rejected" = "pending") =>
    apiRequest<
      Array<{
        id: string;
        user_id: string;
        status: string;
        submitted_at: string;
        front_image_signed_url: string;
        back_image_signed_url: string;
        user: { full_name: string | null };
      }>
    >(`/api/admin/verifications?status=${status}`),

  reviewAdminVerification: (id: string, action: "approve" | "reject", rejection_reason?: string) =>
    apiRequest<{
      success: boolean;
      verification_id: string;
      status: string;
    }>(`/api/admin/verifications/${id}/review`, {
      method: "POST",
      body: JSON.stringify({ action, rejection_reason }),
    }),

  resolveDonationDispute: (reportId: string, resolution: "confirmed" | "rejected", note: string) =>
    apiRequest<{
      id: string;
      status: string;
      resolution_note: string;
    }>(`/api/admin/donations/${reportId}/resolve`, {
      method: "POST",
      body: JSON.stringify({ resolution, note }),
    }),
};
