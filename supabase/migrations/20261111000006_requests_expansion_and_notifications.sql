-- Migration: 20261111000006_requests_expansion_and_notifications.sql
-- Phase 3: Requests expansion, multi-donor coordination, matching engine, and expansion jobs

-- ============================================================
-- SCHEMA EXTENSIONS ON public.requests
-- ============================================================

ALTER TABLE public.requests
    ADD COLUMN IF NOT EXISTS required_donors INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS accepted_donors_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS terminal_reason TEXT;

-- Drop and recreate the status constraint with expanded status set
ALTER TABLE public.requests DROP CONSTRAINT IF EXISTS requests_status_check;
ALTER TABLE public.requests
    ADD CONSTRAINT requests_status_check
    CHECK (status IN (
        'open',
        'accepted',
        'filled',
        'partially_filled',
        'fulfilled',
        'cancelled',
        'expired',
        'no_donors_found'
    ));

-- ============================================================
-- NEW TABLE: public.request_invites
-- ============================================================

CREATE TABLE IF NOT EXISTS public.request_invites (
    id              UUID             NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    request_id      UUID             NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
    donor_id        UUID             NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    stage_radius_km DOUBLE PRECISION NOT NULL,
    invited_at      TIMESTAMPTZ      NOT NULL DEFAULT now(),
    status          TEXT             NOT NULL DEFAULT 'pending'
                                     CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
    CONSTRAINT uq_request_invite_donor UNIQUE (request_id, donor_id)
);

CREATE INDEX IF NOT EXISTS idx_request_invites_donor_status
    ON public.request_invites (donor_id, status);

CREATE INDEX IF NOT EXISTS idx_request_invites_request
    ON public.request_invites (request_id);

-- ============================================================
-- NEW TABLE: public.expansion_jobs
-- ============================================================

CREATE TABLE IF NOT EXISTS public.expansion_jobs (
    id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    job_type         TEXT        NOT NULL CHECK (job_type IN ('expand_radius', 'send_reminders', 'expire_request')),
    request_id       UUID        NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
    scheduled_at     TIMESTAMPTZ NOT NULL,
    status           TEXT        NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    attempt_count    INT         NOT NULL DEFAULT 0,
    lock_acquired_at TIMESTAMPTZ,
    error_code       TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expansion_jobs_status_scheduled
    ON public.expansion_jobs (status, scheduled_at);

-- ============================================================
-- EXTEND public.notifications
-- ============================================================

ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS title TEXT,
    ADD COLUMN IF NOT EXISTS type TEXT CHECK (type IN (
        'blood_request',
        'invitation',
        'acceptance',
        'en_route',
        'arrived',
        'donated',
        'donation_confirmed',
        'donation_disputed',
        'report_resolved',
        'request_cancelled',
        'request_fulfilled',
        'reminder'
    )),
    ADD COLUMN IF NOT EXISTS related_donation_id UUID REFERENCES public.donation_reports(id),
    ADD COLUMN IF NOT EXISTS metadata JSONB;

-- ============================================================
-- RLS POLICIES FOR NEW TABLES
-- ============================================================

ALTER TABLE public.request_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expansion_jobs ENABLE ROW LEVEL SECURITY;

-- request_invites: SELECT for donor or requester; no direct client writes
DROP POLICY IF EXISTS "request_invites_select_participants" ON public.request_invites;
CREATE POLICY "request_invites_select_participants" ON public.request_invites
    FOR SELECT
    TO authenticated
    USING (
        auth.uid() = donor_id
        OR auth.uid() IN (SELECT requester_id FROM public.requests WHERE id = request_id)
    );

-- expansion_jobs: no direct client access, service-role only
-- authenticated and anon get no SELECT/INSERT/UPDATE/DELETE policies

-- ============================================================
-- SECURITY DEFINER RPC: match_donors
-- ============================================================

CREATE OR REPLACE FUNCTION public.match_donors(
    p_request_id UUID,
    p_radius_km  DOUBLE PRECISION
)
RETURNS TABLE (
    donor_id    UUID,
    distance_km DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_req RECORD;
BEGIN
    -- Validate request exists
    SELECT id, requester_id, blood_group, location, status
      INTO v_req
      FROM public.requests
     WHERE id = p_request_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'request_not_found';
    END IF;

    IF v_req.status NOT IN ('open', 'partially_filled') THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        p.id AS donor_id,
        ROUND((extensions.ST_Distance(p.donation_location, v_req.location) / 1000.0)::NUMERIC, 1)::DOUBLE PRECISION AS distance_km
    FROM public.profiles p
    WHERE p.is_verified = true
      AND p.is_available = true
      AND p.location_consent = true
      AND p.donation_location IS NOT NULL
      AND p.in_app_request_notifications_enabled = true
      AND p.id != v_req.requester_id
      AND p.blood_group = v_req.blood_group
      AND (extensions.ST_Distance(p.donation_location, v_req.location) / 1000.0) <= p_radius_km
      -- Not already invited to this request
      AND NOT EXISTS (
          SELECT 1 FROM public.request_invites ri
          WHERE ri.request_id = p_request_id AND ri.donor_id = p.id
      )
      -- No existing response for this request unless declined/withdrawn
      AND NOT EXISTS (
          SELECT 1 FROM public.request_responses rr
          WHERE rr.request_id = p_request_id AND rr.donor_id = p.id
            AND rr.progress NOT IN ('declined', 'withdrawn')
      )
      -- No active conflicting commitment to any other request
      AND NOT EXISTS (
          SELECT 1
          FROM public.request_responses rr2
          JOIN public.requests r2 ON rr2.request_id = r2.id
          WHERE rr2.donor_id = p.id
            AND r2.status IN ('open', 'accepted', 'partially_filled')
            AND rr2.progress IN ('accepted', 'en_route', 'arrived')
      )
    ORDER BY distance_km ASC;
END;
$$;

-- ============================================================
-- SECURITY DEFINER RPC: accept_request
-- ============================================================

CREATE OR REPLACE FUNCTION public.accept_request(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_donor_id UUID;
    v_req      RECORD;
    v_profile  RECORD;
    v_new_count INTEGER;
BEGIN
    v_donor_id := auth.uid();
    IF v_donor_id IS NULL THEN
        RAISE EXCEPTION 'not_authorized';
    END IF;

    -- 1. Lock the request row first (consistent locking order: request -> profile)
    SELECT id, status, required_donors, accepted_donors_count, requester_id, blood_group
      INTO v_req
      FROM public.requests
     WHERE id = p_request_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'not_found';
    END IF;

    IF v_req.status NOT IN ('open', 'accepted', 'partially_filled') THEN
        RAISE EXCEPTION 'request_not_active';
    END IF;

    IF v_req.accepted_donors_count >= v_req.required_donors THEN
        RAISE EXCEPTION 'request_full';
    END IF;

    -- 2. Lock the donor's profile row
    SELECT id, is_verified, is_available, blood_group
      INTO v_profile
      FROM public.profiles
     WHERE id = v_donor_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'donor_not_found';
    END IF;

    IF NOT v_profile.is_verified THEN
        RAISE EXCEPTION 'donor_not_verified';
    END IF;

    IF NOT v_profile.is_available THEN
        RAISE EXCEPTION 'donor_not_available';
    END IF;

    IF v_profile.blood_group != v_req.blood_group THEN
        RAISE EXCEPTION 'blood_group_mismatch';
    END IF;

    -- 3. Check for conflicting active commitments
    IF EXISTS (
        SELECT 1
        FROM public.request_responses rr2
        JOIN public.requests r2 ON rr2.request_id = r2.id
        WHERE rr2.donor_id = v_donor_id
          AND r2.id != p_request_id
          AND r2.status IN ('open', 'accepted', 'partially_filled')
          AND rr2.progress IN ('accepted', 'en_route', 'arrived')
    ) THEN
        RAISE EXCEPTION 'conflicting_commitment';
    END IF;

    -- 4. Record/update the response
    INSERT INTO public.request_responses (request_id, donor_id, progress)
    VALUES (p_request_id, v_donor_id, 'accepted')
    ON CONFLICT (request_id, donor_id)
    DO UPDATE SET progress = 'accepted';

    -- 5. Update invite status if invite exists
    UPDATE public.request_invites
       SET status = 'accepted'
     WHERE request_id = p_request_id
       AND donor_id = v_donor_id;

    -- 6. Update request donor count & status
    v_new_count := v_req.accepted_donors_count + 1;

    IF v_new_count >= v_req.required_donors THEN
        UPDATE public.requests
           SET accepted_donors_count = v_new_count,
               status = 'accepted'
         WHERE id = p_request_id;

        -- Cancel any pending expansion jobs since capacity is filled
        UPDATE public.expansion_jobs
           SET status = 'completed'
         WHERE request_id = p_request_id
           AND status = 'pending';
    ELSE
        UPDATE public.requests
           SET accepted_donors_count = v_new_count,
               status = 'partially_filled'
         WHERE id = p_request_id;
    END IF;

    -- 7. Notify the requester
    INSERT INTO public.notifications (
        user_id,
        kind,
        request_id,
        body,
        title,
        type
    ) VALUES (
        v_req.requester_id,
        'donor_accepted',
        p_request_id,
        'A donor has accepted your blood request.',
        'Donor Accepted',
        'acceptance'
    );

    RETURN jsonb_build_object('accepted', true, 'accepted_donors_count', v_new_count);
END;
$$;

-- ============================================================
-- SECURITY DEFINER FUNCTION: process_expansion_jobs
-- ============================================================

CREATE OR REPLACE FUNCTION public.process_expansion_jobs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_job           RECORD;
    v_processed     INTEGER := 0;
    v_req           RECORD;
    v_donor         RECORD;
    v_next_radius   DOUBLE PRECISION;
    v_invited_count INTEGER;
BEGIN
    -- Recover abandoned running jobs older than 5 minutes
    UPDATE public.expansion_jobs
       SET status = 'pending',
           lock_acquired_at = NULL
     WHERE status = 'running'
       AND lock_acquired_at < (now() - interval '5 minutes');

    -- Claim up to 5 pending jobs atomically
    FOR v_job IN
        SELECT id, job_type, request_id, attempt_count
          FROM public.expansion_jobs
         WHERE status = 'pending'
           AND scheduled_at <= now()
         ORDER BY scheduled_at ASC
         LIMIT 5
           FOR UPDATE SKIP LOCKED
    LOOP
        -- Mark as running
        UPDATE public.expansion_jobs
           SET status = 'running',
               lock_acquired_at = now(),
               attempt_count = attempt_count + 1
         WHERE id = v_job.id;

        BEGIN
            IF v_job.job_type = 'expire_request' THEN
                UPDATE public.requests
                   SET status = 'expired',
                       terminal_reason = 'request_expired'
                 WHERE id = v_job.request_id
                   AND status IN ('open', 'partially_filled');

                UPDATE public.expansion_jobs
                   SET status = 'completed'
                 WHERE id = v_job.id;

            ELSIF v_job.job_type = 'expand_radius' THEN
                SELECT id, requester_id, status, blood_group, required_donors, accepted_donors_count
                  INTO v_req
                  FROM public.requests
                 WHERE id = v_job.request_id;

                IF NOT FOUND OR v_req.status NOT IN ('open', 'partially_filled') THEN
                    -- Request is terminal or completed
                    UPDATE public.expansion_jobs
                       SET status = 'completed'
                     WHERE id = v_job.id;
                ELSE
                    -- Determine next radius from past invites
                    SELECT COALESCE(MAX(stage_radius_km), 5.0)
                      INTO v_next_radius
                      FROM public.request_invites
                     WHERE request_id = v_job.request_id;

                    -- Pick next step: 5 -> 10 -> 15 -> 20 -> 30 -> 50
                    IF v_next_radius < 10.0 THEN
                        v_next_radius := 10.0;
                    ELSIF v_next_radius < 15.0 THEN
                        v_next_radius := 15.0;
                    ELSIF v_next_radius < 20.0 THEN
                        v_next_radius := 20.0;
                    ELSIF v_next_radius < 30.0 THEN
                        v_next_radius := 30.0;
                    ELSIF v_next_radius < 50.0 THEN
                        v_next_radius := 50.0;
                    ELSE
                        v_next_radius := NULL;
                    END IF;

                    IF v_next_radius IS NOT NULL THEN
                        v_invited_count := 0;
                        FOR v_donor IN
                            SELECT donor_id, distance_km
                            FROM public.match_donors(v_job.request_id, v_next_radius)
                            LIMIT 10
                        LOOP
                            INSERT INTO public.request_invites (request_id, donor_id, stage_radius_km, status)
                            VALUES (v_job.request_id, v_donor.donor_id, v_next_radius, 'pending')
                            ON CONFLICT (request_id, donor_id) DO NOTHING;

                            INSERT INTO public.notifications (
                                user_id,
                                kind,
                                request_id,
                                body,
                                title,
                                type
                            ) VALUES (
                                v_donor.donor_id,
                                'blood_request',
                                v_job.request_id,
                                'An urgent blood request was expanded near you.',
                                'Urgent Blood Request',
                                'blood_request'
                            );

                            v_invited_count := v_invited_count + 1;
                        END LOOP;

                        -- Schedule next expansion if we haven't reached max radius
                        IF v_next_radius < 50.0 THEN
                            INSERT INTO public.expansion_jobs (
                                job_type,
                                request_id,
                                scheduled_at,
                                status
                            ) VALUES (
                                'expand_radius',
                                v_job.request_id,
                                now() + interval '5 minutes',
                                'pending'
                            );
                        END IF;
                    END IF;

                    UPDATE public.expansion_jobs
                       SET status = 'completed'
                     WHERE id = v_job.id;
                END IF;

            ELSE
                UPDATE public.expansion_jobs
                   SET status = 'completed'
                 WHERE id = v_job.id;
            END IF;

            v_processed := v_processed + 1;

        EXCEPTION WHEN OTHERS THEN
            UPDATE public.expansion_jobs
               SET status = CASE WHEN attempt_count >= 3 THEN 'failed' ELSE 'pending' END,
                   error_code = SQLERRM,
                   lock_acquired_at = NULL
             WHERE id = v_job.id;
        END;
    END LOOP;

    RETURN v_processed;
END;
$$;

