-- get_pending_reminders and mark_reminder_sent are callable by anyone.
--
-- Both are SECURITY DEFINER, and 20251110000001 only ever GRANTed EXECUTE to
-- service_role. A GRANT adds a privilege; it removes none. Postgres gives
-- EXECUTE on every new function to PUBLIC, and Supabase's default privileges
-- add anon and authenticated on top, so both functions have been reachable
-- through PostgREST with the anon key that ships in the client bundle:
--
--   get_pending_reminders   joins auth.users and returns user_email next to
--                           the event title, venue and start time. Anyone could
--                           list who is going to what, and their address.
--   mark_reminder_sent      updates any reminder by id to any status. Anyone
--                           could suppress another user's reminders.
--
-- The only caller of either is send-event-reminders (index.ts:72, :246, :256),
-- which uses the service-role key. grep finds no call in src/, ios/ or
-- android/. Revoking from PUBLIC, anon and authenticated therefore denies
-- nothing a shipped client does, so it is not a compat-breaking tightening.
--
-- mark_reminder_sent also never pinned search_path, which a SECURITY DEFINER
-- function must. get_pending_reminders was pinned by 20260830000001.
--
-- Signatures, bodies and return types are unchanged.

REVOKE EXECUTE ON FUNCTION public.get_pending_reminders(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_reminder_sent(uuid, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_pending_reminders(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_reminder_sent(uuid, text, text) TO service_role;

ALTER FUNCTION public.mark_reminder_sent(uuid, text, text) SET search_path = public, pg_temp;
