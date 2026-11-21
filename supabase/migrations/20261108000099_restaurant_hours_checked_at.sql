-- WEB-FEAT-079: record when a restaurant's hours were last checked.
--
-- THE GAP. hours_json and business_status are written once per row: the
-- hours-only refresh in bulk-update-restaurants targets hours_json IS NULL and
-- the full enrichment skips rows already 'completed'. A place that changed its
-- hours, or closed, kept the answer from the day it was filled, and every
-- open-now badge and closed-place filter reads those two columns.
--
-- bulk-update-restaurants' hours-only mode now takes `staleDays` and re-reads
-- rows whose last check is older than that. This column is "last check": set
-- on every answer Places gives, including "no hours" and 404, so a place
-- Google has nothing for is not re-read at the head of every batch.
-- hours_json.fetchedAt cannot serve, because it says when the stored hours
-- were fetched and must not move when Places returns none.
--
-- ADDITIVE ONLY (CLAUDE.md, safe in a single release): one nullable column,
-- no default, so no table rewrite; one partial index. NULL means "never
-- checked by a refresh", and the refresh then falls back to fetchedAt. A
-- function deployed before this is applied answers 42703 on the refresh query
-- and writes nothing; the fill mode never reads the column.

ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS hours_checked_at timestamptz;

COMMENT ON COLUMN public.restaurants.hours_checked_at IS
  'When bulk-update-restaurants last asked Google Places for this row''s hours and status (WEB-FEAT-079), whatever Places answered. NULL: never checked by a refresh; hours_json.fetchedAt is the age of the stored hours. Not a claim that hours_json is fresh.';

-- The refresh reads rows with hours, oldest check first.
CREATE INDEX IF NOT EXISTS idx_restaurants_hours_checked_at
  ON public.restaurants (hours_checked_at NULLS FIRST)
  WHERE hours_json IS NOT NULL;
