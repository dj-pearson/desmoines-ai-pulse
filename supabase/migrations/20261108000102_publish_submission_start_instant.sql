-- WEB-FEAT-083: an approved submission's events.date is the start
-- instant, like every other writer's, not the organizer's browser midnight.
--
-- WHY. publish_submission (20260920000001 -> 20260926000002 -> 20261007000002)
-- computes the right start instant, then writes it only to event_start_utc and
-- copies user_submitted_events.date into events.date untouched. That value is
-- the picked day at the submitting browser's local midnight
-- (EventSubmissionForm sent selectedDate.toISOString()), so a 7 PM show
-- submitted from Des Moines was stored as date = 00:00 Central. Every ingest
-- path (_shared/eventDateTime.ts, ingest-events/plan.ts, firecrawl-scraper)
-- writes date = event_start_utc, and the readers filter and sort on date:
--   - the /events hub's notOverFilter keeps `date >= now - 2h`, so the show
--     left the hub, its count and its map at 2 AM on its own day, 17 hours
--     before it starts; home "Next up" (`date >= now`) dropped it at midnight;
--   - lists ordered by date put it first on its day, ahead of a 10 AM brunch;
--   - an untimed submission never carried the 19:31:58 marker on date, so
--     notOverFilter's `date.eq.<today's marker>` arm never matched it;
--   - the title_date_venue dedupe key never matches the same show scraped
--     from the venue, whose date is the real start.
--
-- WHAT. publish_submission is re-created from 20261007000002 VERBATIM except
-- that the INSERT's date is `v_start_local AT TIME ZONE 'America/Chicago'`,
-- the same expression as event_start_utc. ON CONFLICT already sets
-- date = EXCLUDED.date, so a re-approval corrects an existing listing too.
-- Same signature, return type, REVOKEs and GRANTs.
--
-- Then rows this function already published are realigned: date is set to
-- event_start_utc where they differ. event_start_utc was always computed from
-- the Central day and the submitted start_time (or the marker), so it is the
-- value date should have had. Scoped to submission_id IS NOT NULL, so no
-- scraped row is touched.
--
-- ADDITIVE. A value correction on existing columns; no column, argument or
-- return shape changes (CLAUDE.md, Backward Compatibility).

CREATE OR REPLACE FUNCTION public.publish_submission(
  p_submission_id uuid,
  p_admin_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  s public.user_submitted_events%ROWTYPE;
  v_local_date date;
  v_start_local timestamp;
  v_end_local timestamp;
  v_event_id uuid;
BEGIN
  -- An admin, or the service role (the AI path in triage-event-submission,
  -- which has no auth.uid()). Nobody else, including the submitter: approving
  -- your own event is the whole thing this queue exists to prevent.
  IF NOT (coalesce(auth.role(), '') = 'service_role' OR public.is_admin()) THEN
    RAISE EXCEPTION 'publish_submission: not authorized';
  END IF;

  SELECT * INTO s FROM public.user_submitted_events WHERE id = p_submission_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'publish_submission: submission % not found', p_submission_id;
  END IF;

  -- events.title, events.date, events.location and events.category are NOT
  -- NULL. Refusing here names the field; letting the INSERT refuse would
  -- surface as a constraint violation an admin cannot act on.
  IF coalesce(btrim(s.title), '') = '' THEN
    RAISE EXCEPTION 'publish_submission: submission % has no title', p_submission_id;
  END IF;
  IF s.date IS NULL THEN
    RAISE EXCEPTION 'publish_submission: submission % has no date', p_submission_id;
  END IF;

  -- The Central calendar day the organizer picked. s.date is timestamptz, and
  -- its ::text is "2026-10-01 05:00:00+00", which cannot take a time appended.
  v_local_date := (s.date AT TIME ZONE 'America/Chicago')::date;

  v_start_local := (v_local_date::text || ' ' || coalesce(nullif(s.start_time::text, ''), '19:31:58'))::timestamp;
  v_end_local := CASE
    WHEN coalesce(nullif(s.end_time::text, ''), '') = '' THEN NULL
    ELSE (v_local_date::text || ' ' || s.end_time::text)::timestamp
  END;

  INSERT INTO public.events (
    title, date, location, category, venue,
    original_description, price, image_url, source_url, source,
    event_start_local, event_start_utc, event_timezone,
    event_end_local, event_end_utc,
    address, contact_email, contact_phone, tags,
    submission_id, submitted_by
  )
  VALUES (
    s.title,
    -- The start instant, as every ingest path writes it (WEB-FEAT-083).
    -- Was s.date: the organizer's browser midnight on the picked day.
    v_start_local AT TIME ZONE 'America/Chicago',
    coalesce(nullif(btrim(s.location), ''), nullif(btrim(s.venue), ''), 'Des Moines, IA'),
    coalesce(nullif(btrim(s.category), ''), 'Community'),
    s.venue,
    s.description,
    s.price,
    s.image_url,
    s.website_url,
    'user_submission',
    v_start_local,
    v_start_local AT TIME ZONE 'America/Chicago',
    'America/Chicago',
    v_end_local,
    CASE WHEN v_end_local IS NULL THEN NULL ELSE v_end_local AT TIME ZONE 'America/Chicago' END,
    s.address,
    -- IOS-DD-EVENTS-17: the submitter's contact details stay in
    -- user_submitted_events (admin-only) and are no longer copied onto the
    -- anon-readable listing.
    NULL,
    NULL,
    s.tags,
    s.id,
    s.user_id
  )
  -- Re-publishing an already-published submission UPDATES its row rather than
  -- creating a second listing. That is what makes this safe to call from both
  -- the human button and the AI path, and it is what AC3's re-approve-after-
  -- edit needs: the organizer's edits reach the live listing they already have.
  -- is_featured, view_count and everything an editor or the site has since set
  -- are deliberately NOT in this list.
  ON CONFLICT (submission_id) WHERE submission_id IS NOT NULL
  DO UPDATE SET
    title = EXCLUDED.title,
    date = EXCLUDED.date,
    location = EXCLUDED.location,
    category = EXCLUDED.category,
    venue = EXCLUDED.venue,
    original_description = EXCLUDED.original_description,
    price = EXCLUDED.price,
    image_url = EXCLUDED.image_url,
    source_url = EXCLUDED.source_url,
    event_start_local = EXCLUDED.event_start_local,
    event_start_utc = EXCLUDED.event_start_utc,
    event_timezone = EXCLUDED.event_timezone,
    event_end_local = EXCLUDED.event_end_local,
    event_end_utc = EXCLUDED.event_end_utc,
    address = EXCLUDED.address,
    contact_email = EXCLUDED.contact_email,
    contact_phone = EXCLUDED.contact_phone,
    tags = EXCLUDED.tags,
    submitted_by = EXCLUDED.submitted_by,
    -- A previously hidden or archived listing comes back when it is
    -- re-approved; otherwise a rejected-then-approved event stays invisible
    -- while every screen says it is live.
    is_hidden = false,
    hidden_at = NULL,
    archived_at = NULL,
    updated_at = now()
  RETURNING id INTO v_event_id;

  UPDATE public.user_submitted_events
  SET status = 'approved',
      admin_reviewed_at = now(),
      admin_reviewed_by = auth.uid(),
      admin_notes = coalesce(p_admin_notes, admin_notes),
      updated_at = now()
  WHERE id = p_submission_id;

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_submission(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_submission(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.publish_submission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_submission(uuid, text) TO service_role;

COMMENT ON FUNCTION public.publish_submission(uuid, text) IS
  'Publish a reviewed user_submitted_events row into events, mapping every collected field (WEB-ADS-008). events.date is the start instant, as event_start_utc. Admin or service_role only. Idempotent on submission_id.';

DO $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.events
  SET date = event_start_utc
  WHERE submission_id IS NOT NULL
    AND event_start_utc IS NOT NULL
    AND date IS DISTINCT FROM event_start_utc;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'WEB-FEAT-083: realigned events.date to event_start_utc on % published submission(s)', v_rows;
END;
$$;
