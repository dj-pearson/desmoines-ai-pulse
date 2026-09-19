-- WEB-BE-049: one-time backfill of events.category onto the canonical vocabulary.
--
-- WHY THE ROWS NEED FIXING AND NOT JUST THE WRITERS. There was never a category
-- list. SeatGeek wrote 'Comedy' and 'Family' that no other path produced;
-- tribeEvents, venueProfile and all three row builders defaulted to 'General';
-- the shared extraction prompt asked for six categories and then showed the
-- model an example reading "category": "Concert". The /events filter chips come
-- from get_event_categories, a SELECT DISTINCT, so every one of those words is a
-- chip a visitor can click, and src/pseo/listingFilters.ts had to match
-- categories with regexes to find anything at all.
--
-- The writers now call normalizeCategory (supabase/functions/_shared/eventCategories.ts,
-- crawlers/catchdesmoines_crawler.py). This applies the same decision to the
-- rows that predate them.
--
-- GENERATED FROM supabase/functions/_shared/eventCategories.json (version 1).
-- Postgres's \m is a word-START boundary, which is exactly the rule the runtime
-- normalizer uses: a plain LIKE '%art%' files 'Block Party' under Arts. The arm
-- order below is the JSON's group order and is load-bearing - first match wins
-- in both places, which is why 'Job Fair' is Business and not Festival.
--
-- NO CHECK CONSTRAINT YET, deliberately. Edge functions deploy separately from
-- migrations (CLAUDE.md, Backward Compatibility), so a CHECK added here would
-- reject every insert from any writer not yet redeployed, and tightening a CHECK
-- in the release that introduces the shape is on the 'never' list. It belongs in
-- a later release, once these writers are live and this backfill has been
-- observed to leave nothing outside the vocabulary.
--
-- Idempotent: a canonical value matches its own arm and is rewritten to itself,
-- so a re-run reports 0 rows changed.

-- pg_temp so it disappears with the session: this is the backfill's opinion,
-- not a function anything should start calling. Declared once and used twice
-- rather than pasting a thirteen-arm CASE into both the SET and the WHERE,
-- where the two copies could drift within one statement.
CREATE FUNCTION pg_temp.web_be_049_canonical(text) RETURNS text
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT CASE
    WHEN btrim($1) ~* '\m(music|concert|symphony|orchestra|choir)' THEN 'Music'
    WHEN btrim($1) ~* '\m(comedy|stand-up|standup|improv)' THEN 'Comedy'
    WHEN btrim($1) ~* '\m(sport|athletic|baseball|basketball|football|hockey|soccer|wrestling|marathon|rodeo)' THEN 'Sports'
    WHEN btrim($1) ~* '\m(art|culture|theater|theatre|museum|gallery|dance|ballet|opera|exhibit|craft)' THEN 'Arts'
    WHEN btrim($1) ~* '\m(famil|kid|child|youth|toddler)' THEN 'Family'
    WHEN btrim($1) ~* '\m(food|drink|dining|restaurant|culinary|brew|wine|beer|tasting)' THEN 'Food'
    WHEN btrim($1) ~* '\m(business|network|career|profession|conference|trade show|job fair|expo)' THEN 'Business'
    WHEN btrim($1) ~* '\m(farmer|flea market|farmers market|market)' THEN 'Markets'
    WHEN btrim($1) ~* '\m(festival|fair|parade|carnival)' THEN 'Festival'
    WHEN btrim($1) ~* '\m(outdoor|recreation|hike|hiking|trail|nature|garden|cycling|camping)' THEN 'Outdoor'
    WHEN btrim($1) ~* '\m(health|wellness|fitness|yoga|medical|mental)' THEN 'Health'
    WHEN btrim($1) ~* '\m(communit|civic|volunteer|charity|benefit|fundrais|church|faith|worship|neighborhood)' THEN 'Community'
    WHEN btrim($1) ~* '\m(educat|learn|class|workshop|seminar|lecture|library|author|book)' THEN 'Education'
    WHEN btrim($1) ~* '\m(entertain|nightlife|night life|film|movie|cinema|trivia|karaoke|circus|magic|show)' THEN 'Entertainment'
    ELSE 'Other'
  END
$fn$;

DO $do$
DECLARE
  before_distinct integer;
  after_distinct integer;
  changed integer;
BEGIN
  SELECT count(DISTINCT category) INTO before_distinct FROM public.events;

  WITH mapped AS (
    UPDATE public.events e
    SET category = pg_temp.web_be_049_canonical(e.category)
    WHERE e.category IS DISTINCT FROM pg_temp.web_be_049_canonical(e.category)
    RETURNING 1
  )
  SELECT count(*) INTO changed FROM mapped;

  SELECT count(DISTINCT category) INTO after_distinct FROM public.events;

  -- The numbers this migration is judged by, and the reason to read the apply
  -- log rather than assume. 0 rows changed against a high distinct count means
  -- the arms are not matching what is actually stored.
  RAISE NOTICE 'WEB-BE-049 backfill: % row(s) rewritten; distinct categories % -> %',
    changed, before_distinct, after_distinct;
END
$do$;

-- Anything left outside the vocabulary is a defect in the arms above, not data
-- to live with. Fails the migration rather than leaving behind a filter chip
-- nobody can explain.
DO $do$
DECLARE
  stragglers text;
BEGIN
  SELECT string_agg(DISTINCT category, ', ')
  INTO stragglers
  FROM public.events
  WHERE category IS NOT NULL
    AND category NOT IN ('Music', 'Sports', 'Arts', 'Comedy', 'Entertainment', 'Family', 'Food', 'Markets', 'Festival', 'Outdoor', 'Health', 'Community', 'Business', 'Education', 'Other');

  IF stragglers IS NOT NULL THEN
    RAISE EXCEPTION 'WEB-BE-049: categories outside the vocabulary survived the backfill: %', stragglers;
  END IF;
END
$do$;

COMMENT ON COLUMN public.events.category IS
  'Canonical event category (WEB-BE-049). The vocabulary lives in supabase/functions/_shared/eventCategories.json and every writer normalizes through it. A CHECK constraint is deliberately deferred to a later release.';
