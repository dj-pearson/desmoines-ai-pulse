-- WEB-SEO-019: accented characters are DELETED from restaurant slugs, not
-- transliterated.
--
-- generate_restaurant_slug strips anything outside [a-zA-Z0-9\s-], so a name
-- with an accent loses the letter entirely rather than folding it to its ASCII
-- form. Measured in production:
--     Vietnam Cafe (with an acute e)  ->  vietnam-caf
--     Atlas Cafe                      ->  atlas-caf
--     Dore Bakery                     ->  dor-bakery
--     El Fogon                        ->  el-fogn
--     Ritual Cafe                     ->  ritual-caf
-- Eight restaurants are affected. atlas-caf is not a hypothetical: it is one of
-- the pages that actually earns clicks in the Search Console window
-- (213 impressions, 7 clicks) -- see docs/GSC_QUERY_FINDINGS.md.
--
-- unaccent() is already installed, so the fix is to fold before stripping.

CREATE OR REPLACE FUNCTION public.generate_restaurant_slug(restaurant_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  RETURN lower(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          -- Fold accents to ASCII FIRST. Without this the character class below
          -- deletes them: 'Cafe' with an acute e became 'Caf'.
          public.unaccent(restaurant_name),
          '[^a-zA-Z0-9\s-]', '', 'g'
        ),
        '\s+', '-', 'g'
      ),
      '-+', '-', 'g'
    )
  );
END;
$function$;

/**
 * Assign a slug on insert, and on a name change ONLY when there is no slug yet.
 *
 * WHY THE GUARD IS NOT OPTIONAL. The trigger fires BEFORE INSERT OR UPDATE OF
 * name and previously reassigned NEW.slug unconditionally. That was harmless
 * while the generator was deterministic and unchanged -- it recomputed the same
 * value. Fixing the generator breaks that: the next time anyone edits the name
 * of an accented restaurant, its slug would silently change from vietnam-caf to
 * vietnam-cafe and the indexed URL would 404.
 *
 * A slug is a public route. CLAIMED-then-changed is exactly what CLAUDE.md's
 * rule about renaming a public route without a redirect is for, so existing
 * slugs are now frozen and any change is a deliberate, migrated act.
 */
CREATE OR REPLACE FUNCTION public.auto_generate_restaurant_slug()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 1;
BEGIN
  -- Keep an existing slug. Renaming a live restaurant must not move its URL.
  IF TG_OP = 'UPDATE' AND NEW.slug IS NOT NULL AND NEW.slug <> '' THEN
    RETURN NEW;
  END IF;

  base_slug := public.generate_restaurant_slug(NEW.name);

  -- A name that is entirely non-alphanumeric would otherwise produce an empty
  -- slug and then collide with every other empty one.
  IF base_slug IS NULL OR btrim(base_slug, '-') = '' THEN
    base_slug := 'restaurant';
  END IF;

  final_slug := base_slug;

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
