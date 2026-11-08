-- get_pending_reminders sends "in 3 hours" and "in 1 hour" reminders for
-- events that have no announced time (WEB-FEAT-058).
--
-- An event whose source gave a day but no time is stored at the ingest
-- sentinel 19:31:58 Central (_shared/eventDateTime.ts NO_TIME_MARKER; the
-- submission RPC uses the same literal). The hour-level windows below are
-- computed from that instant, so a 3_hours reminder went out at 16:31 and a
-- 1_hour reminder at 18:31 for an event that may be a morning market or an
-- all-day festival. send-event-reminders now words those emails "is today"
-- (WEB-FEAT-057), but two same-day emails timed against a made-up start are
-- still noise.
--
-- The 1_day reminder is kept: it fires the evening before and only needs the
-- day, which the row does have. 3_hours and 1_hour reminders on a sentinel row
-- are no longer returned. They stay 'pending' and drop out of the query once
-- the event's day passes, the same as any reminder whose window was missed;
-- nothing is deleted and no status is rewritten.
--
-- The test is on the Central wall clock, to the second, of the same instant the
-- windows use. 19:31:58 is deliberately odd so that no real listing lands on it;
-- a 7:30 PM show is untouched.
--
-- Signature, return type, grants and search_path are unchanged (CREATE OR
-- REPLACE keeps the 20261015000006 grants), and the only caller is the
-- service-role edge function, so no shipped client sees a different shape.

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
    u.email::text as user_email,   -- auth.users.email is varchar(255); see 20260830000001
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
    -- No hour-level reminder for an event with no announced time (see above).
    AND NOT (
      r.reminder_type IN ('3_hours', '1_hour')
      AND (COALESCE(e.event_start_utc, e.date) AT TIME ZONE 'America/Chicago')::time = '19:31:58'::time
    )
  ORDER BY e.event_start_utc ASC;
END;
$function$;
