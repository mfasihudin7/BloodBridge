-- Migration: 20261111000011_community_map_pin_eligibility.sql
-- Unified SQL function for verifying donor eligibility to respond to community map pins.
-- Reuses match_donors rules:
-- 1. Exact blood group match.
-- 2. No is_verified requirement (or per spec: donor location, consent, availability, notifications).
-- 3. ST_DWithin against the maximum radius (50 km).
-- 4. In-app request notifications enabled.
-- 5. No conflicting active commitments.
-- 6. Requester cannot respond to own request.

CREATE OR REPLACE FUNCTION public.check_map_pin_respond_eligibility(
    p_request_id UUID,
    p_donor_id   UUID,
    p_max_radius_km DOUBLE PRECISION DEFAULT 50.0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_req RECORD;
    v_donor RECORD;
    v_distance_km DOUBLE PRECISION;
BEGIN
    -- 1. Validate request
    SELECT id, requester_id, blood_group, location, status
      INTO v_req
      FROM public.requests
     WHERE id = p_request_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('eligible', false, 'reason', 'request_not_found', 'code', 404);
    END IF;

    IF v_req.status NOT IN ('open', 'partially_filled') THEN
        RETURN jsonb_build_object('eligible', false, 'reason', 'request_not_active', 'code', 409);
    END IF;

    IF v_req.requester_id = p_donor_id THEN
        RETURN jsonb_build_object('eligible', false, 'reason', 'requester_cannot_respond', 'code', 403);
    END IF;

    -- 2. Validate donor profile
    SELECT id, is_available, location_consent, donation_location, in_app_request_notifications_enabled, blood_group
      INTO v_donor
      FROM public.profiles
     WHERE id = p_donor_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('eligible', false, 'reason', 'donor_not_found', 'code', 404);
    END IF;

    IF NOT v_donor.is_available THEN
        RETURN jsonb_build_object('eligible', false, 'reason', 'donor_not_available', 'code', 403);
    END IF;

    IF NOT v_donor.location_consent OR v_donor.donation_location IS NULL THEN
        RETURN jsonb_build_object('eligible', false, 'reason', 'donor_no_location_consent', 'code', 403);
    END IF;

    IF NOT v_donor.in_app_request_notifications_enabled THEN
        RETURN jsonb_build_object('eligible', false, 'reason', 'donor_notifications_disabled', 'code', 403);
    END IF;

    IF v_donor.blood_group != v_req.blood_group THEN
        RETURN jsonb_build_object('eligible', false, 'reason', 'blood_group_mismatch', 'code', 409);
    END IF;

    -- 3. Check distance within max radius using ST_DWithin (geography, meters)
    IF NOT extensions.ST_DWithin(v_donor.donation_location, v_req.location, p_max_radius_km * 1000.0) THEN
        v_distance_km := ROUND((extensions.ST_Distance(v_donor.donation_location, v_req.location) / 1000.0)::NUMERIC, 1)::DOUBLE PRECISION;
        RETURN jsonb_build_object('eligible', false, 'reason', 'outside_max_radius', 'code', 403, 'distance_km', v_distance_km);
    END IF;

    -- 4. Check for conflicting commitments
    IF EXISTS (
        SELECT 1
        FROM public.request_responses rr2
        JOIN public.requests r2 ON rr2.request_id = r2.id
        WHERE rr2.donor_id = p_donor_id
          AND r2.id != p_request_id
          AND r2.status IN ('open', 'accepted', 'partially_filled')
          AND rr2.progress IN ('accepted', 'en_route', 'arrived')
    ) THEN
        RETURN jsonb_build_object('eligible', false, 'reason', 'conflicting_commitment', 'code', 409);
    END IF;

    -- 5. Auto-create or ensure invitation exists
    INSERT INTO public.request_invites (request_id, donor_id, stage_radius_km, status)
    VALUES (p_request_id, p_donor_id, p_max_radius_km, 'pending')
    ON CONFLICT (request_id, donor_id) DO NOTHING;

    RETURN jsonb_build_object('eligible', true);
END;
$$;

