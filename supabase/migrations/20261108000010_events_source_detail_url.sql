-- WEB-BE-060, slice 1: events.source_detail_url, the listing page an event was
-- read from, kept apart from source_url.
--
-- WHY. The Catch Des Moines adapter writes source_url = the organizer's
-- "Visit Website" link when the page has one, and the Catch Des Moines detail
-- URL only when it does not. So for most of its rows the listing id that
-- produced the row is stored nowhere, and the adapter cannot tell a listing it
-- already has from a new one. It re-fetched the same nearest 100 detail pages
-- on every run and never reached the events further out (WEB-BE-051).
--
-- source_url keeps meaning what readers already use it for (the "more info"
-- link on the event page). This column is provenance only: the aggregator page
-- the row came from, written by ingest, read by ingest.
--
-- BACKWARD COMPATIBLE. One nullable column with no default, so no table
-- rewrite and no client sees a change. Writers start sending it only after this
-- file is applied (slice 2): before that, naming the column in an insert is
-- PGRST204 on the whole row.
--
-- BACKFILL. Rows whose source_url already IS a Catch Des Moines detail page
-- (the no-external-link case) are copied across, so the known-id set the
-- adapter skips on is useful from the first run. Idempotent: only NULLs are
-- filled.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS source_detail_url text NULL;

COMMENT ON COLUMN public.events.source_detail_url IS
  'Aggregator listing page the row was ingested from (e.g. catchdesmoines.com/event/<slug>/<id>/). Provenance for ingest dedup; source_url stays the public link. WEB-BE-060.';

UPDATE public.events
   SET source_detail_url = source_url
 WHERE source_detail_url IS NULL
   AND source_url ~* '^https?://(www\.)?catchdesmoines\.com/event/[a-z0-9-]+/[0-9]+/?$';

CREATE INDEX IF NOT EXISTS idx_events_source_detail_url
  ON public.events (source_detail_url)
  WHERE source_detail_url IS NOT NULL;
