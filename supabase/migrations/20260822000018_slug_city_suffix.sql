-- WEB-SEO-019 AC6: name a second location after its city, not after a counter.
--
-- Five slugs end in -N today and three of them are genuine second locations:
--     flipn-jacks-pancake-house-eatery-2   is the Altoona one (the other is Ames)
--     texas-roadhouse-2                    is West Des Moines (the other is Johnston)
--     el-rincn-catracho-2                  is a name that genuinely ends in 2
-- The URL tells a reader nothing about which restaurant it is, and it tells a
-- search engine nothing either -- while "flipn-jacks-pancake-house-eatery-altoona"
-- carries the town name, which is what people actually search: every one of the
-- top page-2 queries in docs/GSC_QUERY_FINDINGS.md is a restaurant name plus a
-- place.
--
-- NEW ROWS ONLY. Existing slugs stay frozen by the guard added in
-- 20260822000014, so nothing indexed moves. flipn-jacks-...-2 in particular is
-- the highest-impression page on the site and is deliberately left alone.
--
-- The city comes from `city` when it is set (314 of 478 rows) and otherwise from
-- the address, which is consistently "street, City, ST ZIP, USA". The counter
-- remains as the last resort, for a genuine third location in one city or a row
-- with no usable address.

CREATE OR REPLACE FUNCTION public.auto_generate_restaurant_slug()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  base_slug  TEXT;
  city_part  TEXT;
  city_slug  TEXT;
  final_slug TEXT;
  counter    INTEGER := 1;
BEGIN
  -- Renaming a live restaurant must not move its URL (WEB-SEO-019 AC2).
  IF TG_OP = 'UPDATE' AND NEW.slug IS NOT NULL AND NEW.slug <> '' THEN
    RETURN NEW;
  END IF;

  base_slug := public.generate_restaurant_slug(NEW.name);

  IF base_slug IS NULL OR btrim(base_slug, '-') = '' THEN
    base_slug := 'restaurant';
  END IF;

  final_slug := base_slug;

  IF EXISTS (
    SELECT 1 FROM public.restaurants
    WHERE slug = final_slug
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000')
  ) THEN
    -- Collision. Prefer the city over a counter.
    city_part := NULLIF(btrim(COALESCE(NEW.city, '')), '');
    IF city_part IS NULL AND NEW.location IS NOT NULL THEN
      city_part := NULLIF(btrim(split_part(NEW.location, ',', 2)), '');
    END IF;

    IF city_part IS NOT NULL THEN
      city_slug := public.generate_restaurant_slug(city_part);
      -- Only if the city adds something: "Des Moines Diner" in Des Moines would
      -- otherwise become des-moines-diner-des-moines.
      IF city_slug <> '' AND position(city_slug in base_slug) = 0 THEN
        final_slug := base_slug || '-' || city_slug;
      END IF;
    END IF;
  END IF;

  -- Counter as the last resort: a third location in one city, or no usable
  -- address.
  WHILE EXISTS (
    SELECT 1 FROM public.restaurants
    WHERE slug = final_slug
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000')
  ) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;

  NEW.slug := final_slug;
  RETURN NEW;
END;
$function$;
