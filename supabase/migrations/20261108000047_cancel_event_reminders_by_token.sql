-- WEB-FEAT-059: a one-click opt-out for event reminders that stops the
-- reminders, not the newsletter.
--
-- send-event-reminders put the reader's newsletter_subscribers token in the
-- footer and the List-Unsubscribe header. Clicking either ran
-- newsletter_unsubscribe_by_token: it ended the newsletter and, through the
-- 'unsubscribe' row in email_suppressions (20261002000002), every other
-- marketing email too, to stop reminders the reader had set one event at a
-- time. A reader with no newsletter row got no token at all, and the fallback
-- link went to /profile?tab=settings, which has no reminder switch.
--
-- The token is the user_event_reminders.id the email was sent for: a random
-- v4 uuid that only that recipient and their own RLS-scoped reads ever see.
-- Using it cancels that user's UNSENT reminders for that one event, the same
-- DELETE toggle_event_reminder does when the switch on the event page is
-- turned off. Sent rows stay, so the token row survives and a second click
-- (or the mailbox provider retrying the one-click POST) answers success with
-- cancelled = 0 instead of "invalid link". No suppression row is written:
-- the reader's other reminders and the newsletter are left as they were.
--
-- New function only; nothing existing changes. The anon grant is what the
-- /unsubscribe page and the email-unsubscribe edge function (anon key) need,
-- exactly as for newsletter_unsubscribe_by_token.

create or replace function public.cancel_event_reminders_by_token(p_token text)
returns table(success boolean, cancelled integer, event_title text)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  v_user_id uuid;
  v_event_id uuid;
  v_title text;
  v_count integer;
BEGIN
  -- Validate the shape before the cast, so a mangled link is "invalid",
  -- not a 22P02 error.
  IF p_token IS NULL
     OR lower(p_token) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN QUERY SELECT false, 0, NULL::text;
    RETURN;
  END IF;

  SELECT r.user_id, r.event_id
  INTO v_user_id, v_event_id
  FROM public.user_event_reminders r
  WHERE r.id = lower(p_token)::uuid;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, NULL::text;
    RETURN;
  END IF;

  SELECT e.title INTO v_title FROM public.events e WHERE e.id = v_event_id;

  DELETE FROM public.user_event_reminders
  WHERE user_id = v_user_id
    AND event_id = v_event_id
    AND sent_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT true, v_count, v_title;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.cancel_event_reminders_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_event_reminders_by_token(text) TO anon, authenticated, service_role;
