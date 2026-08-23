-- WEB-SEO-019 AC4: remove the two genuine duplicate restaurants.
--
-- Found by grouping on normalised name AND address, which is the check that
-- distinguishes a real duplicate from a second location. Name alone would have
-- wrongly merged Texas Roadhouse (Johnston vs West Des Moines) and Flip'N Jacks
-- (Ames vs Altoona).
--
--   daves-hot-chicken   / daves-hot-chicken-2    both 3022 E 53rd St, Davenport
--   outback-steakhouse  / outback-steakhouse-2   both 10901 University Ave, Clive
--
-- Every other field matches too: same cuisine, price, rating, phone, image and
-- description. Created a day apart and eight seconds apart respectively.
--
-- WHICH ROW SURVIVES IS THE INTERESTING PART, and it is not the older one.
-- Search Console for the 29-day window:
--   /restaurants/daves-hot-chicken-2    388 impressions, 2 clicks, position 11.9
--   /restaurants/outback-steakhouse-2    17 impressions, 0 clicks, position 24.6
--   /restaurants/daves-hot-chicken        no rows
--   /restaurants/outback-steakhouse       no rows
-- Google indexed the -2 URLs and has never seen the others. So the ugly slug is
-- the asset, and the clean one is the row to drop. Renaming the survivor to the
-- clean slug would move a URL that ranks, which is the one thing worth avoiding
-- here; public/_redirects carries a 301 for the retired slugs instead.
--
-- The attached menus are the same source page scraped twice
-- (restaurants.daveshotchicken.com/.../menu and /dining, 4007 and 4078 bytes),
-- so nothing distinct is lost. Only restaurant_menus and menu_scrape_attempts
-- reference restaurants by id.

DO $$
DECLARE
  dropped integer;
BEGIN
  -- Guard: only delete when the pair is still exactly as measured. If the data
  -- has moved on, do nothing rather than delete the wrong row.
  DELETE FROM public.restaurants r
  WHERE r.slug IN ('daves-hot-chicken', 'outback-steakhouse')
    AND EXISTS (
      SELECT 1 FROM public.restaurants keeper
      WHERE keeper.slug = r.slug || '-2'
        AND keeper.name = r.name
        AND keeper.location IS NOT DISTINCT FROM r.location
    );

  GET DIAGNOSTICS dropped = ROW_COUNT;
  RAISE NOTICE 'WEB-SEO-019: removed % duplicate restaurant row(s)', dropped;
END $$;
