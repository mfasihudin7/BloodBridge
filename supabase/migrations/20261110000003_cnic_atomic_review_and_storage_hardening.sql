-- ==============================================================================
-- BloodBridge Migration 03: CNIC Atomic Review, Upload Reservations & Security Hardening
-- ==============================================================================

-- 1. Explicit Database Privileges: Revoke client mutations on cnic_verifications
REVOKE INSERT, UPDATE, DELETE ON public.cnic_verifications FROM anon, authenticated;
GRANT SELECT ON public.cnic_verifications TO authenticated;
GRANT ALL ON public.cnic_verifications TO service_role;

-- 2. Create Upload Reservations Table
CREATE TABLE IF NOT EXISTS public.cnic_upload_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    front_path TEXT NOT NULL UNIQUE,
    back_path TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'used', 'expired')),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '15 minutes'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cnic_reservations_user ON public.cnic_upload_reservations (user_id, status, expires_at);

ALTER TABLE public.cnic_upload_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reservations_select_own" ON public.cnic_upload_reservations
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE ON public.cnic_upload_reservations FROM anon, authenticated;
GRANT SELECT ON public.cnic_upload_reservations TO authenticated;
GRANT ALL ON public.cnic_upload_reservations TO service_role;

-- 3. Hardened Storage Upload Policy: Uploads permitted ONLY for active reserved paths
-- Normal authenticated uploads pass user JWT; policy checks owner, status, and expiry at upload time.
DROP POLICY IF EXISTS "cnic_storage_upload_own" ON storage.objects;
DROP POLICY IF EXISTS "cnic_storage_upload_reserved" ON storage.objects;

CREATE POLICY "cnic_storage_upload_reserved" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'cnic-verification' AND
        (storage.foldername(name))[1] = auth.uid()::text AND
        EXISTS (
            SELECT 1 FROM public.cnic_upload_reservations r
            WHERE r.user_id = auth.uid()
              AND r.status = 'reserved'
              AND r.expires_at > now()
              AND (r.front_path = name OR r.back_path = name)
        )
    );

-- 4. Cross-Column Image Uniqueness via Dedicated Image Path Registry Table
-- Guarantees that a storage path appears at most ONCE across all verification submissions
-- even under high concurrency, by leveraging PostgreSQL primary key locking.
CREATE TABLE IF NOT EXISTS public.cnic_image_registry (
    storage_path TEXT PRIMARY KEY,
    verification_id UUID NOT NULL REFERENCES public.cnic_verifications(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cnic_image_registry ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cnic_image_registry FROM anon, authenticated;
GRANT ALL ON public.cnic_image_registry TO service_role;

CREATE OR REPLACE FUNCTION public.sync_cnic_image_registry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.front_image_path = NEW.back_image_path THEN
        RAISE EXCEPTION 'Front and back image paths must be distinct' USING ERRCODE = '23514';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        DELETE FROM public.cnic_image_registry WHERE verification_id = OLD.id;
    END IF;

    -- Inserting into the primary-key table acquires row/index locks that block
    -- concurrent transactions attempting to register the same path in any column.
    INSERT INTO public.cnic_image_registry (storage_path, verification_id)
    VALUES 
        (NEW.front_image_path, NEW.id),
        (NEW.back_image_path, NEW.id);

    RETURN NEW;
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'One or both image paths have already been registered in another verification submission' USING ERRCODE = '23505';
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_cnic_image_registry ON public.cnic_verifications;
CREATE TRIGGER trg_sync_cnic_image_registry
AFTER INSERT OR UPDATE OF front_image_path, back_image_path ON public.cnic_verifications
FOR EACH ROW
EXECUTE FUNCTION public.sync_cnic_image_registry();

-- 5. Hardened Profile Protection Trigger: supports superuser and service_role
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
    END IF;

    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- 6. Atomic Admin Review RPC Function
CREATE OR REPLACE FUNCTION public.admin_review_verification(
    p_verification_id UUID,
    p_admin_id UUID,
    p_action TEXT,
    p_rejection_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_current_status TEXT;
    v_new_status TEXT;
    v_reviewed_at TIMESTAMPTZ := now();
    v_notification_body TEXT;
BEGIN
    -- 1. Defense-in-depth: Verify caller is an administrator
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_admin_id AND is_admin = true) THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller is not an administrator' USING ERRCODE = '42501';
    END IF;

    -- 2. Validate action parameter
    IF p_action NOT IN ('approve', 'reject') THEN
        RAISE EXCEPTION 'VALIDATION: Action must be approve or reject' USING ERRCODE = '22023';
    END IF;

    -- 3. Validate rejection reason
    IF p_action = 'reject' AND (p_rejection_reason IS NULL OR trim(p_rejection_reason) = '') THEN
        RAISE EXCEPTION 'VALIDATION: Rejection reason is mandatory when rejecting' USING ERRCODE = '22023';
    END IF;

    -- 4. Concurrency lock on pending row
    SELECT user_id, status INTO v_user_id, v_current_status
    FROM public.cnic_verifications
    WHERE id = p_verification_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Verification record does not exist' USING ERRCODE = 'P0002';
    END IF;

    IF v_current_status <> 'pending' THEN
        RAISE EXCEPTION 'CONFLICT: Verification record has already been reviewed (status: %)', v_current_status USING ERRCODE = '23505';
    END IF;

    v_new_status := CASE WHEN p_action = 'approve' THEN 'approved' ELSE 'rejected' END;

    -- 5. Update cnic_verifications (immutable fields user_id and paths are untouched)
    UPDATE public.cnic_verifications
    SET status = v_new_status,
        reviewed_at = v_reviewed_at,
        reviewed_by = p_admin_id,
        rejection_reason = CASE WHEN p_action = 'reject' THEN trim(p_rejection_reason) ELSE NULL END,
        updated_at = v_reviewed_at
    WHERE id = p_verification_id;

    -- 6. If approved, update profiles.is_verified
    IF v_new_status = 'approved' THEN
        UPDATE public.profiles
        SET is_verified = true,
            updated_at = v_reviewed_at
        WHERE id = v_user_id;
    END IF;

    -- 7. Insert user notification
    v_notification_body := CASE 
        WHEN v_new_status = 'approved' THEN 'Your CNIC verification has been approved by a BloodBridge administrator.'
        ELSE 'Your CNIC verification was rejected: ' || trim(p_rejection_reason)
    END;

    INSERT INTO public.notifications (user_id, kind, body, read, created_at)
    VALUES (v_user_id, 'cnic_verification', v_notification_body, false, v_reviewed_at);

    RETURN jsonb_build_object(
        'id', p_verification_id,
        'user_id', v_user_id,
        'status', v_new_status,
        'reviewed_at', v_reviewed_at
    );
END;
$$;

-- Privileges: Executable exclusively by service_role
REVOKE EXECUTE ON FUNCTION public.admin_review_verification FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_verification TO service_role;
