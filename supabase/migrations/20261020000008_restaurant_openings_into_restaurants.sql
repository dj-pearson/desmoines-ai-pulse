-- WEB-BE-054: restaurant openings live in public.restaurants.
--
-- Owner decision, 2026-10-18: an opening becomes a restaurant, so it is a
-- restaurants row from the start, with status announced / opening_soon /
-- newly_opened and opening_date / opening_timeframe. The public site already
-- reads them that way (useRestaurantOpenings in src/hooks/useSupabase.ts), and
-- ai-crawler already writes them that way.
--
-- public.restaurant_openings was a second home for the same thing: created by
-- no tracked migration, written by firecrawl's table map and the n8n exports,
-- read only by an admin hook whose results nothing rendered. This copies any
-- rows it holds into restaurants so none are lost when the writers move.
--
-- Additive only. The old table is NOT dropped here; that waits for a later
-- release per CLAUDE.md's deprecation flow, once nothing writes to it.
-- Idempotent: a row whose name already exists in restaurants (case and
-- whitespace insensitive) is skipped, so re-running copies nothing twice.
-- Guarded: a database without the old table does nothing.

DO $$
DECLARE
  copied integer;
BEGIN
  IF to_regclass('public.restaurant_openings') IS NULL THEN
    RAISE NOTICE 'WEB-BE-054: public.restaurant_openings does not exist; nothing to copy.';
    RETURN;
  END IF;

  EXECUTE $sql$
    INSERT INTO public.restaurants
      (name, cuisine, location, description, opening_date, opening_timeframe,
       status, source_url, created_at, updated_at)
    SELECT
      btrim(ro.name),
      ro.cuisine,
      ro.location,
      ro.description,
      -- Whatever type the old column has, only a leading YYYY-MM-DD is trusted;
      -- anything else becomes NULL rather than failing the whole copy.
      CASE WHEN ro.opening_date::text ~ '^\d{4}-\d{2}-\d{2}'
           THEN substr(ro.opening_date::text, 1, 10)::date END,
      ro.opening_timeframe,
      -- restaurants.status has a CHECK; an unknown value would abort the copy.
      CASE WHEN ro.status IN ('announced', 'opening_soon', 'newly_opened')
           THEN ro.status ELSE 'announced' END,
      ro.source_url,
      COALESCE(ro.created_at, now()),
      now()
    FROM public.restaurant_openings ro
    WHERE NULLIF(btrim(ro.name), '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.restaurants r
        WHERE lower(btrim(r.name)) = lower(btrim(ro.name))
      )
  $sql$;

  GET DIAGNOSTICS copied = ROW_COUNT;
  RAISE NOTICE 'WEB-BE-054: copied % restaurant_openings row(s) into restaurants.', copied;
END $$;
