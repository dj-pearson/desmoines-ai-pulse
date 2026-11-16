-- WEB-FEAT-098: get_pending_reminders emailed reminders for events
-- that are no longer published.
--
-- An event leaves the public site in two reversible ways, and neither reached
-- the reminder query:
--
--   is_hidden    unpublish_submission (20260920000001) sets it when a
--                submitter takes their listing down, or while an edit to a
--                published submission is re-reviewed (WEB-ADS-008).
--                hide_stale_events sets it on past rows.
--   archived_at  the reversible unpublish switch (20260823000007), written by
--                agent-link-monitor and restorable by nulling it.
--
-- Every public read filters both (fuzzy search, trending, surprise pick, map,
-- the digest and weekend guide), but get_pending_reminders joined events with
-- no visibility condition at all. So a reader who had ticked "3 hours before"
-- on a submitted event still got "starts in 3 hours" with a link to it after
-- the submitter pulled it, which is the email most likely to send someone to
-- a cancelled event.
--
-- The rows are skipped, not claimed: the reminder stays pending with sent_at
-- NULL. If the listing is republished before its window closes (an edit that
-- passes re-review), the next hourly run sends it as normal; if not, the
-- "event hasn't started" filter retires it when the start passes, as it does
-- for any reminder no run picked up.
--
-- is_merged is deliberately NOT filtered. merge_duplicate_content
-- (20260612000010) repoints every foreign key that references the duplicate,
-- user_event_reminders.event_id included, so a merge moves the reminder to the
-- kept row. A reminder still on a merged row means a merge that bypassed that
-- function; the event behind it is still real, and dropping the reminder
-- would lose a send the reader asked for.
--
-- Everything else is 20261115000103 verbatim: same signature, same return
-- columns, the same windows (WEB-FEAT-090), the untimed-event exclusion on the
-- hour-level arms (WEB-FEAT-058) and the service_role-only grants
-- (20261015000006). Backward compatible: no parameter or return column
-- changes; send-event-reminders reads the same shape.

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
    -- Published only: the two reversible unpublish switches every public read honours.
    AND e.is_hidden IS NOT TRUE
    AND e.archived_at IS NULL
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
