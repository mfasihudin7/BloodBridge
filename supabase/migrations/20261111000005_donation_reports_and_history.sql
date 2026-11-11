-- Migration: 20261111000005_donation_reports_and_history.sql
-- Creates donation_reports, donation_history, app_config tables with RLS and
-- SECURITY DEFINER functions for donation confirmation/dispute/admin-resolution.

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.donation_reports (
    id                     UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    request_id             UUID        NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
    donor_id               UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    recipient_id           UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    outcome                TEXT        NOT NULL CHECK (outcome IN ('donated', 'not_donated')),
    reported_donation_date DATE        NOT NULL,
    feedback               TEXT,
    status                 TEXT        NOT NULL DEFAULT 'awaiting_donor_confirmation'
                                       CHECK (status IN (
                                           'awaiting_donor_confirmation',
                                           'confirmed',
                                           'disputed',
                                           'resolved_confirmed',
                                           'resolved_rejected'
                                       )),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at           TIMESTAMPTZ,
    confirmation_source    TEXT,
    dispute_reason         TEXT,
    resolution_note        TEXT,
    resolved_by            UUID        REFERENCES public.profiles(id),
    resolved_at            TIMESTAMPTZ,
    CONSTRAINT uq_donation_report_request_donor UNIQUE (request_id, donor_id)
);

CREATE TABLE IF NOT EXISTS public.donation_history (
    id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    donor_id      UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    report_id     UUID        NOT NULL REFERENCES public.donation_reports(id) ON DELETE CASCADE,
    donation_date DATE        NOT NULL,
    confirmed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    source        TEXT        NOT NULL CHECK (source IN ('donor_confirmed', 'admin_resolved')),
    CONSTRAINT uq_donation_history_report UNIQUE (report_id)
);

CREATE TABLE IF NOT EXISTS public.app_config (
    key         TEXT        PRIMARY KEY,
    value       JSONB       NOT NULL,
    description TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.app_config (key, value, description) VALUES
    ('donation_interval_days', 'null'::jsonb,         'Min days between confirmed donations; null=no limit'),
    ('radius_steps_km',        '[5,10,15,20,30,50]'::jsonb, 'Expansion radius steps in km'),
    ('expansion_wait_seconds', '300'::jsonb,          'Seconds to wait between radius expansions'),
    ('max_donors_per_stage',   '10'::jsonb,           'Max donors to invite per stage'),
    ('request_expiry_hours',   '24'::jsonb,           'Hours until an open request expires')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.donation_reports  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donation_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config        ENABLE ROW LEVEL SECURITY;

-- donation_reports: SELECT for donor or recipient; no direct writes
DROP POLICY IF EXISTS "donation_reports_select_participants" ON public.donation_reports;
CREATE POLICY "donation_reports_select_participants" ON public.donation_reports
    FOR SELECT
    TO authenticated
    USING (auth.uid() = donor_id OR auth.uid() = recipient_id);

-- donation_history: SELECT for donor only; no direct writes
DROP POLICY IF EXISTS "donation_history_select_donor" ON public.donation_history;
CREATE POLICY "donation_history_select_donor" ON public.donation_history
    FOR SELECT
    TO authenticated
    USING (auth.uid() = donor_id);

-- app_config: SELECT for authenticated; no writes for client roles
DROP POLICY IF EXISTS "app_config_select_authenticated" ON public.app_config;
CREATE POLICY "app_config_select_authenticated" ON public.app_config
    FOR SELECT
    TO authenticated
    USING (true);

-- ============================================================
-- SECURITY DEFINER FUNCTIONS
-- ============================================================

-- ----------------------------------------------------------------
-- confirm_donation_report(p_report_id UUID) RETURNS JSONB
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_donation_report(p_report_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id  UUID;
    v_report     RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'not_authorized';
    END IF;

    -- Lock report row
    SELECT *
      INTO v_report
      FROM public.donation_reports
     WHERE id = p_report_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'not_found';
    END IF;

    -- Caller must be the donor
    IF v_report.donor_id <> v_caller_id THEN
        RAISE EXCEPTION 'not_authorized';
    END IF;

    -- Validate status
    IF v_report.status <> 'awaiting_donor_confirmation' THEN
        RAISE EXCEPTION 'invalid_status';
    END IF;

    -- Update the report
    UPDATE public.donation_reports
       SET status              = 'confirmed',
           confirmed_at        = now(),
           confirmation_source = 'donor'
     WHERE id = p_report_id;

    -- Lock and update donor profile
    PERFORM 1
      FROM public.profiles
     WHERE id = v_report.donor_id
       FOR UPDATE;

    UPDATE public.profiles
       SET last_donated   = v_report.reported_donation_date,
           donation_count = donation_count + 1,
           updated_at     = now()
     WHERE id = v_report.donor_id;

    -- Record in donation_history
    INSERT INTO public.donation_history (donor_id, report_id, donation_date, confirmed_at, source)
    VALUES (v_report.donor_id, p_report_id, v_report.reported_donation_date, now(), 'donor_confirmed')
    ON CONFLICT (report_id) DO NOTHING;

    -- Notify recipient
    INSERT INTO public.notifications (user_id, kind, request_id, body)
    VALUES (v_report.recipient_id, 'donation_confirmed', v_report.request_id, 'The donor has confirmed the donation.');

    RETURN jsonb_build_object('confirmed', true);
END;
$$;

-- ----------------------------------------------------------------
-- dispute_donation_report(p_report_id UUID, p_reason TEXT) RETURNS JSONB
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dispute_donation_report(p_report_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_report    RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'not_authorized';
    END IF;

    -- Lock report row
    SELECT *
      INTO v_report
      FROM public.donation_reports
     WHERE id = p_report_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'not_found';
    END IF;

    -- Caller must be the donor
    IF v_report.donor_id <> v_caller_id THEN
        RAISE EXCEPTION 'not_authorized';
    END IF;

    -- Validate status
    IF v_report.status NOT IN ('awaiting_donor_confirmation') THEN
        RAISE EXCEPTION 'invalid_status';
    END IF;

    -- Update the report
    UPDATE public.donation_reports
       SET status         = 'disputed',
           dispute_reason = p_reason
     WHERE id = p_report_id;

    RETURN jsonb_build_object('disputed', true);
END;
$$;

-- ----------------------------------------------------------------
-- admin_resolve_report(p_report_id UUID, p_resolution TEXT, p_note TEXT) RETURNS JSONB
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_resolve_report(
    p_report_id  UUID,
    p_resolution TEXT,
    p_note       TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_is_admin  BOOLEAN;
    v_report    RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'not_authorized';
    END IF;

    -- Check admin
    SELECT is_admin
      INTO v_is_admin
      FROM public.profiles
     WHERE id = v_caller_id;

    IF v_is_admin IS NOT TRUE THEN
        RAISE EXCEPTION 'not_authorized';
    END IF;

    -- Validate resolution value
    IF p_resolution NOT IN ('confirmed', 'rejected') THEN
        RAISE EXCEPTION 'invalid_resolution';
    END IF;

    -- Lock report row
    SELECT *
      INTO v_report
      FROM public.donation_reports
     WHERE id = p_report_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'not_found';
    END IF;

    -- Validate status
    IF v_report.status NOT IN ('disputed', 'awaiting_donor_confirmation') THEN
        RAISE EXCEPTION 'invalid_status';
    END IF;

    IF p_resolution = 'confirmed' THEN
        UPDATE public.donation_reports
           SET status          = 'resolved_confirmed',
               resolution_note = p_note,
               resolved_by     = v_caller_id,
               resolved_at     = now()
         WHERE id = p_report_id;

        -- Lock and update donor profile
        PERFORM 1
          FROM public.profiles
         WHERE id = v_report.donor_id
           FOR UPDATE;

        UPDATE public.profiles
           SET donation_count = donation_count + 1,
               last_donated   = v_report.reported_donation_date,
               updated_at     = now()
         WHERE id = v_report.donor_id;

        -- Record in donation_history
        INSERT INTO public.donation_history (donor_id, report_id, donation_date, confirmed_at, source)
        VALUES (v_report.donor_id, p_report_id, v_report.reported_donation_date, now(), 'admin_resolved')
        ON CONFLICT (report_id) DO NOTHING;

        RETURN jsonb_build_object('resolved', true, 'resolution', 'confirmed');

    ELSE
        UPDATE public.donation_reports
           SET status          = 'resolved_rejected',
               resolution_note = p_note,
               resolved_by     = v_caller_id,
               resolved_at     = now()
         WHERE id = p_report_id;

        RETURN jsonb_build_object('resolved', true, 'resolution', 'rejected');
    END IF;
END;
$$;

-- Grant EXECUTE to authenticated users (functions enforce their own authz)
GRANT EXECUTE ON FUNCTION public.confirm_donation_report(UUID)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispute_donation_report(UUID, TEXT)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_report(UUID, TEXT, TEXT)       TO authenticated;
