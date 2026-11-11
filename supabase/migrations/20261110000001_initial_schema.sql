-- ==============================================================================
-- BloodBridge Initial Schema Migration (Phase B0)
-- Conforms to INTEGRATION_CONTRACT.md and BACKEND_PLAN.md
-- ==============================================================================

-- 1. Enable PostGIS extension for spatial queries
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- Ensure public search_path can resolve PostGIS types
ALTER DATABASE postgres SET search_path TO public, extensions;

-- 2. Profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    blood_group TEXT NOT NULL CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
    age INTEGER NOT NULL CHECK (age >= 18 AND age <= 100),
    weight_kg NUMERIC NOT NULL CHECK (weight_kg >= 45),
    height_cm NUMERIC NOT NULL CHECK (height_cm >= 100),
    phone TEXT NOT NULL,
    address TEXT,
    cnic_last4 TEXT CHECK (cnic_last4 IS NULL OR length(cnic_last4) = 4),
    is_available BOOLEAN NOT NULL DEFAULT true,
    last_donated DATE,
    donation_count INTEGER NOT NULL DEFAULT 0 CHECK (donation_count >= 0),
    is_admin BOOLEAN NOT NULL DEFAULT false,
    area extensions.geography(Point, 4326),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for spatial matching of donors
CREATE INDEX IF NOT EXISTS idx_profiles_area ON public.profiles USING GIST (area);
CREATE INDEX IF NOT EXISTS idx_profiles_matching ON public.profiles (blood_group, is_available);

-- 3. Requests table
CREATE TABLE IF NOT EXISTS public.requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    blood_group TEXT NOT NULL CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
    units INTEGER NOT NULL CHECK (units > 0 AND units <= 20),
    units_filled INTEGER NOT NULL DEFAULT 0 CHECK (units_filled >= 0 AND units_filled <= units),
    hospital TEXT NOT NULL,
    urgency TEXT NOT NULL CHECK (urgency IN ('critical', 'urgent', 'planned')),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'filled', 'fulfilled', 'cancelled', 'expired')),
    location extensions.geography(Point, 4326) NOT NULL,
    note TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for spatial queries on map requests
CREATE INDEX IF NOT EXISTS idx_requests_location ON public.requests USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_requests_status ON public.requests (status, urgency);

-- 4. Request Responses table
CREATE TABLE IF NOT EXISTS public.request_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
    donor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    progress TEXT NOT NULL DEFAULT 'pending' CHECK (progress IN ('pending', 'accepted', 'en_route', 'arrived', 'donated', 'declined', 'withdrawn')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_request_donor UNIQUE (request_id, donor_id)
);

CREATE INDEX IF NOT EXISTS idx_request_responses_request ON public.request_responses (request_id);
CREATE INDEX IF NOT EXISTS idx_request_responses_donor ON public.request_responses (donor_id);

-- 5. Status Events table
CREATE TABLE IF NOT EXISTS public.status_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_role TEXT NOT NULL CHECK (actor_role IN ('requester', 'donor', 'system')),
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_status_events_request ON public.status_events (request_id, created_at);

-- 6. Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    request_id UUID REFERENCES public.requests(id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications (user_id, read);

-- ==============================================================================
-- Triggers: Protect server-controlled profile fields
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Only allow service_role to update donation_count or is_admin
    IF (current_user != 'service_role') THEN
        IF (NEW.donation_count IS DISTINCT FROM OLD.donation_count) THEN
            RAISE EXCEPTION 'Cannot modify donation_count directly' USING ERRCODE = '42501';
        END IF;
        IF (NEW.is_admin IS DISTINCT FROM OLD.is_admin) THEN
            RAISE EXCEPTION 'Cannot modify is_admin directly' USING ERRCODE = '42501';
        END IF;
    END IF;

    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_fields();

-- ==============================================================================
-- Row Level Security (RLS) Policies — Default Deny
-- ==============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 1. Profiles Policies
-- Users can only read their own profile row (prevents donor location & personal data leakage)
CREATE POLICY "profiles_select_own" ON public.profiles
    FOR SELECT TO authenticated
    USING (auth.uid() = id);

-- Users can insert their own profile upon signup
CREATE POLICY "profiles_insert_own" ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = id);

-- Users can update their own profile (trigger prevents updating protected fields)
CREATE POLICY "profiles_update_own" ON public.profiles
    FOR UPDATE TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- 2. Requests Policies
-- Authenticated users can view open requests (note: requests contains no contact info)
CREATE POLICY "requests_select_authenticated" ON public.requests
    FOR SELECT TO authenticated
    USING (true);

-- Authenticated users can create requests for themselves
CREATE POLICY "requests_insert_own" ON public.requests
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = requester_id);

-- Requesters can update their own requests
CREATE POLICY "requests_update_own" ON public.requests
    FOR UPDATE TO authenticated
    USING (auth.uid() = requester_id)
    WITH CHECK (auth.uid() = requester_id);

-- 3. Request Responses Policies
-- Donors and Requesters can view responses for their requests
CREATE POLICY "responses_select_participants" ON public.request_responses
    FOR SELECT TO authenticated
    USING (
        auth.uid() = donor_id OR
        auth.uid() IN (SELECT requester_id FROM public.requests WHERE id = request_responses.request_id)
    );

-- Donors can insert their own responses
CREATE POLICY "responses_insert_donor" ON public.request_responses
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = donor_id);

-- Donors can update their progress; requesters can update response status
CREATE POLICY "responses_update_participants" ON public.request_responses
    FOR UPDATE TO authenticated
    USING (
        auth.uid() = donor_id OR
        auth.uid() IN (SELECT requester_id FROM public.requests WHERE id = request_responses.request_id)
    );

-- 4. Status Events Policies
-- Participants can view timeline events
CREATE POLICY "status_events_select" ON public.status_events
    FOR SELECT TO authenticated
    USING (
        auth.uid() IN (SELECT requester_id FROM public.requests WHERE id = status_events.request_id) OR
        auth.uid() IN (SELECT donor_id FROM public.request_responses WHERE request_id = status_events.request_id)
    );

-- 5. Notifications Policies
-- Users can only view and manage their own notifications
CREATE POLICY "notifications_select_own" ON public.notifications
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "notifications_update_own" ON public.notifications
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ==============================================================================
-- RPC Functions (Contract Section 4 & 5)
-- ==============================================================================

-- 1. requests_in_bounds: returns active pins within bounding box (no contact details)
CREATE OR REPLACE FUNCTION public.requests_in_bounds(
    min_lat DOUBLE PRECISION,
    min_lng DOUBLE PRECISION,
    max_lat DOUBLE PRECISION,
    max_lng DOUBLE PRECISION,
    p_blood_group TEXT DEFAULT NULL,
    p_urgency TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    blood_group TEXT,
    units INTEGER,
    units_filled INTEGER,
    hospital TEXT,
    urgency TEXT,
    status TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    created_at TIMESTAMPTZ,
    distance_m DOUBLE PRECISION
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    SELECT
        r.id,
        r.blood_group,
        r.units,
        r.units_filled,
        r.hospital,
        r.urgency,
        r.status,
        extensions.ST_Y(r.location::extensions.geometry) AS lat,
        extensions.ST_X(r.location::extensions.geometry) AS lng,
        r.created_at,
        0::DOUBLE PRECISION AS distance_m
    FROM public.requests r
    WHERE r.status = 'open'
      AND (p_blood_group IS NULL OR r.blood_group = p_blood_group)
      AND (p_urgency IS NULL OR r.urgency = p_urgency)
      AND extensions.ST_Contains(
            extensions.ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326),
            r.location::extensions.geometry
          )
    LIMIT 200;
$$;

-- 2. donor_density: returns fuzzed grid density, suppressing cells under 5 donors
CREATE OR REPLACE FUNCTION public.donor_density(
    min_lat DOUBLE PRECISION,
    min_lng DOUBLE PRECISION,
    max_lat DOUBLE PRECISION,
    max_lng DOUBLE PRECISION
)
RETURNS TABLE (
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    SELECT
        round(extensions.ST_Y(p.area::extensions.geometry)::numeric, 2)::DOUBLE PRECISION AS lat,
        round(extensions.ST_X(p.area::extensions.geometry)::numeric, 2)::DOUBLE PRECISION AS lng,
        count(*) AS count
    FROM public.profiles p
    WHERE p.is_available = true
      AND p.area IS NOT NULL
      AND extensions.ST_Contains(
            extensions.ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326),
            p.area::extensions.geometry
          )
    GROUP BY 1, 2
    HAVING count(*) >= 5;
$$;

-- 3. reveal_contact: returns contact info only when an accepted response links the two users
CREATE OR REPLACE FUNCTION public.reveal_contact(
    p_request_id UUID,
    p_other_user_id UUID
)
RETURNS TABLE (
    full_name TEXT,
    phone TEXT,
    address TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_is_authorized BOOLEAN := false;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
    END IF;

    -- Case 1: Caller is Requester, other_user is accepted Donor
    SELECT EXISTS (
        SELECT 1
        FROM public.requests req
        JOIN public.request_responses res ON res.request_id = req.id
        WHERE req.id = p_request_id
          AND req.requester_id = v_caller_id
          AND res.donor_id = p_other_user_id
          AND res.progress IN ('accepted', 'en_route', 'arrived', 'donated')
    ) INTO v_is_authorized;

    -- Case 2: Caller is accepted Donor, other_user is Requester
    IF NOT v_is_authorized THEN
        SELECT EXISTS (
            SELECT 1
            FROM public.requests req
            JOIN public.request_responses res ON res.request_id = req.id
            WHERE req.id = p_request_id
              AND req.requester_id = p_other_user_id
              AND res.donor_id = v_caller_id
              AND res.progress IN ('accepted', 'en_route', 'arrived', 'donated')
        ) INTO v_is_authorized;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT p.full_name, p.phone, p.address
    FROM public.profiles p
    WHERE p.id = p_other_user_id;
END;
$$;

