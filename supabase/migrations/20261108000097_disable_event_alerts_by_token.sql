-- WEB-FEAT-073: a one-click opt-out for saved-search alert emails
-- that stops the alerts, not the newsletter.
--
-- saved-search-alerts put the reader's newsletter_subscribers token in the
-- footer and the List-Unsubscribe header, the same mistake WEB-FEAT-059 fixed
-- for event reminders. Pressing the inbox Unsubscribe button on an alert ran
-- newsletter_unsubscribe_by_token: it ended the newsletter and, through the
-- 'unsubscribe' row in email_suppressions (20261002000002), every other
-- marketing email. A reader with no newsletter row got no token, so no
-- one-click opt-out at all.
--
-- The token is a saved_searches.id of the recipient's: a random uuid that
-- saved_searches' own-row RLS shows to nobody else. Using it sets
-- user_email_preferences.event_alerts_enabled = false for the search's owner,
-- the master switch on /dashboard?tab=saved-searches, which the sender already
-- honours and the reader can turn back on there. The search rows, the
-- newsletter and every other email are left as they were. No suppression row
-- is written.
--
-- A missing preferences row is created with weekly_digest_enabled = false:
-- that column defaults to true, and "no row" means "no digest" to
-- get_weekly_digest_recipients, so a plain insert would subscribe someone to
-- the digest in the act of unsubscribing them from alerts.
--
-- A second click, or the mailbox provider retrying the one-click POST, answers
-- success with already_disabled = true. New function only; nothing existing
-- changes. The anon grant is what the /unsubscribe page and the
-- email-unsubscribe edge function (anon key) need, as for
-- cancel_event_reminders_by_token.

create or replace function public.disable_event_alerts_by_token(p_token text)
returns table(success boolean, already_disabled boolean)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  v_user_id uuid;
  v_was_enabled boolean;
BEGIN
  -- Validate the shape before the cast, so a mangled link is "invalid",
  -- not a 22P02 error.
  IF p_token IS NULL
     OR lower(p_token) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN QUERY SELECT false, false;
    RETURN;
  END IF;

  SELECT s.user_id INTO v_user_id
  FROM public.saved_searches s
  WHERE s.id = lower(p_token)::uuid;

  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT false, false;
    RETURN;
  END IF;

  -- No row reads as enabled, which is what the sender and the dashboard assume.
  SELECT coalesce(p.event_alerts_enabled, true) INTO v_was_enabled
  FROM public.user_email_preferences p
  WHERE p.user_id = v_user_id;
  v_was_enabled := coalesce(v_was_enabled, true);

  INSERT INTO public.user_email_preferences (user_id, event_alerts_enabled, weekly_digest_enabled)
  VALUES (v_user_id, false, false)
  ON CONFLICT (user_id) DO UPDATE
    SET event_alerts_enabled = false,
        updated_at = now();

  RETURN QUERY SELECT true, NOT v_was_enabled;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.disable_event_alerts_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.disable_event_alerts_by_token(text) TO anon, authenticated, service_role;
