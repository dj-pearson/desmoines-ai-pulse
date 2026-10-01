-- WEB-BE-045: give restaurants somewhere to record hours and whether they exist.
--
-- THE DEFECT. Nothing ever marked a restaurant closed. bulk-update-restaurants
-- has asked Google Places for `businessStatus` in its field mask since it was
-- written and thrown the answer away, so a permanently closed venue stayed on
-- the hubs, in the sitemap and in the Restaurant JSON-LD indefinitely. And
-- there was no hours column at all: /restaurants/open-now worked off `opening`,
-- a free-text column no ingestion path writes, so the page fetched 100
-- restaurants and filtered them against a string that is almost always null.
--
-- ADDITIVE ONLY, which CLAUDE.md lists as safe in a single release: two
-- nullable columns, no default that rewrites the table, and one partial index.
-- Nothing reads either column yet.
--
-- RELEASE N OF TWO for the readers, as usual here. Edge functions and the web
-- app deploy separately from migrations, so the writer added in this release
-- carries the isUnknownColumnError retry that bulk-update-restaurants already
-- uses for the WEB-FEAT-024 columns - without it, PostgREST rejects the WHOLE
-- update for one unknown column and enrichment stops writing every field, not
-- just the new ones. The readers (hiding CLOSED_PERMANENTLY rows, the open-now
-- filter) switch in the release after this is applied.

ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS business_status text;
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS hours_json jsonb;

COMMENT ON COLUMN public.restaurants.business_status IS
  'Google Places businessStatus: OPERATIONAL, CLOSED_TEMPORARILY or CLOSED_PERMANENTLY (WEB-BE-045). NULL means unknown, never "open". Normalized by supabase/functions/_shared/placeHours.ts, which drops any other value rather than storing it.';

COMMENT ON COLUMN public.restaurants.hours_json IS
  'Opening hours from Google Places regularOpeningHours, normalized by supabase/functions/_shared/placeHours.ts: { version, timeZone, periods, weekdayDescriptions, source, fetchedAt }. NULL means the hours are unknown - it is never an empty periods array, because that reads as "closed all week".';

-- NO CHECK CONSTRAINT on business_status, deliberately, and for the reason
-- WEB-BE-049's migration gives: edge functions deploy separately from
-- migrations, so a CHECK added here would reject writes from any function not
-- yet redeployed, and tightening a constraint in the release that introduces
-- the shape is on CLAUDE.md's "never" list. The normalizer is the gate for now;
-- the constraint belongs in a later release, once the writers are live and the
-- column has been observed holding nothing else.

-- Partial, because the only query is "which ones are gone" and that is a tiny
-- fraction of the table. A full index here would be mostly NULLs and
-- OPERATIONAL rows that no query asks for by status.
CREATE INDEX IF NOT EXISTS idx_restaurants_business_status_closed
  ON public.restaurants (business_status)
  WHERE business_status IN ('CLOSED_PERMANENTLY', 'CLOSED_TEMPORARILY');

-- Supports the open-now filter's first cut: rows that have hours at all. The
-- period evaluation itself cannot be indexed usefully - it depends on the
-- current time - so this narrows to the rows worth evaluating.
CREATE INDEX IF NOT EXISTS idx_restaurants_has_hours
  ON public.restaurants (id)
  WHERE hours_json IS NOT NULL;

DO $do$
DECLARE
  total integer;
BEGIN
  SELECT count(*) INTO total FROM public.restaurants;
  -- Read this in the apply log, then read it again after one nightly
  -- auto-enrich run: WEB-BE-045 AC6 is the count of rows with each column
  -- non-null, and today both are zero by construction.
  RAISE NOTICE 'WEB-BE-045: business_status and hours_json added to % restaurant(s); both NULL until auto-enrich-restaurants next runs', total;
END
$do$;
