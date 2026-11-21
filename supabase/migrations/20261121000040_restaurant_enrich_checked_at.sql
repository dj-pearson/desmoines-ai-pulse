-- WEB-BE-066: restaurants.enrich_checked_at, when the full Google Places
-- enrichment (bulk-update-restaurants) last got an answer for the row.
--
-- auto-enrich-restaurants picks the incomplete rows newest first (or lowest
-- data_quality_score first). A row Google cannot complete, because the place
-- has no phone or website, or no search hit carries its name, stayed
-- incomplete and was picked again every day, ahead of rows Google could fill.
-- bulk-update-restaurants now stamps this column whenever Google answered,
-- and auto-enrich-restaurants skips rows stamped within the last 30 days
-- (ENRICH_RETRY_DAYS in supabase/functions/_shared/restaurantEnrich.ts).
--
-- Additive only: a nullable column with no default, so no table rewrite and
-- nothing an older client reads changes. Both functions retry without the
-- column when PostgREST reports it unknown, so deploying them before this
-- migration costs the stamp and nothing else.

ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS enrich_checked_at timestamptz;

COMMENT ON COLUMN public.restaurants.enrich_checked_at IS
  'WEB-BE-066: when bulk-update-restaurants last got a Google Places answer for this row. auto-enrich-restaurants skips rows stamped within 30 days.';
