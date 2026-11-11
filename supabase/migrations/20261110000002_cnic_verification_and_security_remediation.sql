-- ==============================================================================
-- BloodBridge Migration 02: CNIC Verification & B0 Security Remediation
-- ==============================================================================

-- 1. Remediation: Restrict execution privileges on SECURITY DEFINER RPC functions
REVOKE EXECUTE ON FUNCTION public.requests_in_bounds FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.requests_in_bounds TO authenticated;

REVOKE EXECUTE ON FUNCTION public.donor_density FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.donor_density TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reveal_contact FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reveal_contact TO authenticated;

-- 2. Add is_verified to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_verified ON public.profiles (is_verified);

-- 3. Hardened Profile Protection Trigger: protects donation_count, is_admin, and is_verified
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_jwt_claims TEXT := current_setting('request.jwt.claims', true);
    v_jwt_role TEXT := '';
BEGIN
    IF v_jwt_claims IS NOT NULL AND v_jwt_claims <> '' THEN
        v_jwt_role := coalesce(v_jwt_claims::jsonb ->> 'role', '');
    END IF;

    -- Only trusted service_role may modify protected columns
    IF (current_user != 'service_role' AND v_jwt_role != 'service_role') THEN
        IF (NEW.donation_count IS DISTINCT FROM OLD.donation_count) THEN
            RAISE EXCEPTION 'Cannot modify donation_count directly' USING ERRCODE = '42501';
        END IF;
        IF (NEW.is_admin IS DISTINCT FROM OLD.is_admin) THEN
            RAISE EXCEPTION 'Cannot modify is_admin directly' USING ERRCODE = '42501';
        END IF;
        IF (NEW.is_verified IS DISTINCT FROM OLD.is_verified) THEN
            RAISE EXCEPTION 'Cannot modify is_verified directly' USING ERRCODE = '42501';
        END IF;
    END IF;

    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- 4. Create cnic_verifications table
CREATE TABLE IF NOT EXISTS public.cnic_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    front_image_path TEXT NOT NULL,
    back_image_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'approved', 'rejected')),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance & administration
CREATE INDEX IF NOT EXISTS idx_cnic_verifications_user ON public.cnic_verifications (user_id);
CREATE INDEX IF NOT EXISTS idx_cnic_verifications_pending ON public.cnic_verifications (submitted_at) WHERE status = 'pending';

-- Anti-spam: Only ONE pending verification allowed per user at any given time
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_pending_verification 
ON public.cnic_verifications (user_id) 
WHERE status = 'pending';

-- 5. RLS for cnic_verifications — Default Deny with Zero Direct Client Mutations
ALTER TABLE public.cnic_verifications ENABLE ROW LEVEL SECURITY;

-- SELECT: Users can only read their own verification status
CREATE POLICY "cnic_verifications_select_own" ON public.cnic_verifications
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

-- Explicitly NO INSERT, UPDATE, or DELETE policies for client roles.
-- All writes occur strictly via trusted server route handlers using service_role.

-- 6. Storage Bucket for CNIC Verification Photos
-- Private bucket with strict 5MB limit and JPEG/PNG/WebP format enforcement
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'cnic-verification',
    'cnic-verification',
    false,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- Storage RLS on storage.objects
-- Upload: Users can only upload into their own folder: cnic-verification/{user_id}/*
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
        AND schemaname = 'storage' 
        AND policyname = 'cnic_storage_upload_own'
    ) THEN
        CREATE POLICY "cnic_storage_upload_own" ON storage.objects
            FOR INSERT TO authenticated
            WITH CHECK (
                bucket_id = 'cnic-verification' AND
                (storage.foldername(name))[1] = auth.uid()::text
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
        AND schemaname = 'storage' 
        AND policyname = 'cnic_storage_select_own'
    ) THEN
        CREATE POLICY "cnic_storage_select_own" ON storage.objects
            FOR SELECT TO authenticated
            USING (
                bucket_id = 'cnic-verification' AND
                (storage.foldername(name))[1] = auth.uid()::text
            );
    END IF;
END $$;

