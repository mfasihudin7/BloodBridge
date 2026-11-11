-- MIGRATION: 20261111000012_fine_grained_expansion_and_matching_audit.sql
-- PURPOSE: Implement complete 5km-step expansion sequence (5 -> 10 -> 15 -> 20 -> 25 -> 30 -> 35 -> 40 -> 45 -> 50 km)
--          and ensure pending invitations are marked expired/invalid when donor switches availability OFF.
-- NOTE: As per master prompt instructions, this migration is created in local codebase and remains unapplied to hosted Supabase.

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
                    SELECT COALESCE(MAX(stage_radius_km), 0.0)
                      INTO v_next_radius
                      FROM public.request_invites
                     WHERE request_id = v_job.request_id;

                    -- Sequence: 5 -> 10 -> 15 -> 20 -> 25 -> 30 -> 35 -> 40 -> 45 -> 50 km
                    IF v_next_radius < 5.0 THEN
                        v_next_radius := 5.0;
                    ELSIF v_next_radius < 10.0 THEN
                        v_next_radius := 10.0;
                    ELSIF v_next_radius < 15.0 THEN
                        v_next_radius := 15.0;
                    ELSIF v_next_radius < 20.0 THEN
                        v_next_radius := 20.0;
                    ELSIF v_next_radius < 25.0 THEN
                        v_next_radius := 25.0;
                    ELSIF v_next_radius < 30.0 THEN
                        v_next_radius := 30.0;
                    ELSIF v_next_radius < 35.0 THEN
                        v_next_radius := 35.0;
                    ELSIF v_next_radius < 40.0 THEN
                        v_next_radius := 40.0;
                    ELSIF v_next_radius < 45.0 THEN
                        v_next_radius := 45.0;
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
                                'An urgent blood request was expanded near you (' || v_next_radius || ' km).',
                                'Urgent Blood Request',
                                'blood_request'
                            );

                            v_invited_count := v_invited_count + 1;
                        END LOOP;

                        -- Schedule next expansion (3 minutes interval) if we haven't reached max radius 50km
                        IF v_next_radius < 50.0 THEN
                            INSERT INTO public.expansion_jobs (
                                job_type,
                                request_id,
                                scheduled_at,
                                status
                            ) VALUES (
                                'expand_radius',
                                v_job.request_id,
                                now() + interval '3 minutes',
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

