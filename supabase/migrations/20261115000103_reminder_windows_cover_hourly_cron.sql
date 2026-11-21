-- WEB-FEAT-090: the 3-hour and 1-hour reminder windows were
-- narrower than the cron that reads them, so most events never got either.
--
-- send-event-reminders runs once an hour, at minute 0
-- (send-event-reminders-hourly, 20251110000002). get_pending_reminders picked
-- a 3_hours reminder only when the start was 2h45m-3h15m away (30 minutes
-- wide) and a 1_hour reminder only at 50-70 minutes (20 minutes wide). A run
-- at the top of each hour samples one point per hour, so a window narrower
-- than an hour misses every start minute that falls between samples:
--
--   3_hours reached starts at :00-:15 and :45-:59. A 7:30 PM show was
--           2h30m away at 5:00 and 3h30m away at 4:00, outside both times.
--   1_hour  reached starts at :00-:10 and :50-:59. 7:15 PM and 7:30 PM
--           were never 50-70 minutes from a top-of-hour run.
--
-- The reminder stayed 'pending' with sent_at NULL until the start passed and
-- the "event hasn't started" filter dropped it, so nothing ever reported the
-- miss; the user had seen "You'll receive a reminder 3 hours before this
-- event" when they ticked the box.
--
-- Each window is now at least an hour wide, so every start minute is inside
-- it for one run:
--
--   1_day    23h    - 25h      (unchanged; it was already two hours wide)
--   3_hours  2h30m  - 3h35m
--   1_hour   30m    - 1h35m
--
-- The extra five minutes absorb a run that starts a little late or early.
-- Where two consecutive runs both see a reminder, the second cannot send it
-- again: send-event-reminders claims each row by flipping sent_at from NULL
-- (update ... where sent_at is null), and this function only returns rows with
-- sent_at NULL. The actual lead time is within 35 minutes of the one the email
-- names ("starts in 3 hours"), where before it was within 15 - for the
-- minority of events it reached at all.
--
-- Everything else is 20261108000040 verbatim: same signature, same return
-- columns, the untimed-event exclusion on the two hour-level arms (WEB-FEAT-058)
-- and the service_role-only grants (20261015000006), restated so this file is
-- correct on its own.

create or replace function public.get_pending_reminders(reminder_window text default '1_hour'::text)
returns table(
  reminder_id uuid,
  user_id uuid,
  user_email text,
  event_id uuid,
  event_title text,
  event_date timestamp with time zone,
  event_start_utc timestamp with time zone,
  event_venue text,
  event_location text,
  reminder_type text,
  time_until_event interval
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
BEGIN
  RETURN QUERY
  SELECT
    r.id as reminder_id,
    r.user_id,
    u.email::text as user_email,   -- auth.users.email is varchar(255)
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
      -- 1 day reminder: send when event is 23-25 hours away
      (r.reminder_type = '1_day' AND
       COALESCE(e.event_start_utc, e.date) BETWEEN now() + INTERVAL '23 hours' AND now() + INTERVAL '25 hours')
      OR
      -- 3 hours reminder: only for an event with an announced time
      (r.reminder_type = '3_hours' AND
       NOT (
         COALESCE(e.time_tbd, false)
         OR to_char(COALESCE(e.event_start_utc, e.date) AT TIME ZONE 'America/Chicago', 'HH24:MI:SS') = '19:31:58'
       ) AND
       COALESCE(e.event_start_utc, e.date) BETWEEN now() + INTERVAL '2 hours 30 minutes' AND now() + INTERVAL '3 hours 35 minutes')
      OR
      -- 1 hour reminder: only for an event with an announced time
      (r.reminder_type = '1_hour' AND
       NOT (
         COALESCE(e.time_tbd, false)
         OR to_char(COALESCE(e.event_start_utc, e.date) AT TIME ZONE 'America/Chicago', 'HH24:MI:SS') = '19:31:58'
       ) AND
       COALESCE(e.event_start_utc, e.date) BETWEEN now() + INTERVAL '30 minutes' AND now() + INTERVAL '1 hour 35 minutes')
    )
  ORDER BY e.event_start_utc ASC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_pending_reminders(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_reminders(text) TO service_role;
