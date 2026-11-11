-- Migration: 20261111000008_thalassemia_and_community_map.sql
-- Phase 4: Thalassemia recurring blood requirements, donor circles, and community map foundations

-- ============================================================
-- NEW TABLE: public.scheduled_requirements
-- ============================================================

CREATE TABLE IF NOT EXISTS public.scheduled_requirements (
    id                    UUID                     NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    requester_id          UUID                     NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    blood_group           TEXT                     NOT NULL,
    required_donors       INT                      NOT NULL DEFAULT 1 CHECK (required_donors > 0),
    scheduled_date        DATE                     NOT NULL,
    location              extensions.geography(Point, 4326),
    location_lat          DOUBLE PRECISION,
    location_lng          DOUBLE PRECISION,
    notes                 TEXT,
    status                TEXT                     NOT NULL DEFAULT 'open'
                                                   CHECK (status IN ('open', 'partially_filled', 'filled', 'cancelled', 'expired')),
    accepted_donors_count INT                      NOT NULL DEFAULT 0,
    created_at            TIMESTAMPTZ              NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_req_status_date
    ON public.scheduled_requirements (status, scheduled_date);

CREATE INDEX IF NOT EXISTS idx_scheduled_req_requester
    ON public.scheduled_requirements (requester_id);

-- ============================================================
-- NEW TABLE: public.donor_circles
-- ============================================================

CREATE TABLE IF NOT EXISTS public.donor_circles (
    id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    requirement_id UUID        NOT NULL UNIQUE REFERENCES public.scheduled_requirements(id) ON DELETE CASCADE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- NEW TABLE: public.circle_members
-- ============================================================

CREATE TABLE IF NOT EXISTS public.circle_members (
    id           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    circle_id    UUID        NOT NULL REFERENCES public.donor_circles(id) ON DELETE CASCADE,
    donor_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status       TEXT        NOT NULL DEFAULT 'invited'
                             CHECK (status IN ('invited', 'accepted', 'declined', 'cancelled', 'completed')),
    invited_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    responded_at TIMESTAMPTZ,
    CONSTRAINT uq_circle_member_donor UNIQUE (circle_id, donor_id)
);

CREATE INDEX IF NOT EXISTS idx_circle_members_donor_status
    ON public.circle_members (donor_id, status);

-- ============================================================
-- RLS POLICIES
-- ============================================================

ALTER TABLE public.scheduled_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donor_circles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circle_members ENABLE ROW LEVEL SECURITY;

-- scheduled_requirements: SELECT allowed for authenticated users
DROP POLICY IF EXISTS "scheduled_requirements_select" ON public.scheduled_requirements;
CREATE POLICY "scheduled_requirements_select" ON public.scheduled_requirements
    FOR SELECT
    TO authenticated
    USING (true);

-- donor_circles: SELECT for circle members or requirement owner
DROP POLICY IF EXISTS "donor_circles_select" ON public.donor_circles;
CREATE POLICY "donor_circles_select" ON public.donor_circles
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.circle_members cm
            WHERE cm.circle_id = id AND cm.donor_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.scheduled_requirements sr
            WHERE sr.id = requirement_id AND sr.requester_id = auth.uid()
        )
    );

-- circle_members: SELECT for self or requirement owner
DROP POLICY IF EXISTS "circle_members_select" ON public.circle_members;
CREATE POLICY "circle_members_select" ON public.circle_members
    FOR SELECT
    TO authenticated
    USING (
        donor_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.donor_circles dc
            JOIN public.scheduled_requirements sr ON sr.id = dc.requirement_id
            WHERE dc.id = circle_id AND sr.requester_id = auth.uid()
        )
    );

-- ============================================================
-- SECURITY DEFINER RPC: accept_circle_invitation
-- ============================================================

CREATE OR REPLACE FUNCTION public.accept_circle_invitation(p_circle_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_donor_id       UUID;
    v_member         RECORD;
    v_req            RECORD;
    v_profile        RECORD;
    v_new_accepted   INT;
BEGIN
    v_donor_id := auth.uid();
    IF v_donor_id IS NULL THEN
        RAISE EXCEPTION 'not_authorized';
    END IF;

    -- 1. Lock circle_members row
    SELECT cm.id, cm.status, dc.requirement_id
      INTO v_member
      FROM public.circle_members cm
      JOIN public.donor_circles dc ON dc.id = cm.circle_id
     WHERE cm.circle_id = p_circle_id
       AND cm.donor_id = v_donor_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'not_authorized';
    END IF;

    IF v_member.status != 'invited' THEN
        RAISE EXCEPTION 'already_responded';
    END IF;

    -- 2. Lock the requirement row
    SELECT id, requester_id, scheduled_date, required_donors, accepted_donors_count, status
      INTO v_req
      FROM public.scheduled_requirements
     WHERE id = v_member.requirement_id
       FOR UPDATE;

    IF v_req.status NOT IN ('open', 'partially_filled') THEN
        RAISE EXCEPTION 'requirement_not_active';
    END IF;

    -- 3. Lock donor profile row
    SELECT id, is_verified, is_available
      INTO v_profile
      FROM public.profiles
     WHERE id = v_donor_id
       FOR UPDATE;

    -- 4. Check for conflicting scheduled commitments on the same date
    IF EXISTS (
        SELECT 1
        FROM public.circle_members cm2
        JOIN public.donor_circles dc2 ON dc2.id = cm2.circle_id
        JOIN public.scheduled_requirements sr2 ON sr2.id = dc2.requirement_id
        WHERE cm2.donor_id = v_donor_id
          AND cm2.status = 'accepted'
          AND sr2.scheduled_date = v_req.scheduled_date
          AND cm2.circle_id != p_circle_id
    ) THEN
        RAISE EXCEPTION 'schedule_conflict';
    END IF;

    -- 5. Update circle member status
    UPDATE public.circle_members
       SET status = 'accepted',
           responded_at = now()
     WHERE id = v_member.id;

    -- 6. Update scheduled requirement counts
    v_new_accepted := v_req.accepted_donors_count + 1;
    UPDATE public.scheduled_requirements
       SET accepted_donors_count = v_new_accepted,
           status = CASE WHEN v_new_accepted >= v_req.required_donors THEN 'filled' ELSE 'partially_filled' END
     WHERE id = v_req.id;

    -- 7. Notify requester
    INSERT INTO public.notifications (
        user_id,
        kind,
        body,
        title,
        type
    ) VALUES (
        v_req.requester_id,
        'circle_donor_accepted',
        'A donor has confirmed for your scheduled blood requirement.',
        'Scheduled Donor Accepted',
        'acceptance'
    );

    RETURN jsonb_build_object('accepted', true, 'accepted_donors_count', v_new_accepted);
END;
$$;

-- ============================================================
-- SECURITY DEFINER RPC: decline_circle_invitation
-- ============================================================

CREATE OR REPLACE FUNCTION public.decline_circle_invitation(p_circle_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_donor_id UUID;
    v_member   RECORD;
BEGIN
    v_donor_id := auth.uid();
    IF v_donor_id IS NULL THEN
        RAISE EXCEPTION 'not_authorized';
    END IF;

    SELECT cm.id, cm.status
      INTO v_member
      FROM public.circle_members cm
     WHERE cm.circle_id = p_circle_id
       AND cm.donor_id = v_donor_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'not_authorized';
    END IF;

    IF v_member.status != 'invited' THEN
        RAISE EXCEPTION 'already_responded';
    END IF;

    UPDATE public.circle_members
       SET status = 'declined',
           responded_at = now()
     WHERE id = v_member.id;

    RETURN jsonb_build_object('declined', true);
END;
$$;

