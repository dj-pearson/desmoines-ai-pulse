-- send-event-reminders has been returning 500 on every run:
--
--   42804  structure of query does not match function result type
--          Returned type character varying(255) does not match expected
--          type text in column 3.
--
-- Column 3 is user_email, declared text in the RETURNS TABLE and selected
-- straight from auth.users.email, which Supabase defines as varchar(255).
-- plpgsql checks the row type on RETURN QUERY, so the function raises rather
-- than coercing, and no reminder has ever been delivered by this path.
--
-- Only that one column is affected: events.title, events.venue,
-- events.location and user_event_reminders.reminder_type are all already text.
-- The cast goes on the SELECT rather than widening the signature, because the
-- declared text is what every caller expects and auth.users is not ours to
-- change.

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
    u.email::text as user_email,   -- auth.users.email is varchar(255); see above
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
$function$;
