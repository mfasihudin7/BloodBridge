-- Migration: 20261111000010_enable_pg_cron_scheduler.sql
-- Enables pg_cron extension and registers scheduled recurring radius expansion and expiration.
-- Note: On hosted Supabase, pg_cron extension is pre-installed in pg_catalog with its tables in the `cron` schema.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage on cron schema to postgres
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
        GRANT USAGE ON SCHEMA cron TO postgres;
    END IF;
END $$;

-- Unschedule existing job if already registered to avoid duplicates
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'cron' AND table_name = 'job'
    ) THEN
        PERFORM cron.unschedule('process-expansion-jobs-minutely')
        WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-expansion-jobs-minutely');

        -- Schedule to run process_expansion_jobs() every minute
        PERFORM cron.schedule(
            'process-expansion-jobs-minutely',
            '* * * * *',
            $cron$SELECT public.process_expansion_jobs()$cron$
        );
    END IF;
END $$;
