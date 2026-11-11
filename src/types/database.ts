/**
 * TypeScript definitions for Supabase Database Schema (Phase B0–B4).
 * Reflects tables, columns, RLS-exposed views, and RPC functions.
 * Updated to include all new tables and RPCs from migrations 000005–000009.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          blood_group: ("A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-") | null;
          age: number | null;
          weight_kg: number | null;
          height_cm: number | null;
          phone: string | null;
          address: string | null;
          cnic_last4: string | null;
          is_available: boolean;
          last_donated: string | null;
          donation_count: number;
          is_admin: boolean;
          is_verified: boolean;
          area: unknown | null;
          donation_location: unknown | null;
          location_consent: boolean;
          location_updated_at: string | null;
          availability_changed_at: string | null;
          in_app_request_notifications_enabled: boolean;
          ocr_consent_at: string | null;
          area_en: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          blood_group?: ("A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-") | null;
          age?: number | null;
          weight_kg?: number | null;
          height_cm?: number | null;
          phone?: string | null;
          address?: string | null;
          cnic_last4?: string | null;
          is_available?: boolean;
          last_donated?: string | null;
          donation_count?: number;
          is_admin?: boolean;
          is_verified?: boolean;
          area?: unknown | null;
          donation_location?: unknown | null;
          location_consent?: boolean;
          location_updated_at?: string | null;
          availability_changed_at?: string | null;
          in_app_request_notifications_enabled?: boolean;
          ocr_consent_at?: string | null;
          area_en?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          blood_group?: ("A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-") | null;
          age?: number | null;
          weight_kg?: number | null;
          height_cm?: number | null;
          phone?: string | null;
          address?: string | null;
          cnic_last4?: string | null;
          is_available?: boolean;
          last_donated?: string | null;
          donation_count?: number;
          is_admin?: boolean;
          is_verified?: boolean;
          area?: unknown | null;
          donation_location?: unknown | null;
          location_consent?: boolean;
          location_updated_at?: string | null;
          availability_changed_at?: string | null;
          in_app_request_notifications_enabled?: boolean;
          ocr_consent_at?: string | null;
          area_en?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      cnic_extraction_rate_limits: {
        Row: {
          id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cnic_extraction_rate_limits_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      cnic_verifications: {
        Row: {
          id: string;
          user_id: string;
          front_image_path: string;
          back_image_path: string;
          status: "pending" | "approved" | "rejected";
          submitted_at: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          rejection_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          front_image_path: string;
          back_image_path: string;
          status?: "pending" | "approved" | "rejected";
          submitted_at?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          rejection_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          front_image_path?: string;
          back_image_path?: string;
          status?: "pending" | "approved" | "rejected";
          submitted_at?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          rejection_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cnic_verifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cnic_verifications_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      cnic_upload_reservations: {
        Row: {
          id: string;
          user_id: string;
          front_path: string;
          back_path: string;
          status: "reserved" | "used" | "expired";
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          front_path: string;
          back_path: string;
          status?: "reserved" | "used" | "expired";
          expires_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          front_path?: string;
          back_path?: string;
          status?: "reserved" | "used" | "expired";
          expires_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cnic_upload_reservations_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      requests: {
        Row: {
          id: string;
          requester_id: string | null;
          blood_group: "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";
          units: number;
          units_filled: number;
          hospital: string;
          urgency: "critical" | "urgent" | "planned";
          status:
            | "open"
            | "accepted"
            | "filled"
            | "partially_filled"
            | "fulfilled"
            | "cancelled"
            | "expired"
            | "no_donors_found";
          location: unknown;
          note: string | null;
          required_donors: number;
          accepted_donors_count: number;
          terminal_reason: string | null;
          expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          requester_id?: string | null;
          blood_group: "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";
          units: number;
          units_filled?: number;
          hospital: string;
          urgency: "critical" | "urgent" | "planned";
          status?:
            | "open"
            | "accepted"
            | "filled"
            | "partially_filled"
            | "fulfilled"
            | "cancelled"
            | "expired"
            | "no_donors_found";
          location: unknown;
          note?: string | null;
          required_donors?: number;
          accepted_donors_count?: number;
          terminal_reason?: string | null;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          requester_id?: string | null;
          blood_group?: "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";
          units?: number;
          units_filled?: number;
          hospital?: string;
          urgency?: "critical" | "urgent" | "planned";
          status?:
            | "open"
            | "accepted"
            | "filled"
            | "partially_filled"
            | "fulfilled"
            | "cancelled"
            | "expired"
            | "no_donors_found";
          location?: unknown;
          note?: string | null;
          required_donors?: number;
          accepted_donors_count?: number;
          terminal_reason?: string | null;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "requests_requester_id_fkey";
            columns: ["requester_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      request_responses: {
        Row: {
          id: string;
          request_id: string;
          donor_id: string;
          progress:
            | "pending"
            | "accepted"
            | "en_route"
            | "arrived"
            | "donated"
            | "declined"
            | "withdrawn";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          request_id: string;
          donor_id: string;
          progress?:
            | "pending"
            | "accepted"
            | "en_route"
            | "arrived"
            | "donated"
            | "declined"
            | "withdrawn";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          request_id?: string;
          donor_id?: string;
          progress?:
            | "pending"
            | "accepted"
            | "en_route"
            | "arrived"
            | "donated"
            | "declined"
            | "withdrawn";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "request_responses_donor_id_fkey";
            columns: ["donor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "request_responses_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "requests";
            referencedColumns: ["id"];
          }
        ];
      };
      status_events: {
        Row: {
          id: string;
          request_id: string;
          actor_id: string | null;
          actor_role: "requester" | "donor" | "system";
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          request_id: string;
          actor_id?: string | null;
          actor_role: "requester" | "donor" | "system";
          status: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          request_id?: string;
          actor_id?: string | null;
          actor_role?: "requester" | "donor" | "system";
          status?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "status_events_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "status_events_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "requests";
            referencedColumns: ["id"];
          }
        ];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          kind: string;
          request_id: string | null;
          body: string;
          read: boolean;
          title: string | null;
          type: string | null;
          related_donation_id: string | null;
          metadata: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          kind: string;
          request_id?: string | null;
          body: string;
          read?: boolean;
          title?: string | null;
          type?: string | null;
          related_donation_id?: string | null;
          metadata?: Record<string, unknown> | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          kind?: string;
          request_id?: string | null;
          body?: string;
          read?: boolean;
          title?: string | null;
          type?: string | null;
          related_donation_id?: string | null;
          metadata?: Record<string, unknown> | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_related_donation_id_fkey";
            columns: ["related_donation_id"];
            isOneToOne: false;
            referencedRelation: "donation_reports";
            referencedColumns: ["id"];
          }
        ];
      };
      // -----------------------------------------------------------------------
      // Migration 000005: Donation reports, donation history, app config
      // -----------------------------------------------------------------------
      donation_reports: {
        Row: {
          id: string;
          request_id: string;
          donor_id: string;
          recipient_id: string;
          outcome: "donated" | "not_donated";
          reported_donation_date: string;
          feedback: string | null;
          status:
            | "awaiting_donor_confirmation"
            | "confirmed"
            | "disputed"
            | "resolved_confirmed"
            | "resolved_rejected";
          created_at: string;
          confirmed_at: string | null;
          confirmation_source: string | null;
          dispute_reason: string | null;
          resolution_note: string | null;
          resolved_by: string | null;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          request_id: string;
          donor_id: string;
          recipient_id: string;
          outcome: "donated" | "not_donated";
          reported_donation_date: string;
          feedback?: string | null;
          status?: "awaiting_donor_confirmation" | "confirmed" | "disputed" | "resolved_confirmed" | "resolved_rejected";
          created_at?: string;
          confirmed_at?: string | null;
          confirmation_source?: string | null;
          dispute_reason?: string | null;
          resolution_note?: string | null;
          resolved_by?: string | null;
          resolved_at?: string | null;
        };
        Update: {
          id?: string;
          request_id?: string;
          donor_id?: string;
          recipient_id?: string;
          outcome?: "donated" | "not_donated";
          reported_donation_date?: string;
          feedback?: string | null;
          status?: "awaiting_donor_confirmation" | "confirmed" | "disputed" | "resolved_confirmed" | "resolved_rejected";
          created_at?: string;
          confirmed_at?: string | null;
          confirmation_source?: string | null;
          dispute_reason?: string | null;
          resolution_note?: string | null;
          resolved_by?: string | null;
          resolved_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "donation_reports_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "donation_reports_donor_id_fkey";
            columns: ["donor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "donation_reports_recipient_id_fkey";
            columns: ["recipient_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "donation_reports_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      donation_history: {
        Row: {
          id: string;
          donor_id: string;
          report_id: string;
          donation_date: string;
          confirmed_at: string;
          source: "donor_confirmed" | "admin_resolved";
        };
        Insert: {
          id?: string;
          donor_id: string;
          report_id: string;
          donation_date: string;
          confirmed_at?: string;
          source: "donor_confirmed" | "admin_resolved";
        };
        Update: {
          id?: string;
          donor_id?: string;
          report_id?: string;
          donation_date?: string;
          confirmed_at?: string;
          source?: "donor_confirmed" | "admin_resolved";
        };
        Relationships: [
          {
            foreignKeyName: "donation_history_donor_id_fkey";
            columns: ["donor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "donation_history_report_id_fkey";
            columns: ["report_id"];
            isOneToOne: true;
            referencedRelation: "donation_reports";
            referencedColumns: ["id"];
          }
        ];
      };
      app_config: {
        Row: {
          key: string;
          value: Json;
          description: string | null;
          updated_at: string;
        };
        Insert: {
          key: string;
          value: Json;
          description?: string | null;
          updated_at?: string;
        };
        Update: {
          key?: string;
          value?: Json;
          description?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      // -----------------------------------------------------------------------
      // Migration 000006: Request expansion, invites, expansion jobs
      // -----------------------------------------------------------------------
      request_invites: {
        Row: {
          id: string;
          request_id: string;
          donor_id: string;
          stage_radius_km: number;
          invited_at: string;
          status: "pending" | "accepted" | "declined" | "expired";
        };
        Insert: {
          id?: string;
          request_id: string;
          donor_id: string;
          stage_radius_km: number;
          invited_at?: string;
          status?: "pending" | "accepted" | "declined" | "expired";
        };
        Update: {
          id?: string;
          request_id?: string;
          donor_id?: string;
          stage_radius_km?: number;
          invited_at?: string;
          status?: "pending" | "accepted" | "declined" | "expired";
        };
        Relationships: [
          {
            foreignKeyName: "request_invites_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "request_invites_donor_id_fkey";
            columns: ["donor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      expansion_jobs: {
        Row: {
          id: string;
          job_type: "expand_radius" | "send_reminders" | "expire_request";
          request_id: string;
          scheduled_at: string;
          status: "pending" | "running" | "completed" | "failed";
          attempt_count: number;
          lock_acquired_at: string | null;
          error_code: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          job_type: "expand_radius" | "send_reminders" | "expire_request";
          request_id: string;
          scheduled_at: string;
          status?: "pending" | "running" | "completed" | "failed";
          attempt_count?: number;
          lock_acquired_at?: string | null;
          error_code?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          job_type?: "expand_radius" | "send_reminders" | "expire_request";
          request_id?: string;
          scheduled_at?: string;
          status?: "pending" | "running" | "completed" | "failed";
          attempt_count?: number;
          lock_acquired_at?: string | null;
          error_code?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expansion_jobs_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "requests";
            referencedColumns: ["id"];
          }
        ];
      };
      // -----------------------------------------------------------------------
      // Migration 000008: Thalassemia scheduling and community circles
      // -----------------------------------------------------------------------
      scheduled_requirements: {
        Row: {
          id: string;
          requester_id: string;
          blood_group: string;
          required_donors: number;
          scheduled_date: string;
          location: unknown | null;
          location_lat: number | null;
          location_lng: number | null;
          notes: string | null;
          status: "open" | "partially_filled" | "filled" | "cancelled" | "expired";
          accepted_donors_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          requester_id: string;
          blood_group: string;
          required_donors?: number;
          scheduled_date: string;
          location?: unknown | null;
          location_lat?: number | null;
          location_lng?: number | null;
          notes?: string | null;
          status?: "open" | "partially_filled" | "filled" | "cancelled" | "expired";
          accepted_donors_count?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          requester_id?: string;
          blood_group?: string;
          required_donors?: number;
          scheduled_date?: string;
          location?: unknown | null;
          location_lat?: number | null;
          location_lng?: number | null;
          notes?: string | null;
          status?: "open" | "partially_filled" | "filled" | "cancelled" | "expired";
          accepted_donors_count?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "scheduled_requirements_requester_id_fkey";
            columns: ["requester_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      donor_circles: {
        Row: {
          id: string;
          requirement_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          requirement_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          requirement_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "donor_circles_requirement_id_fkey";
            columns: ["requirement_id"];
            isOneToOne: true;
            referencedRelation: "scheduled_requirements";
            referencedColumns: ["id"];
          }
        ];
      };
      circle_members: {
        Row: {
          id: string;
          circle_id: string;
          donor_id: string;
          status: "invited" | "accepted" | "declined" | "cancelled" | "completed";
          invited_at: string;
          responded_at: string | null;
        };
        Insert: {
          id?: string;
          circle_id: string;
          donor_id: string;
          status?: "invited" | "accepted" | "declined" | "cancelled" | "completed";
          invited_at?: string;
          responded_at?: string | null;
        };
        Update: {
          id?: string;
          circle_id?: string;
          donor_id?: string;
          status?: "invited" | "accepted" | "declined" | "cancelled" | "completed";
          invited_at?: string;
          responded_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "circle_members_circle_id_fkey";
            columns: ["circle_id"];
            isOneToOne: false;
            referencedRelation: "donor_circles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "circle_members_donor_id_fkey";
            columns: ["donor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      // -----------------------------------------------------------------------
      // Migration 000009: Rate limits
      // -----------------------------------------------------------------------
      api_rate_limits: {
        Row: {
          id: string;
          user_id: string;
          action: string;
          window_start: string;
          count: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          action: string;
          window_start: string;
          count?: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          action?: string;
          window_start?: string;
          count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "api_rate_limits_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      // -----------------------------------------------------------------------
      // Phase B0 / B1 functions
      // -----------------------------------------------------------------------
      requests_in_bounds: {
        Args: {
          min_lat: number;
          min_lng: number;
          max_lat: number;
          max_lng: number;
          p_blood_group?: string | null;
          p_urgency?: string | null;
        };
        Returns: {
          id: string;
          blood_group: string;
          units: number;
          units_filled: number;
          hospital?: string;
          urgency: string;
          status: string;
          lat: number;
          lng: number;
          created_at: string;
          distance_m: number;
        }[];
      };
      donor_density: {
        Args: {
          min_lat: number;
          min_lng: number;
          max_lat: number;
          max_lng: number;
        };
        Returns: {
          lat: number;
          lng: number;
          count: number;
        }[];
      };
      reveal_contact: {
        Args: {
          p_request_id: string;
          p_other_user_id: string;
        };
        Returns: {
          full_name: string;
          phone: string;
          address: string | null;
        }[];
      };
      admin_review_verification: {
        Args: {
          p_verification_id: string;
          p_admin_id: string;
          p_action: string;
          p_rejection_reason?: string | null;
        };
        Returns: Json;
      };
      set_donor_location: {
        Args: {
          p_lat: number;
          p_lng: number;
          p_consent: boolean;
        };
        Returns: Json;
      };
      clear_donor_location: {
        Args: Record<string, never>;
        Returns: Json;
      };
      set_donor_availability: {
        Args: {
          p_is_available: boolean;
        };
        Returns: Json;
      };
      set_donor_notification_preference: {
        Args: {
          p_enabled: boolean;
        };
        Returns: Json;
      };
      backfill_missing_profiles: {
        Args: Record<string, never>;
        Returns: number;
      };
      // -----------------------------------------------------------------------
      // Migration 000005: Donation report RPCs
      // -----------------------------------------------------------------------
      confirm_donation_report: {
        Args: { p_report_id: string };
        Returns: Json;
      };
      dispute_donation_report: {
        Args: { p_report_id: string; p_reason: string };
        Returns: Json;
      };
      admin_resolve_report: {
        Args: { p_report_id: string; p_resolution: string; p_note: string };
        Returns: Json;
      };
      // -----------------------------------------------------------------------
      // Migration 000006: Expansion and request lifecycle RPCs
      // -----------------------------------------------------------------------
      match_donors: {
        Args: { p_request_id: string; p_radius_km: number };
        Returns: Array<{ donor_id: string; distance_km: number }>;
      };
      accept_request: {
        Args: { p_request_id: string };
        Returns: Json;
      };
      process_expansion_jobs: {
        Args: Record<string, never>;
        Returns: number;
      };
      // -----------------------------------------------------------------------
      // Migration 000007: Notification management RPCs
      // -----------------------------------------------------------------------
      mark_notification_read: {
        Args: { p_notification_id: string };
        Returns: undefined;
      };
      mark_all_notifications_read: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      // -----------------------------------------------------------------------
      // Migration 000008: Circle invitation RPCs
      // -----------------------------------------------------------------------
      accept_circle_invitation: {
        Args: { p_circle_id: string };
        Returns: Json;
      };
      decline_circle_invitation: {
        Args: { p_circle_id: string };
        Returns: Json;
      };
      // -----------------------------------------------------------------------
      // Migration 000009: Rate limit RPC
      // -----------------------------------------------------------------------
      check_rate_limit: {
        Args: {
          p_user_id: string;
          p_action: string;
          p_max: number;
          p_window_minutes: number;
        };
        Returns: boolean;
      };
      check_map_pin_respond_eligibility: {
        Args: {
          p_request_id: string;
          p_donor_id: string;
          p_max_radius_km?: number;
        };
        Returns: Json;
      };
    };
    Enums: {
      blood_group: "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";
      urgency: "critical" | "urgent" | "planned";
      request_status: "open" | "filled" | "fulfilled" | "cancelled" | "expired";
      donor_progress:
        | "pending"
        | "accepted"
        | "en_route"
        | "arrived"
        | "donated"
        | "declined"
        | "withdrawn";
      verification_status: "pending" | "approved" | "rejected";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
