-- ADMIN-PLAYGROUND-001: Admin curation fields for playgrounds.
-- Source tells admins whether a row was auto-imported by
-- populate-playgrounds or manually added. manually_curated marks rows
-- the admin has edited so any future refresh-from-Google path can skip
-- them.

ALTER TABLE public.playgrounds
  ADD COLUMN IF NOT EXISTS has_restrooms BOOLEAN,
  ADD COLUMN IF NOT EXISTS has_shade BOOLEAN,
  ADD COLUMN IF NOT EXISTS surface_type TEXT,
  ADD COLUMN IF NOT EXISTS accessibility_notes TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS manually_curated BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.playgrounds.source IS 'Where the row came from: "manual" (admin-added) or "google_places" (populate-playgrounds).';
COMMENT ON COLUMN public.playgrounds.manually_curated IS 'Set true on every admin edit; protects the row from future automated refreshes.';

-- Best-effort backfill: rows that look like they came from the Google
-- Places import (have a location and lack age_range/amenities/etc. that
-- only a human would set) are flagged source='google_places'. Anything
-- else is left as the new default 'manual'. Safe to re-run.
UPDATE public.playgrounds
SET source = 'google_places'
WHERE source = 'manual'
  AND age_range IS NULL
  AND amenities IS NULL
  AND created_at IS NOT NULL;
