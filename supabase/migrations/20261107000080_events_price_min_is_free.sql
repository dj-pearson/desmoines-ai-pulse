-- WEB-BE-049 AC3, slice 2: events.price_min and events.is_free, derived from
-- events.price by the database.
--
-- WHY. events.price is free text ("Free", "$25", "$25-$60", "Free - $20",
-- "See website"). Every reader that wants "free tonight" or "under $20" has to
-- re-parse it, and the free filter is a PostgREST regex (FREE_PRICE_FILTER in
-- src/lib/eventPrice.ts) that nothing can index. Two typed columns let a page
-- ask the question directly.
--
-- WHY A TRIGGER AND NOT THE WRITERS. Edge functions deploy separately from
-- migrations. A scraper that sends price_min before this file is applied gets
-- PGRST204 on every insert, and the ingest paths number more than a dozen. A
-- BEFORE trigger needs no writer change at all, works for every path that
-- writes price (scrapers, admin edits, submissions, SQL), and leaves exactly
-- one parser on the write side. The trigger owns both columns: a value a
-- client sends for them is overwritten from price.
--
-- WHAT THE COLUMNS MEAN. Both mirror readers that already ship, so a page that
-- switches to the column shows the same rows it showed before.
--
--   is_free    true  exactly when isFreePrice() (src/lib/eventPrice.ts) is
--                    true: "free" anywhere in the text and no "$" followed
--                    by a nonzero digit, or a bare zero ("0", "$0", "$0.00").
--                    FREE_PRICE_FILTER selects the same rows except a zero
--                    written with decimals or padding ("$0.00", "0.0"): its
--                    eq tests are exact, so the badge already calls those
--                    free and the filter misses them. The column follows the
--                    badge, so slice 3 gains those rows and loses none.
--              false when the text names a nonzero amount ("$25",
--                    "Free - $20", "$0-$25", "25").
--              NULL  when it says neither ("See website", "TBD", "Donation",
--                    blank, NULL). Unknown is not paid and not free
--                    (WEB-SEO-018); isFreePrice prints "Price not listed".
--
--   price_min  the lowest amount parseEventPrice() (src/lib/eventOffers.ts)
--              reads, which is what Event JSON-LD publishes as lowPrice:
--              dollar-tagged amounts first, else a string that is entirely
--              a number or a numeric range. A free tier ("Free - $20",
--              "No charge for kids, $10 adults") makes it 0. NULL when no
--              amount and no free wording. A row with is_free = true always
--              has price_min = 0.
--
-- BACKWARD COMPATIBILITY (CLAUDE.md). ADD COLUMN ... NULL with no default, so
-- no table rewrite; three new IMMUTABLE functions; one new trigger; two
-- partial indexes. No CHECK constraint and no NOT NULL. No shipped web, iOS or
-- Android client selects these columns, so nothing reads them until slice 3,
-- which ships only after this has been applied and types.ts regenerated (a
-- client that selects a column the table lacks gets 42703 on the whole query).

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS price_min numeric,
  ADD COLUMN IF NOT EXISTS is_free boolean;

COMMENT ON COLUMN public.events.price_min IS
  'Lowest price in USD parsed from events.price by trg_events_price_derived '
  '(WEB-BE-049). 0 when a free tier exists. NULL = no readable price. '
  'Do not write directly; the trigger overwrites it.';

COMMENT ON COLUMN public.events.is_free IS
  'Tristate parsed from events.price by trg_events_price_derived (WEB-BE-049). '
  'true = free (same rows as FREE_PRICE_FILTER), false = names a nonzero amount, '
  'NULL = price not listed. NULL must not be read as false. '
  'Do not write directly; the trigger overwrites it.';

-- Every amount parseEventPrice's extractAmounts() would read, in order.
-- Dollar-tagged amounts win; without any, only a string that is entirely a
-- number or entirely a numeric range counts, because digits pulled out of
-- prose ("Ages 21+", "Doors 7pm") are not prices. Amounts above 100000 are a
-- year, a phone number or an id and are dropped, as in the TS.
CREATE OR REPLACE FUNCTION public.event_price_amounts(p_price text)
RETURNS numeric[]
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
  amounts numeric[] := '{}';
  m text[];
  v numeric;
  bare text;
BEGIN
  IF p_price IS NULL THEN
    RETURN amounts;
  END IF;

  FOR m IN
    SELECT regexp_matches(p_price, '[$][[:space:]]*([0-9][0-9,]*(?:[.][0-9]{1,2})?)', 'g')
  LOOP
    v := replace(m[1], ',', '')::numeric;
    IF v <= 100000 THEN
      amounts := amounts || v;
    END IF;
  END LOOP;
  IF cardinality(amounts) > 0 THEN
    RETURN amounts;
  END IF;

  bare := replace(regexp_replace(p_price, '^[[:space:]]+|[[:space:]]+$', '', 'g'), ',', '');
  IF bare ~ '^[0-9]+(?:[.][0-9]{1,2})?$' THEN
    v := bare::numeric;
    IF v <= 100000 THEN
      amounts := amounts || v;
    END IF;
    RETURN amounts;
  END IF;

  -- A bare range: hyphen-minus or any of the dashes U+2010-U+2015, written as
  -- escapes so this file stays ASCII. The \u escapes need a UTF8 database
  -- (Supabase is); under SQL_ASCII they match nothing and a dashed range reads
  -- as unknown, never as a wrong number.
  m := regexp_match(
    bare,
    '^([0-9]+(?:[.][0-9]{1,2})?)[[:space:]]*[-\u2010-\u2015][[:space:]]*([0-9]+(?:[.][0-9]{1,2})?)$'
  );
  IF m IS NOT NULL THEN
    FOR i IN 1..2 LOOP
      v := m[i]::numeric;
      IF v <= 100000 THEN
        amounts := amounts || v;
      END IF;
    END LOOP;
  END IF;
  RETURN amounts;
END;
$$;

-- parseEventPrice's low end: 0 for a free tier or an all-zero price, the
-- smallest amount otherwise, NULL when the text names neither.
CREATE OR REPLACE FUNCTION public.event_price_min(p_price text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
  amounts numeric[] := public.event_price_amounts(p_price);
  says_free boolean := coalesce(p_price ~* '\m(free|no charge|no cost|complimentary)\M', false);
BEGIN
  IF cardinality(amounts) = 0 THEN
    RETURN CASE WHEN says_free THEN 0 ELSE NULL END;
  END IF;
  IF says_free THEN
    RETURN 0;
  END IF;
  RETURN (SELECT min(a) FROM unnest(amounts) AS a);
END;
$$;

-- isFreePrice for true; false only when the text names a nonzero amount;
-- NULL otherwise. The true branch uses FREE_PRICE_FILTER's own pieces:
-- "free" as a substring (ilike %free%), refused by a "$" followed by spaces
-- and a nonzero digit ([$] *[1-9]); then isFreePrice's ZERO_RE.
CREATE OR REPLACE FUNCTION public.event_price_is_free(p_price text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
  t text;
BEGIN
  IF p_price IS NULL THEN
    RETURN NULL;
  END IF;
  t := regexp_replace(p_price, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  IF t = '' THEN
    RETURN NULL;
  END IF;
  IF t ~* 'free' AND t !~ '[$] *[1-9]' THEN
    RETURN true;
  END IF;
  IF t ~ '^[$]?0([.]0+)?$' THEN
    RETURN true;
  END IF;
  IF t ~ '[$] *[1-9]'
     OR EXISTS (SELECT 1 FROM unnest(public.event_price_amounts(t)) AS a WHERE a > 0) THEN
    RETURN false;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.events_price_derived()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.is_free := public.event_price_is_free(NEW.price);
  NEW.price_min := CASE
    WHEN NEW.is_free THEN 0
    ELSE public.event_price_min(NEW.price)
  END;
  RETURN NEW;
END;
$$;

-- Every INSERT and UPDATE, not only UPDATE OF price, so a direct write to
-- either derived column is corrected on the spot rather than left to drift.
DROP TRIGGER IF EXISTS trg_events_price_derived ON public.events;
CREATE TRIGGER trg_events_price_derived
  BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.events_price_derived();

-- Backfill. events has no updated_at trigger, and update_event_popularity only
-- recomputes when is_featured, date or view_count change, so this rewrites the
-- two new columns and nothing a reader can see. IS DISTINCT FROM keeps a
-- replay a no-op.
WITH derived AS (
  SELECT
    id,
    public.event_price_is_free(price) AS is_free
  FROM public.events
)
UPDATE public.events AS e
SET
  is_free = d.is_free,
  price_min = CASE WHEN d.is_free THEN 0 ELSE public.event_price_min(e.price) END
FROM derived AS d
WHERE e.id = d.id
  AND (
    e.is_free IS DISTINCT FROM d.is_free
    OR e.price_min IS DISTINCT FROM
       CASE WHEN d.is_free THEN 0 ELSE public.event_price_min(e.price) END
  );

DO $$
DECLARE
  n_free bigint;
  n_paid bigint;
  n_unknown bigint;
BEGIN
  SELECT
    count(*) FILTER (WHERE is_free IS TRUE),
    count(*) FILTER (WHERE is_free IS FALSE),
    count(*) FILTER (WHERE is_free IS NULL)
  INTO n_free, n_paid, n_unknown
  FROM public.events;
  RAISE NOTICE 'WEB-BE-049 price backfill: % free, % paid, % price not listed',
    n_free, n_paid, n_unknown;
END;
$$;

-- The free-events pages ask for upcoming free rows; "under $X" asks by
-- price_min. Partial, so the unknown majority stays out of both.
CREATE INDEX IF NOT EXISTS idx_events_is_free_date
  ON public.events (date)
  WHERE is_free IS TRUE;

CREATE INDEX IF NOT EXISTS idx_events_price_min
  ON public.events (price_min)
  WHERE price_min IS NOT NULL;
