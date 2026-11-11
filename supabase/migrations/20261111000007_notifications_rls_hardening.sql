-- Migration: 20261111000007_notifications_rls_hardening.sql
-- Hardens notifications table: locks down direct client modifications,
-- enforces that ordinary users can only mark notifications as read via dedicated RPCs.

-- Revoke direct mutation permissions on notifications from public roles
REVOKE INSERT, UPDATE, DELETE ON public.notifications FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.notifications FROM anon;

-- Ensure SELECT policy allows users to view only their own notifications
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Drop any potentially permissive UPDATE policies
DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
DROP POLICY IF EXISTS "allow_users_to_update_own_notifications" ON public.notifications;

-- ============================================================
-- SECURITY DEFINER RPCs for notification actions
-- ============================================================

CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.notifications
       SET read = true
     WHERE id = p_notification_id
       AND user_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.notifications
       SET read = true
     WHERE user_id = auth.uid()
       AND read = false;
END;
$$;

