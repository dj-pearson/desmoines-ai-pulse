-- WEB-BE-057, slice 1: events.venue_id and venues.known_venue_id, so a venue
-- or team page can ask for its events by id instead of by name.
--
-- WHY. The venue page (useVenueEvents) and the team page (useTeamGames) find
-- their events with venue.ilike over the venue name and its aliases, then trim
-- the over-read row by row in matchVenue. The match the database already knows
-- how to make, find_matching_venue() (WEB-BE-039's conservative rules, kept in
-- step with _shared/venueMatch.ts), is never stored, so every page view redoes
-- it in the browser against free text.
--
-- WHAT THIS ADDS. All additive, nothing a current reader or writer sees:
--   events.venue_id         uuid NULL -> known_venues(id), ON DELETE SET NULL
--   venues.known_venue_id   uuid NULL -> known_venues(id), ON DELETE SET NULL
--                           (venues is the /music table the venue pages read;
--                           this links it to the matcher's table rather than
--                           merging the two, which is a later decision)
--   trg_events_venue_id     BEFORE INSERT OR UPDATE OF venue, venue_id
--
-- WHY A TRIGGER AND NOT THE SCRAPERS. Every ingest path (firecrawl-scraper,
-- ai-crawler, the Python crawlers, publish_submission, admin edits) writes
-- events.venue. Setting venue_id from that in the database covers all of them
-- at once, and no writer has to name the new column, so nothing PGRST204s on a
-- deploy that lands before this file is applied.
--
-- THE TRIGGER'S RULE. A client that sets venue_id itself (an admin linking a
-- row the matcher refused) is believed; the trigger only fills in:
--   INSERT  venue_id NULL                                 -> match NEW.venue
--   UPDATE  venue changed and venue_id left as it was     -> match NEW.venue
--   UPDATE  venue_id changed by the client                -> keep it
-- A venue that matches nothing gives NULL, which is what every reader of a
-- nullable column handles. A changed venue that no longer matches clears the
-- old id rather than keeping a link to a venue the row no longer names.
--
-- BACKFILL. Matched once per DISTINCT venue string, not once per row. events
-- has no updated_at trigger (see 20261107000080), so this writes venue_id and
-- nothing a reader can see; IS DISTINCT FROM keeps a replay a no-op.
--
-- Readers switch in slice 2, after this is applied and types.ts regenerated:
-- naming either column in a select before then is 42703 on the whole query.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS venue_id uuid NULL
  REFERENCES public.known_venues(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.events.venue_id IS
  'known_venues row this event is at, set by trg_events_venue_id from events.venue via find_matching_venue(). NULL when the matcher refuses. WEB-BE-057.';

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS known_venue_id uuid NULL
  REFERENCES public.known_venues(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.venues.known_venue_id IS
  'known_venues row for this /music venue, so its page can read events by events.venue_id. WEB-BE-057.';

-- search_path is public, not '': find_matching_venue() names known_venues
-- unqualified and inherits this setting.
CREATE OR REPLACE FUNCTION public.events_set_venue_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.venue_id IS NULL THEN
      NEW.venue_id := public.find_matching_venue(NEW.venue);
    END IF;
  ELSIF NEW.venue_id IS NOT DISTINCT FROM OLD.venue_id
        AND NEW.venue IS DISTINCT FROM OLD.venue THEN
    NEW.venue_id := public.find_matching_venue(NEW.venue);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_events_venue_id ON public.events;
CREATE TRIGGER trg_events_venue_id
  BEFORE INSERT OR UPDATE OF venue, venue_id ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.events_set_venue_id();

-- Backfill events.
WITH matched AS (
  SELECT v.venue, public.find_matching_venue(v.venue) AS venue_id
  FROM (SELECT DISTINCT venue FROM public.events WHERE venue IS NOT NULL) AS v
)
UPDATE public.events AS e
   SET venue_id = m.venue_id
  FROM matched AS m
 WHERE e.venue = m.venue
   AND m.venue_id IS NOT NULL
   AND e.venue_id IS DISTINCT FROM m.venue_id;

-- Backfill venues: by its own name first, then the matcher's aliases do the
-- rest ("Des Moines Civic Center" is an alias of the canonical row).
UPDATE public.venues AS v
   SET known_venue_id = public.find_matching_venue(v.name)
 WHERE v.known_venue_id IS NULL
   AND public.find_matching_venue(v.name) IS NOT NULL;

DO $$
DECLARE
  n_linked bigint;
  n_named bigint;
  n_venues bigint;
  n_venues_linked bigint;
BEGIN
  SELECT count(*) FILTER (WHERE venue_id IS NOT NULL),
         count(*) FILTER (WHERE venue IS NOT NULL)
    INTO n_linked, n_named
    FROM public.events;
  SELECT count(*), count(known_venue_id)
    INTO n_venues, n_venues_linked
    FROM public.venues;
  RAISE NOTICE 'WEB-BE-057 venue_id backfill: % of % events with a venue linked; % of % venues linked',
    n_linked, n_named, n_venues_linked, n_venues;
END;
$$;

-- The venue page asks for one venue's upcoming rows in date order; the index
-- also serves the FK's ON DELETE SET NULL. Partial, so unmatched rows stay out.
CREATE INDEX IF NOT EXISTS idx_events_venue_id_date
  ON public.events (venue_id, date)
  WHERE venue_id IS NOT NULL;
