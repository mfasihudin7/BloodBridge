-- Migration: 20261111000009_rate_limits_and_security_hardening.sql
-- Phase 4: API rate limits table and atomic checking function

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
    id           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id      UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    action       TEXT        NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    count        INT         NOT NULL DEFAULT 1,
    CONSTRAINT uq_api_rate_limits_window UNIQUE (user_id, action, window_start)
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_lookup
    ON public.api_rate_limits (user_id, action, window_start);

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

-- No direct client access (service role / security definer only)

CREATE OR REPLACE FUNCTION public.check_rate_limit(
    p_user_id        UUID,
    p_action         TEXT,
    p_max            INT,
    p_window_minutes INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_window_start TIMESTAMPTZ;
    v_count        INT;
BEGIN
    -- Calculate window aligned to p_window_minutes
    v_window_start := date_trunc('minute', now()) - make_interval(mins := (extract(minute FROM now())::int % p_window_minutes));

    INSERT INTO public.api_rate_limits (user_id, action, window_start, count)
    VALUES (p_user_id, p_action, v_window_start, 1)
    ON CONFLICT (user_id, action, window_start)
    DO UPDATE SET count = public.api_rate_limits.count + 1
    RETURNING count INTO v_count;

    RETURN v_count <= p_max;
END;
$$;

