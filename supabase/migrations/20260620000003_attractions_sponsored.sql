-- WEB-FEAT-005: bring attractions in line with events/restaurants for
-- sponsored/featured listings. Additive columns only — safe in a single
-- release (events & restaurants already carry these).

ALTER TABLE public.attractions
  ADD COLUMN IF NOT EXISTS is_sponsored boolean NOT NULL DEFAULT false;

ALTER TABLE public.attractions
  ADD COLUMN IF NOT EXISTS sponsored_until timestamptz;

-- Partial index for the common "active sponsored" lookup.
CREATE INDEX IF NOT EXISTS idx_attractions_sponsored
  ON public.attractions (is_sponsored)
  WHERE is_sponsored = true;

COMMENT ON COLUMN public.attractions.is_sponsored IS
  'WEB-FEAT-005: flags a sponsored/boosted attraction listing.';
COMMENT ON COLUMN public.attractions.sponsored_until IS
  'WEB-FEAT-005: sponsorship expiry; past values lose sponsored treatment.';
