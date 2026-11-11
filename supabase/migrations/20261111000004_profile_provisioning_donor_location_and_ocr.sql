-- ==============================================================================
-- BloodBridge Migration 04: Profile Provisioning, Donor Location & Availability, and OCR Intelligence
-- Phase 1 Implementation
-- ==============================================================================

-- 1. Profile Schema Adjustments for Safe Signup Provisioning
-- Clinical donor details become nullable-until-onboarding so initial Auth registration succeeds.
ALTER TABLE public.profiles ALTER COLUMN blood_group DROP NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN age DROP NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN weight_kg DROP NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN height_cm DROP NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN full_name DROP NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN is_available SET DEFAULT false;

-- Add location, preferences, and OCR consent columns
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS donation_location extensions.geography(Point, 4326),
ADD COLUMN IF NOT EXISTS location_consent BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS availability_changed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS in_app_request_notifications_enabled BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS ocr_consent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS area_en TEXT;

-- Spatial index for donor geographic discovery
CREATE INDEX IF NOT EXISTS idx_profiles_donation_location 
ON public.profiles USING GIST (donation_location);

-- 2. Automatic Profile Provisioning Trigger on auth.users
-- Uses trusted NEW.id and sanitized metadata only.
-- Phone is NOT copied from metadata (only trusted auth.users.phone if phone signup was used).
-- No artificial 'New User' fallback; missing optional fields remain genuinely NULL.
-- Never reads or trusts is_admin, is_verified, is_available, or donation_count from client metadata.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_full_name TEXT;
BEGIN
    -- Only copy sanitized, length-limited full_name from Auth metadata
    v_full_name := coalesce(
        nullif(trim(substring(NEW.raw_user_meta_data->>'full_name' from 1 for 100)), ''),
        nullif(trim(substring(NEW.raw_user_meta_data->>'name' from 1 for 100)), '')
    );

    INSERT INTO public.profiles (
        id,
        full_name,
        phone,
        is_available,
        is_admin,
        is_verified,
        donation_count,
        location_consent,
        in_app_request_notifications_enabled,
        created_at,
        updated_at
    )
    VALUES (
        NEW.id,
        v_full_name, -- Genuinely NULL if not provided in metadata
        NEW.phone,   -- Copied strictly from auth.users.phone, NOT from signup metadata
        false,       -- is_available: false by default
        false,       -- is_admin: never assignable from metadata
        false,       -- is_verified: never assignable from metadata
        0,           -- donation_count: 0
        false,       -- location_consent: false by default
        true,        -- in_app_request_notifications_enabled: true
        now(),
        now()
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Fail transaction so uninitialized Auth accounts are not created silently
        RAISE EXCEPTION 'Failed to initialize profile for user %: %', NEW.id, SQLERRM;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_auth_user() TO supabase_admin, postgres, service_role;

DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
CREATE TRIGGER trg_on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_auth_user();

-- 3. Idempotent Backfill Function for Existing Auth Users Missing Profiles
CREATE OR REPLACE FUNCTION public.backfill_missing_profiles()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_count INTEGER := 0;
BEGIN
    WITH inserted AS (
        INSERT INTO public.profiles (
            id,
            full_name,
            phone,
            is_available,
            is_admin,
            is_verified,
            donation_count,
            location_consent,
            in_app_request_notifications_enabled,
            created_at,
            updated_at
        )
        SELECT
            u.id,
            coalesce(
                nullif(trim(substring(u.raw_user_meta_data->>'full_name' from 1 for 100)), ''),
                nullif(trim(substring(u.raw_user_meta_data->>'name' from 1 for 100)), '')
            ),
            u.phone,
            false,
            false,
            false,
            0,
            false,
            true,
            now(),
            now()
        FROM auth.users u
        LEFT JOIN public.profiles p ON p.id = u.id
        WHERE p.id IS NULL
        ON CONFLICT (id) DO NOTHING
        RETURNING id
    )
    SELECT count(*) INTO v_count FROM inserted;

    RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.backfill_missing_profiles() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_missing_profiles() TO service_role, postgres;

-- 4. Extended Profile Protection Trigger
-- Protects donation_count, is_admin, is_verified, donation_location, location_consent, and is_available
-- Direct client updates to these columns are blocked; controlled RPC functions or service_role must be used.
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_jwt_claims TEXT := current_setting('request.jwt.claims', true);
    v_jwt_role TEXT := '';
BEGIN
    IF v_jwt_claims IS NOT NULL AND v_jwt_claims <> '' THEN
        v_jwt_role := coalesce(v_jwt_claims::jsonb ->> 'role', '');
    END IF;

    -- Only trusted service_role, postgres, or internal security definers may bypass direct column protection
    IF (current_user NOT IN ('service_role', 'postgres', 'supabase_admin') AND v_jwt_role != 'service_role') THEN
        IF (NEW.donation_count IS DISTINCT FROM OLD.donation_count) THEN
            RAISE EXCEPTION 'Cannot modify donation_count directly' USING ERRCODE = '42501';
        END IF;
        IF (NEW.is_admin IS DISTINCT FROM OLD.is_admin) THEN
            RAISE EXCEPTION 'Cannot modify is_admin directly' USING ERRCODE = '42501';
        END IF;
        IF (NEW.is_verified IS DISTINCT FROM OLD.is_verified) THEN
            RAISE EXCEPTION 'Cannot modify is_verified directly' USING ERRCODE = '42501';
        END IF;
        IF (NEW.donation_location IS DISTINCT FROM OLD.donation_location) THEN
            RAISE EXCEPTION 'Cannot modify donation_location directly; use set_donor_location()' USING ERRCODE = '42501';
        END IF;
        IF (NEW.location_consent IS DISTINCT FROM OLD.location_consent) THEN
            RAISE EXCEPTION 'Cannot modify location_consent directly; use set_donor_location()' USING ERRCODE = '42501';
        END IF;
        IF (NEW.is_available IS DISTINCT FROM OLD.is_available) THEN
            RAISE EXCEPTION 'Cannot modify is_available directly; use set_donor_availability()' USING ERRCODE = '42501';
        END IF;
    END IF;

    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- 5. Controlled Donor Location & Availability Database Functions
-- These execute as SECURITY DEFINER with search_path = '' to enforce fine-grained business logic.

-- A. set_donor_location(p_lat, p_lng, p_consent)
CREATE OR REPLACE FUNCTION public.set_donor_location(
    p_lat DOUBLE PRECISION,
    p_lng DOUBLE PRECISION,
    p_consent BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
    END IF;

    IF p_lat IS NULL OR p_lat < -90 OR p_lat > 90 THEN
        RAISE EXCEPTION 'Invalid latitude: must be between -90 and 90' USING ERRCODE = '22023';
    END IF;

    IF p_lng IS NULL OR p_lng < -180 OR p_lng > 180 THEN
        RAISE EXCEPTION 'Invalid longitude: must be between -180 and 180' USING ERRCODE = '22023';
    END IF;

    IF p_consent IS NOT TRUE THEN
        RAISE EXCEPTION 'Explicit location consent is required' USING ERRCODE = '22023';
    END IF;

    UPDATE public.profiles
    SET
        donation_location = extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography,
        location_consent = true,
        location_updated_at = now(),
        updated_at = now()
    WHERE id = v_caller_id;

    RETURN jsonb_build_object(
        'success', true,
        'lat', p_lat,
        'lng', p_lng,
        'consent', true,
        'updated_at', now()
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_donor_location(DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_donor_location(DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN) TO authenticated;

-- B. clear_donor_location()
CREATE OR REPLACE FUNCTION public.clear_donor_location()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
    END IF;

    UPDATE public.profiles
    SET
        donation_location = NULL,
        location_consent = false,
        is_available = false, -- Deleting location forces availability OFF
        location_updated_at = now(),
        availability_changed_at = now(),
        updated_at = now()
    WHERE id = v_caller_id;

    RETURN jsonb_build_object(
        'success', true,
        'location_cleared', true,
        'is_available', false,
        'updated_at', now()
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.clear_donor_location() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_donor_location() TO authenticated;

-- C. set_donor_availability(p_is_available)
-- Approved conditions for enabling availability:
-- 1. Donation location exists.
-- 2. Explicit location consent exists.
-- 3. Blood group exists.
-- 4. In-app request notifications are enabled.
CREATE OR REPLACE FUNCTION public.set_donor_availability(
    p_is_available BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_profile RECORD;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
    END IF;

    IF p_is_available IS TRUE THEN
        SELECT 
            donation_location, 
            location_consent, 
            blood_group, 
            in_app_request_notifications_enabled
        INTO v_profile
        FROM public.profiles
        WHERE id = v_caller_id;

        IF v_profile.donation_location IS NULL OR v_profile.location_consent IS NOT TRUE THEN
            RAISE EXCEPTION 'A valid donation location with user consent is required before enabling availability' USING ERRCODE = '22023';
        END IF;

        IF v_profile.blood_group IS NULL THEN
            RAISE EXCEPTION 'Blood group must be specified before enabling availability' USING ERRCODE = '22023';
        END IF;

        IF v_profile.in_app_request_notifications_enabled IS NOT TRUE THEN
            RAISE EXCEPTION 'In-app request notifications must be enabled before becoming available' USING ERRCODE = '22023';
        END IF;
    END IF;

    UPDATE public.profiles
    SET
        is_available = p_is_available,
        availability_changed_at = now(),
        updated_at = now()
    WHERE id = v_caller_id;

    RETURN jsonb_build_object(
        'success', true,
        'is_available', p_is_available,
        'availability_changed_at', now()
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_donor_availability(BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_donor_availability(BOOLEAN) TO authenticated;

-- D. set_donor_notification_preference(p_enabled)
CREATE OR REPLACE FUNCTION public.set_donor_notification_preference(
    p_enabled BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_was_available BOOLEAN;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
    END IF;

    SELECT is_available INTO v_was_available
    FROM public.profiles
    WHERE id = v_caller_id;

    -- Disabling request invitations forces availability OFF if currently available
    IF p_enabled IS FALSE AND v_was_available IS TRUE THEN
        UPDATE public.profiles
        SET
            in_app_request_notifications_enabled = false,
            is_available = false,
            availability_changed_at = now(),
            updated_at = now()
        WHERE id = v_caller_id;
    ELSE
        UPDATE public.profiles
        SET
            in_app_request_notifications_enabled = p_enabled,
            updated_at = now()
        WHERE id = v_caller_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'in_app_request_notifications_enabled', p_enabled,
        'is_available', CASE WHEN p_enabled IS FALSE AND v_was_available IS TRUE THEN false ELSE v_was_available END
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_donor_notification_preference(BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_donor_notification_preference(BOOLEAN) TO authenticated;

-- 6. Persistent Atomic Rate-Limiting Table for CNIC Extraction
-- Limits each user to a maximum of 5 OCR extraction operations per hour
CREATE TABLE IF NOT EXISTS public.cnic_extraction_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cnic_extraction_rate_limits_user 
ON public.cnic_extraction_rate_limits (user_id, created_at);

ALTER TABLE public.cnic_extraction_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.cnic_extraction_rate_limits FROM anon, authenticated;
GRANT ALL ON public.cnic_extraction_rate_limits TO service_role;

