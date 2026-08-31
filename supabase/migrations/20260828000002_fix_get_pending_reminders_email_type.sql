-- get_pending_reminders has never returned a row (WEB-OPS-007, WEB-AUTO-001).
--
-- send-event-reminders is deployed, is called hourly by the
-- send-event-reminders-hourly pg_cron job, and answers 500 on every invocation:
--
--   42804  structure of query does not match function result type
--          Returned type character varying(255) does not match expected type
--          text in column 3.
--
-- Column 3 is user_email. It is declared TEXT and selected from auth.users.email,
-- which Supabase defines as character varying(255). PostgreSQL does not coerce a
-- RETURNS TABLE column, so the function raises before returning anything and no
-- reminder has ever been sent.
--
-- The other four text columns are fine and are deliberately left alone rather
-- than blanket-cast: events.title, events.venue and events.location are TEXT in
-- 20250100000000_baseline_tables.sql, and user_event_reminders.reminder_type is
-- TEXT in this function's own migration. Only the auth.users column, which this
-- project does not own, is varchar.
--
-- WHY IT WAS INVISIBLE, and it is the reason this sat for months: the pg_cron
-- job posts to the edge function with net.http_post and SUCCEEDS when the POST
-- is ENQUEUED, not when it lands. cron_health therefore reports the job healthy
-- while every run 500s. Nothing writes an automation_job_runs row either,
-- because the function fails before reaching that code - which is the OTHER
-- blind spot WEB-OPS-007 AC6 describes. Between the two monitors, an hourly job
-- that has never done its work looks exactly like one with nothing to do.
--
-- SAFE IN A SINGLE RELEASE per CLAUDE.md: CREATE OR REPLACE with the same name,
-- the same argument list and the same returned columns in the same order and
-- declared types. Only the body changes, and it changes from raising to
-- returning. No caller can observe a narrower shape than it does today, because
-- today it observes an error.

CREATE OR REPLACE FUNCTION get_pending_reminders(reminder_window TEXT DEFAULT '1_hour')
RETURNS TABLE (
  reminder_id UUID,
  user_id UUID,
  user_email TEXT,
  event_id UUID,
  event_title TEXT,
  event_date TIMESTAMPTZ,
  event_start_utc TIMESTAMPTZ,
  event_venue TEXT,
  event_location TEXT,
  reminder_type TEXT,
  time_until_event INTERVAL
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id as reminder_id,
    r.user_id,
    -- ::TEXT is the entire fix. auth.users.email is varchar(255).
    u.email::TEXT as user_email,
    e.id as event_id,
    e.title as event_title,
    e.date as event_date,
    e.event_start_utc,
    e.venue as event_venue,
    e.location as event_location,
    r.reminder_type,
    (COALESCE(e.event_start_utc, e.date) - now()) as time_until_event
  FROM public.user_event_reminders r
  INNER JOIN auth.users u ON r.user_id = u.id
  INNER JOIN public.events e ON r.event_id = e.id
  WHERE
    r.delivery_status = 'pending'
    AND r.sent_at IS NULL
    AND COALESCE(e.event_start_utc, e.date) > now() -- Event hasn't started yet
    AND (
      -- 1 day reminder: send when event is 24-25 hours away
      (r.reminder_type = '1_day' AND
       COALESCE(e.event_start_utc, e.date) BETWEEN now() + INTERVAL '23 hours' AND now() + INTERVAL '25 hours')
      OR
      -- 3 hours reminder: send when event is 3-4 hours away
      (r.reminder_type = '3_hours' AND
       COALESCE(e.event_start_utc, e.date) BETWEEN now() + INTERVAL '2 hours 45 minutes' AND now() + INTERVAL '3 hours 15 minutes')
      OR
      -- 1 hour reminder: send when event is 1-1.25 hours away
      (r.reminder_type = '1_hour' AND
       COALESCE(e.event_start_utc, e.date) BETWEEN now() + INTERVAL '50 minutes' AND now() + INTERVAL '70 minutes')
    )
  ORDER BY e.event_start_utc ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_pending_reminders(TEXT) TO service_role;

-- AFTER APPLYING, verify by outcome rather than by absence of error:
--   curl -sS -X POST "$SUPABASE_URL/functions/v1/send-event-reminders" \
--     -H "Authorization: Bearer $ANON_KEY" -H 'Content-Type: application/json' -d '{}'
-- It answered 500 with the 42804 above; it should answer 200. A 200 with zero
-- reminders is the correct result when no event is inside a reminder window.
