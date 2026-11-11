export type VerificationStatus = "unsubmitted" | "pending" | "approved" | "rejected";

export interface CnicVerificationStatus {
  id?: string;
  status: VerificationStatus;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  rejection_reason?: string | null;
}

export interface SubmitCnicInput {
  front_image_path: string;
  back_image_path: string;
  consent: boolean;
}

export interface AdminVerificationItem {
  id: string;
  user_id: string;
  user_full_name: string;
  status: VerificationStatus;
  submitted_at: string;
  front_image_signed_url: string; // 5-minute TTL
  back_image_signed_url: string;  // 5-minute TTL
}

export interface ReviewCnicInput {
  action: "approve" | "reject";
  rejection_reason?: string;
}

sbp_fc09861831307bb407a14d2e2fb92dd8ae41752c


