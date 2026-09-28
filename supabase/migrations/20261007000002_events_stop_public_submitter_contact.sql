-- iOS deep dive, events group, item E17 (IOS-DD-EVENTS-17): stop publishing
-- event submitters' email and phone on the public events row.
--
-- WHY. publish_submission (20260920000001, then 20260926000002) copies
-- user_submitted_events.contact_email and contact_phone into public.events.
-- events is readable by anon, and every client selects '*', so
--   GET /rest/v1/events?select=title,contact_email,contact_phone
-- with the public anon key lists every submitter's personal email and phone.
-- grep of src/, supabase/functions/ and ios/ finds no reader of
-- events.contact_email or events.contact_phone; the details stay in
-- user_submitted_events, which admins already use to reach submitters
-- (notify-event-submission, triage-event-submission).
--
-- WHAT. publish_submission is re-created from 20260926000002 VERBATIM except
-- that the INSERT writes NULL for the two columns. The ON CONFLICT SET keeps
-- `contact_email = EXCLUDED.contact_email` (and phone), which now writes NULL,
-- so re-publishing an old submission clears its copy too. Same signature,
-- return type, REVOKEs and GRANTs. Then existing copies are nulled.
--
-- ADDITIVE. A data change, not a shape change: both columns remain (NULL) for
-- any shipped client that selects them; dropping them is for a later release
-- per CLAUDE.md's deprecation flow. Deferred D-submitted_by: events.
-- submitted_by (the submitter's user id) is also on the public row; left for a
-- separate decision because the web may join on it.
--
-- ORDERING. 20260920000001 and 20260926000002 are noted as not yet applied
-- (deferred D2 there); apply this with them. The backfill below is skipped
-- when the columns do not exist yet.

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


DO $$
DECLARE
  v_rows integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'contact_email'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'contact_phone'
  ) THEN
    EXECUTE 'UPDATE public.events SET contact_email = NULL, contact_phone = NULL '
         || 'WHERE contact_email IS NOT NULL OR contact_phone IS NOT NULL';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RAISE NOTICE 'IOS-DD-EVENTS-17: cleared submitter contact details on % event row(s)', v_rows;
  ELSE
    RAISE NOTICE 'IOS-DD-EVENTS-17: events.contact_email/contact_phone not present; nothing to clear';
  END IF;
END;
$$;
