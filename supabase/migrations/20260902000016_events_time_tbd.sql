-- WEB-BE-038: a SeatGeek show with no announced time is published as a 3:30 AM show.
--
-- SeatGeek marks an unannounced showtime with `time_tbd: true` and fills
-- `datetime_local` with a placeholder of 03:30:00. The adapter reads
-- datetime_local only -- time_tbd and date_tbd are not even in its interface --
-- so the placeholder is ingested as fact. SeatGeek is the largest source in the
-- pipeline, so this is the single biggest producer of wrong times on the site.
--
-- 3:30 AM is not a plausible showtime, which is what makes it worse than a
-- merely wrong one: a visitor reading "3:30 AM" does not think "the time is not
-- announced yet", they think the listing is broken.
--
-- Additive per CLAUDE.md: ADD COLUMN ... NOT NULL DEFAULT false is safe in one
-- release. Every existing reader ignores a column it does not select, and the
-- default means no row has to be rewritten with a value.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS time_tbd BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.events.time_tbd IS
  'True when the source published a date but no start time. The time component of '
  '`date` is then a placeholder and must not be displayed or emitted in JSON-LD. '
  'WEB-BE-038.';

-- Partial index: the only question anyone asks of this column is "which rows are
-- TBD", and they are a small minority.
CREATE INDEX IF NOT EXISTS events_time_tbd_idx
  ON public.events (event_start_utc)
  WHERE time_tbd;

-- ---------------------------------------------------------------- backfill
--
-- Existing SeatGeek rows sitting at exactly 03:30:00 local. The time is
-- SeatGeek's placeholder, not a showtime, so it is marked rather than changed:
-- moving it would lose the only record of what was ingested, and the date part
-- is correct.
--
-- SCOPED THREE WAYS on purpose. 03:30:00 is a real time -- an after-hours event
-- could legitimately start then -- so the match requires the SeatGeek source AND
-- the exact placeholder AND a local time, and it still reports the count rather
-- than acting silently.
DO $backfill$
DECLARE
  v_candidates integer;
  v_updated integer;
BEGIN
  SELECT count(*) INTO v_candidates
  FROM public.events
  WHERE time_tbd = false
    AND event_start_local IS NOT NULL
    AND event_start_local::time = TIME '03:30:00'
    AND (source_url ILIKE '%seatgeek%');

  RAISE NOTICE 'WEB-BE-038 backfill: % SeatGeek row(s) at the 03:30 placeholder', v_candidates;

  UPDATE public.events
     SET time_tbd = true
   WHERE time_tbd = false
     AND event_start_local IS NOT NULL
     AND event_start_local::time = TIME '03:30:00'
     AND (source_url ILIKE '%seatgeek%');

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'WEB-BE-038 backfill: % row(s) marked time_tbd', v_updated;

  -- Rows at 03:30 from any OTHER source are reported and NOT touched. They are
  -- either genuine after-hours events or a different source's placeholder, and
  -- guessing which would be exactly the mistake this story is about.
  SELECT count(*) INTO v_candidates
  FROM public.events
  WHERE time_tbd = false
    AND event_start_local IS NOT NULL
    AND event_start_local::time = TIME '03:30:00';

  IF v_candidates > 0 THEN
    RAISE NOTICE 'WEB-BE-038: % non-SeatGeek row(s) also sit at 03:30 and were LEFT ALONE. Inspect before assuming they are placeholders.', v_candidates;
  END IF;
END
$backfill$;
