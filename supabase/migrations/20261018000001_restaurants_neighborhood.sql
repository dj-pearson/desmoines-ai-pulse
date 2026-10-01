-- restaurants.neighborhood: the neighbourhood a restaurant sits in (SEO-060).
--
-- restaurants.city holds the municipality, so every downtown, East Village and
-- Beaverdale row reads "Des Moines" and nothing said which neighbourhood it was
-- in. The /<cuisine>/downtown, /east-village and /valley-junction pSEO pages
-- filtered on a name no row carries and listed nothing.
--
-- The value is a taxonomy location slug ('downtown', 'east-village',
-- 'sherman-hill', 'valley-junction'), assigned from latitude/longitude by
-- scripts/assign-restaurant-neighborhoods.ts against the polygons in
-- src/lib/neighborhoodBoundaries.ts. NULL means "not in a mapped
-- neighbourhood", which is most rows (suburbs, and Des Moines outside the
-- mapped areas).
--
-- Backward compatibility (CLAUDE.md): additive only. A nullable column with no
-- default, no constraint, no trigger; existing readers and writers, including
-- shipped iOS/Android binaries, never see it unless they select it. No CHECK on
-- the values on purpose: adding a neighbourhood later should not need a
-- constraint swap.

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS neighborhood text;

COMMENT ON COLUMN public.restaurants.neighborhood IS
  'Taxonomy location slug of the neighbourhood (downtown, east-village, sherman-hill, valley-junction), assigned from lat/lng by scripts/assign-restaurant-neighborhoods.ts. NULL = not in a mapped neighbourhood.';

-- Partial: only the few dozen mapped rows are indexed. The pSEO listing filters
-- on neighborhood = <slug>.
CREATE INDEX IF NOT EXISTS idx_restaurants_neighborhood
  ON public.restaurants (neighborhood)
  WHERE neighborhood IS NOT NULL;
