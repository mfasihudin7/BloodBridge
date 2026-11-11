/**
 * Shared types defined by INTEGRATION_CONTRACT.md (Section 3).
 * Locked file shared between frontend and backend.
 */

export type BloodGroup = "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";
export type Urgency = "critical" | "urgent" | "planned";
export type RequestStatus = "open" | "filled" | "fulfilled" | "cancelled" | "expired";
export type DonorProgress =
  | "pending"
  | "accepted"
  | "en_route"
  | "arrived"
  | "donated"
  | "declined"
  | "withdrawn";

export type ErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_TRANSITION"
  | "RATE_LIMITED"
  | "AI_UNAVAILABLE"
  | "INTERNAL";

export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = {
  ok: false;
  code: ErrorCode;
  message: string;
  fields?: Record<string, string>;
};
export type ApiResult<T> = ApiOk<T> | ApiErr;

export interface Profile {
  id: string;
  full_name: string;
  blood_group: BloodGroup;
  age: number;
  weight_kg: number;
  height_cm: number;
  phone: string;
  address?: string;
  cnic_last4?: string;
  is_available: boolean;
  last_donated?: string;
  donation_count: number;
  lat?: number;
  lng?: number;
}

export interface MapRequest {
  id: string;
  blood_group: BloodGroup;
  units: number;
  units_filled: number;
  hospital: string;
  urgency: Urgency;
  status: RequestStatus;
  lat: number;
  lng: number;
  created_at: string;
  distance_m?: number;
}

export interface RequestDetail extends MapRequest {
  note?: string;
  is_mine: boolean;
  donors: { donor_id: string; first_name: string; progress: DonorProgress }[];
  timeline: StatusEvent[];
}

export interface StatusEvent {
  id: string;
  request_id: string;
  actor_role: "requester" | "donor" | "system";
  status: string;
  created_at: string;
}

export interface InboxItem {
  response_id: string;
  progress: DonorProgress;
  request: MapRequest;
}

export interface Contact {
  full_name: string;
  phone: string;
  address?: string;
}

export interface DensityCell {
  lat: number;
  lng: number;
  count: number;
}

export interface ParsedRequest {
  blood_group?: BloodGroup;
  units?: number;
  hospital?: string;
  urgency?: Urgency;
}

export interface ThalSchedule {
  interval_days: number;
  last_transfusion?: string;
  next_due?: string;
  bookings: {
    id: string;
    scheduled_for: string;
    donor_first_name: string;
    status: "pending" | "confirmed" | "done" | "cancelled";
  }[];
}

export interface AppNotification {
  id: string;
  kind: string;
  request_id?: string;
  body: string;
  read: boolean;
  created_at: string;
}

