-- attractions: admission, parking and where those facts came from (SEO-046).
--
-- The table already had hours (jsonb), hours_summary and is_free, all empty on
-- every row. What it lacked was somewhere to put admission prices and parking,
-- and any record of where a fact came from or when someone last checked it.
-- SEO-011 stalled on exactly that: a wrong opening time sends somebody to a
-- closed building, and nothing on the row said whether a value was checked.
--
--   admission_summary  free text as the attraction's own site states it
--                      ("Adults $20, children 2-12 $15, under 2 free").
--   parking_summary    free text, same rule.
--   fact_sources       jsonb array of {url, fields}, one entry per page a fact
--                      was read from. fields lists which of hours, admission,
--                      parking, is_free that page supplied. The detail page
--                      prints "Source: <site>, checked <date>" from it.
--   facts_verified_at  the date those pages were fetched. Not updated_at: that
--                      moves on any write to the row.
--
-- attractions.hours also gains an optional seasonal form, read by
-- src/lib/attractionHours.ts: either the existing {mon: {open, close}, ...}
-- object, the same object with valid_from / valid_through (YYYY-MM-DD), or an
-- array of those. No schema change is needed for that; the column is jsonb.
--
-- Backward compatibility (CLAUDE.md): additive only. Four nullable columns, no
-- defaults, no constraints, no triggers. Existing readers and writers,
-- including shipped iOS/Android binaries, never see them unless they select
-- them.

ALTER TABLE public.attractions
  ADD COLUMN IF NOT EXISTS admission_summary text,
  ADD COLUMN IF NOT EXISTS parking_summary text,
  ADD COLUMN IF NOT EXISTS fact_sources jsonb,
  ADD COLUMN IF NOT EXISTS facts_verified_at date;

COMMENT ON COLUMN public.attractions.admission_summary IS
  'Admission as the attraction''s own site states it. NULL = not verified. Source in fact_sources (SEO-046).';
COMMENT ON COLUMN public.attractions.parking_summary IS
  'Parking as the attraction''s own site states it. NULL = not verified. Source in fact_sources (SEO-046).';
COMMENT ON COLUMN public.attractions.fact_sources IS
  'jsonb array of {url, fields[]}: the pages hours/admission/parking/is_free were read from (SEO-046).';
COMMENT ON COLUMN public.attractions.facts_verified_at IS
  'Date the fact_sources pages were fetched. Not updated_at, which moves on any write (SEO-046).';
