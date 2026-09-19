-- WEB-PERF-035 AC3: give breweries a column instead of a hardcoded name list.
--
-- THE DEFECT. src/hooks/useBreweryTrail.ts built the Brewery Trail from nine
-- literal names ORed together as ilike patterns, plus two cuisine patterns.
-- That is wrong in both directions at once: a brewery that opens tomorrow is
-- invisible until somebody edits a TypeScript file and redeploys, and any
-- restaurant whose name happens to contain 'Fox Brewing' or '515 Brewing'
-- joins the trail without anyone choosing it.
--
-- RELEASE N OF TWO. This migration adds the column and backfills it from the
-- same two signals the hook uses today, so the column and the hook agree on
-- the current membership. The hook keeps its name list until this is applied
-- in production: edge deploys and migrations are separate steps here, and a
-- reader that filters on a column PostgREST does not know about gets 42703 on
-- the WHOLE select - a blank trail, not a degraded one (CLAUDE.md, Backward
-- Compatibility). Release N+1 switches the hook to `.eq('is_brewery', true)`
-- and deletes BREWERY_NAMES.
--
-- Nothing reads the column yet, so nothing can break on its absence. The
-- NOT NULL DEFAULT false is safe to add in one release for the reason CLAUDE.md
-- cares about - `false` is non-volatile, so Postgres 11+ records it in the
-- catalog rather than rewriting the table. The constraint is on a column that
-- did not exist a statement ago, which is not the "tightening NOT NULL on an
-- existing column" that list forbids.

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS is_brewery boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.restaurants.is_brewery IS
  'Brewery Trail membership (WEB-PERF-035). Editable per row - this is a curation flag, not a derived one. Backfilled once from the name/cuisine heuristics the hook used before the column existed.';

-- The backfill mirrors the hook's OR exactly, so switching the reader
-- in the next release is a no-op on membership rather than a silent change to
-- what the page lists.
--
-- Only ever turns the flag ON. A row somebody has since unflagged by hand must
-- not be re-flagged by a re-run, which is also what makes this idempotent.
UPDATE public.restaurants
SET is_brewery = true
WHERE is_brewery = false
  AND (
    name ILIKE '%Confluence Brewing%'
    OR name ILIKE '%Exile Brewing%'
    OR name ILIKE '%Peace Tree Brewing%'
    OR name ILIKE '%Firetrucker Brewery%'
    OR name ILIKE '%Brightside Aleworks%'
    OR name ILIKE '%515 Brewing%'
    OR name ILIKE '%Mistress Brewing%'
    OR name ILIKE '%Fox Brewing%'
    OR name ILIKE '%Kinship Brewing%'
    OR cuisine ILIKE '%Brewery%'
    OR cuisine ILIKE '%Craft Beer%'
  );

-- The trail is a short list read on every page view, so the flag gets a
-- partial index rather than a full one: only the true rows are ever selected.
CREATE INDEX IF NOT EXISTS idx_restaurants_is_brewery
  ON public.restaurants (name)
  WHERE is_brewery;

-- Read the count in the apply log. Zero here means the backfill matched
-- nothing, which would make the next release's reader switch empty the page.
DO $do$
DECLARE
  flagged integer;
BEGIN
  SELECT count(*) INTO flagged FROM public.restaurants WHERE is_brewery;
  RAISE NOTICE 'WEB-PERF-035: % restaurant(s) flagged as breweries', flagged;
END
$do$;
