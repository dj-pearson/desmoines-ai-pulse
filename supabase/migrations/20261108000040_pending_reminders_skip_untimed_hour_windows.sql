-- WEB-FEAT-058: get_pending_reminders queued "in 3 hours" and "in 1 hour"
-- reminders for events whose source never gave a time.
--
-- An event with no announced time is stored at the Central wall-clock time
-- 19:31:58 (NO_TIME_MARKER, _shared/eventDateTime.ts), or carries
-- time_tbd = true (SeatGeek's unannounced showtimes, 20260902000016). The
-- windows below are computed from COALESCE(event_start_utc, date), so the
-- 3-hour reminder for such an event fired at 16:31 Central and the 1-hour one
-- at 18:31, both timed against a start nobody announced. WEB-FEAT-057 changed
-- the copy to "is today", which stopped the email lying, but the user still
-- got two identical "is today" mails an afternoon apart.
--
-- The 3_hours and 1_hour arms now skip untimed events. The 1_day arm is kept:
-- it fires the evening before and its copy ("is tomorrow") is true whatever
-- the start time is. The untimed test is the one src/lib/eventTime.ts
-- hasStatedStartTime() and send-event-reminders/content.ts hasStatedTime()
-- use: time_tbd, or a Central wall clock of exactly 19:31:58.
--
-- A skipped hour-level reminder stays 'pending' with sent_at NULL. That is
-- what an unsent reminder already looks like; once the event's start passes
-- the "event hasn't started" condition drops it from every later run, so it
-- is never sent late.
--
-- Same signature, same return columns, same body otherwise: CREATE OR REPLACE
-- keeps the service_role-only grants from 20261015000006, and they are
-- restated below so this file is correct on its own.

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
       COALESCE(e.event_start_utc, e.date) BETWEEN now() + INTERVAL '2 hours 45 minutes' AND now() + INTERVAL '3 hours 15 minutes')
      OR
      -- 1 hour reminder: only for an event with an announced time
      (r.reminder_type = '1_hour' AND
       NOT (
         COALESCE(e.time_tbd, false)
         OR to_char(COALESCE(e.event_start_utc, e.date) AT TIME ZONE 'America/Chicago', 'HH24:MI:SS') = '19:31:58'
       ) AND
       COALESCE(e.event_start_utc, e.date) BETWEEN now() + INTERVAL '50 minutes' AND now() + INTERVAL '70 minutes')
    )
  ORDER BY e.event_start_utc ASC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_pending_reminders(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_reminders(text) TO service_role;
