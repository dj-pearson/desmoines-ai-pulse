-- Account plan WP4 item 3: publish_submission builds a time Postgres accepts.
--
-- 20260920000001 built the listing's wall clock as
--
--   (s.date::text || ' ' || coalesce(nullif(s.start_time::text, ''), '19:31:58'))::timestamp
--
-- user_submitted_events.date is timestamptz, so s.date::text is
-- "2026-10-01 05:00:00+00" and the concatenation is
-- "2026-10-01 05:00:00+00 19:00", which is not a timestamp. Every approval,
-- human or automatic, would have raised 22007 and published nothing.
-- 20260920000001 is not applied yet (it is not in scripts/db-snapshot.json), so
-- this lands before anyone hits it. Apply both together (Deferred D2).
--
-- WHICH DAY. EventSubmissionForm sends the picked day as the browser's local
-- midnight through toISOString(), e.g. 2026-10-01T05:00:00Z from a browser in
-- Central (CDT). Read back in America/Chicago that is Oct 1, the day the
-- organizer picked. The same holds for any browser at or west of Central. A
-- browser east of Central (Eastern midnight is 23:00 Central the day before)
-- still lands a day early; fixing that means the form sending a plain date,
-- which is a form change for another package, not something SQL can undo.
--
-- ONLY the two assignments changed. Everything else below is 20260920000001's
-- function verbatim, including its signature, so this is a CREATE OR REPLACE
-- with the same arguments and return type: nothing a caller sends or reads
-- changes (CLAUDE.md, Backward Compatibility).

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
    s.date,
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
    s.contact_email,
    s.contact_phone,
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
  'Publish a reviewed user_submitted_events row into events, mapping every collected field (WEB-ADS-008). Admin or service_role only. Idempotent on submission_id.';
