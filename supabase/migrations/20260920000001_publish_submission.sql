-- WEB-ADS-008: approval publishes.
--
-- The human approve button in EventSubmissionsManager set
-- user_submitted_events.status = 'approved' and told the admin to "promote them
-- from the existing /admin/content workflow", which has no path for
-- user_submitted_events - grep across src/ finds the manager, its hook and the
-- generated types, and nothing else. So a human approval published nothing,
-- ever. The AI path in triage-event-submission did insert into events, but it
-- mapped ten fields and dropped six that the form collects: start_time,
-- end_time, address, contact_email, contact_phone and tags. Neither path left
-- anything on the events row pointing back at the submitter, so an organizer's
-- listing could not be found from their submission or the other way round.
--
-- ONE function for both paths, because two copies of "which fields does a
-- published submission carry" is how the AI path came to carry ten.
--
-- ── ADDITIVE ONLY ───────────────────────────────────────────────────────────
--
-- Eight nullable columns, no defaults that rewrite the table, no constraint
-- tightened, nothing renamed or dropped. Older iOS and Android binaries read
-- events and ignore keys they do not know (CLAUDE.md, Backward Compatibility).

ALTER TABLE public.events
  -- Provenance. submission_id also makes republishing idempotent below.
  ADD COLUMN IF NOT EXISTS submission_id uuid,
  ADD COLUMN IF NOT EXISTS submitted_by uuid,
  -- The six fields the form collects and the AI path discarded. event_end_local
  -- and event_end_utc mirror the existing event_start_local / event_start_utc /
  -- event_timezone trio rather than inventing a second convention; end_date is
  -- a DATE and cannot hold a time.
  ADD COLUMN IF NOT EXISTS event_end_local timestamp without time zone,
  ADD COLUMN IF NOT EXISTS event_end_utc timestamptz,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS tags text[];

-- One published event per submission. Partial, so the millions of crawled rows
-- with a NULL submission_id do not collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS events_submission_id_unique
  ON public.events (submission_id)
  WHERE submission_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS events_submitted_by_idx
  ON public.events (submitted_by)
  WHERE submitted_by IS NOT NULL;

COMMENT ON COLUMN public.events.submission_id IS
  'user_submitted_events.id this row was published from (WEB-ADS-008). NULL for crawled rows.';

-- ── publish_submission ──────────────────────────────────────────────────────
--
-- SECURITY DEFINER because the browser calls it: an admin has no direct INSERT
-- on events, and giving them one to make a button work would be a far wider
-- grant than "publish this reviewed submission".
--
-- TIME. The convention is _shared/eventDateTime.ts and it is copied here
-- deliberately rather than approximated: the local wall clock goes in
-- event_start_local, America/Chicago in event_timezone, and the same wall clock
-- read AS Central goes in event_start_utc. A submission with no start_time gets
-- NO_TIME_MARKER 19:31:58 - an odd value on purpose, because a row reading
-- 19:00:00 is indistinguishable from a real 7pm show, and the dedup tiers and
-- four ingestion paths already agree on it (WEB-BE-037).
--
-- CATEGORY is passed through with the same 'Community' fallback the AI path
-- used. It is NOT normalized here: EventSubmissionForm's Select is bound to
-- EVENT_CATEGORIES (src/lib/eventCategories.ts), so a submitted category is
-- already canonical, and 20260919000003 was explicit that the normalizer should
-- not become a persistent SQL function with a second copy of the vocabulary.
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

  v_start_local := (s.date::text || ' ' || coalesce(nullif(s.start_time::text, ''), '19:31:58'))::timestamp;
  v_end_local := CASE
    WHEN coalesce(nullif(s.end_time::text, ''), '') = '' THEN NULL
    ELSE (s.date::text || ' ' || s.end_time::text)::timestamp
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

-- ── unpublish_submission (AC3) ──────────────────────────────────────────────
--
-- THE DECISION AC3 ASKS FOR, WRITTEN DOWN: an edit after approval UNPUBLISHES
-- until it is re-approved. It does not silently update the live listing.
--
-- Why not push the edit straight through: the edit is untriaged. The whole
-- reason submissions go through a queue is that nobody has read this text yet,
-- and an organizer who can edit a live listing without review has a publish
-- button. EventSubmissionForm already sets status back to 'pending' on an edit,
-- which is the right half; what was missing is that the listing stayed up,
-- unchanged, so an organizer correcting a wrong date left the wrong date on the
-- site and had no way to take it down.
--
-- Hidden rather than deleted: publish_submission clears is_hidden on
-- re-approval, so the same row comes back with the same id and the same URL.
-- Anything linking to it keeps working.
CREATE OR REPLACE FUNCTION public.unpublish_submission(p_submission_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner uuid;
  v_hidden integer;
BEGIN
  SELECT user_id INTO v_owner FROM public.user_submitted_events WHERE id = p_submission_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unpublish_submission: submission % not found', p_submission_id;
  END IF;

  -- The submitter may take their OWN listing down; so may an admin and the
  -- service role. Anyone else editing somebody else's event is the case this
  -- refuses.
  IF NOT (
    coalesce(auth.role(), '') = 'service_role'
    OR public.is_admin()
    OR (auth.uid() IS NOT NULL AND auth.uid() = v_owner)
  ) THEN
    RAISE EXCEPTION 'unpublish_submission: not authorized';
  END IF;

  UPDATE public.events
  SET is_hidden = true,
      hidden_at = now(),
      updated_at = now()
  WHERE submission_id = p_submission_id
    AND is_hidden = false;

  GET DIAGNOSTICS v_hidden = ROW_COUNT;
  RETURN v_hidden > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.unpublish_submission(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unpublish_submission(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.unpublish_submission(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unpublish_submission(uuid) TO service_role;

COMMENT ON FUNCTION public.unpublish_submission(uuid) IS
  'Hide the listing published from a submission while its edit is re-reviewed (WEB-ADS-008 AC3). Owner, admin or service_role.';
