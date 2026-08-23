-- WEB-SEO-019: fix a regression introduced by 20260822000014.
--
-- That migration folded accents with unaccent() so 'Cafe' with an acute e stops
-- becoming 'caf'. It works for letters and is wrong for SYMBOLS, because
-- unaccent EXPANDS those into ASCII text rather than dropping them:
--     unaccent(chr(174))  = '(R)'      the registered mark
--     unaccent(chr(169))  = '(C)'
--     unaccent(chr(189))  = ' 1/2'
-- After the character-class strip that leaves a stray letter. Measured on the
-- one restaurant this affects:
--     'The Bistro - Eat. Drink. Connect.(R)'
--        before 20260822000014 -> the-bistro-eat-drink-connect   (correct)
--        after                 -> the-bistro-eat-drink-connectr  (a trailing r)
-- Nothing shipped with the bad value -- existing slugs are frozen by the trigger
-- guard in the same migration, so this only ever affected slugs generated from
-- now on. It is still a defect and it is fixed here rather than left for the
-- next new restaurant with a trademark symbol in its name.
--
-- The symbol list is written with chr() so this file stays pure ASCII, per the
-- rule in CLAUDE.md about characters in anything a machine parses.

CREATE OR REPLACE FUNCTION public.generate_restaurant_slug(restaurant_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  -- registered, trademark, copyright, service mark, degree
  symbols text := chr(174) || chr(8482) || chr(169) || chr(8480) || chr(176);
BEGIN
  RETURN lower(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          -- 1. Drop symbols outright. They carry no pronunciation, so unlike an
          --    accented letter there is nothing to fold them to.
          -- 2. Then fold accents, so a letter keeps its identity.
          -- 3. Then strip whatever is left that a slug cannot carry.
          public.unaccent(translate(restaurant_name, symbols, '')),
          '[^a-zA-Z0-9\s-]', '', 'g'
        ),
        '\s+', '-', 'g'
      ),
      '-+', '-', 'g'
    )
  );
END;
$function$;
