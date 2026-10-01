-- WEB-PERF-031: give playgrounds and attractions a slug column.
--
-- THE DEFECT. Neither table has a slug, but both have a /:slug route, so the
-- client resolves one row by downloading candidates and running
-- createSlug(name) over them in JavaScript:
--   - PlaygroundDetails.tsx selected EVERY playground with select('*') and
--     called .find().
--   - usePrefetchAttraction did the same for attractions - on card HOVER, so
--     moving a mouse across the attractions grid downloaded the table once per
--     card until the ref caught up.
--   - AttractionDetails scanned (id, name) and then fetched the matched row,
--     which is the cheap version of the same wrong shape.
--
-- THE SQL MUST AGREE WITH THE TYPESCRIPT, character for character, or a URL the
-- router accepts resolves to nothing. src/lib/slug.ts is:
--     name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
-- which is lower(), then runs of non-[a-z0-9] collapsed to one hyphen, then
-- leading and trailing hyphens trimmed. content_slug() below is that, and
-- src/lib/__tests__/slug.test.ts asserts this file still contains it.
--
-- RELEASE N OF TWO for the readers. Pages deploy on push to main while
-- migrations are applied by hand, so the detail pages query the slug column
-- first and fall back to the name scan when PostgREST answers 42703/PGRST204.
-- The fallback comes out in the release after this is applied.

CREATE OR REPLACE FUNCTION public.content_slug(source text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT btrim(regexp_replace(lower(coalesce(source, '')), '[^a-z0-9]+', '-', 'g'), '-')
$fn$;

COMMENT ON FUNCTION public.content_slug(text) IS
  'URL slug from a display name (WEB-PERF-031). Must stay identical to createSlug in src/lib/slug.ts.';

ALTER TABLE public.playgrounds ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.attractions ADD COLUMN IF NOT EXISTS slug text;

-- BACKFILL WITH AN EXPLICIT COLLISION ORDER. Two rows with the same name
-- produce the same slug, and today .find() returns whichever PostgREST happened
-- to order first - so which of the two the URL opens is already unspecified.
-- Ranking by created_at makes the OLDEST row keep the bare slug and gives the
-- later ones a numeric suffix, which is both deterministic and the answer most
-- existing inbound links already got.
--
-- A name with no alphanumerics at all slugs to the empty string. That is a row
-- with no reachable URL either way; it gets a stable id-derived slug rather
-- than an empty one, so the unique index below means something.
DO $do$
DECLARE
  tbl text;
  collisions integer;
  filled integer;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['playgrounds', 'attractions'] LOOP
    EXECUTE format($sql$
      WITH ranked AS (
        SELECT
          id,
          coalesce(nullif(public.content_slug(name), ''), 'item-' || left(id::text, 8)) AS base,
          row_number() OVER (
            PARTITION BY coalesce(nullif(public.content_slug(name), ''), 'item-' || left(id::text, 8))
            ORDER BY created_at NULLS LAST, id
          ) AS rn
        FROM public.%1$I
      )
      UPDATE public.%1$I t
      SET slug = CASE WHEN r.rn = 1 THEN r.base ELSE r.base || '-' || r.rn END
      FROM ranked r
      WHERE r.id = t.id
        AND t.slug IS DISTINCT FROM (CASE WHEN r.rn = 1 THEN r.base ELSE r.base || '-' || r.rn END)
    $sql$, tbl);

    EXECUTE format('SELECT count(*) FROM public.%1$I WHERE slug IS NOT NULL', tbl) INTO filled;
    EXECUTE format($sql$
      SELECT count(*) FROM (
        SELECT public.content_slug(name) FROM public.%1$I
        GROUP BY 1 HAVING count(*) > 1
      ) dupes
    $sql$, tbl) INTO collisions;

    -- Read these in the apply log. A non-zero collision count means that many
    -- names are duplicated, and the suffixed rows are reachable only at their
    -- suffixed URL - which is not in any sitemap until the next generate run.
    RAISE NOTICE 'WEB-PERF-031: %.slug filled for % row(s); % duplicated name(s) took a numeric suffix',
      tbl, filled, collisions;
  END LOOP;
END
$do$;

-- Keep the slug in step with the name. BEFORE INSERT OR UPDATE OF name only:
-- an ordinary UPDATE that does not touch the name must not pay for the
-- uniqueness probe, and must not renumber a slug that inbound links use.
CREATE OR REPLACE FUNCTION public.playgrounds_set_slug()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  base text;
  candidate text;
  n integer := 1;
BEGIN
  base := coalesce(nullif(public.content_slug(NEW.name), ''), 'item-' || left(NEW.id::text, 8));
  candidate := base;
  WHILE EXISTS (SELECT 1 FROM public.playgrounds WHERE slug = candidate AND id <> NEW.id) LOOP
    n := n + 1;
    candidate := base || '-' || n;
  END LOOP;
  NEW.slug := candidate;
  RETURN NEW;
END
$fn$;

CREATE OR REPLACE FUNCTION public.attractions_set_slug()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  base text;
  candidate text;
  n integer := 1;
BEGIN
  base := coalesce(nullif(public.content_slug(NEW.name), ''), 'item-' || left(NEW.id::text, 8));
  candidate := base;
  WHILE EXISTS (SELECT 1 FROM public.attractions WHERE slug = candidate AND id <> NEW.id) LOOP
    n := n + 1;
    candidate := base || '-' || n;
  END LOOP;
  NEW.slug := candidate;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_playgrounds_set_slug ON public.playgrounds;
CREATE TRIGGER trg_playgrounds_set_slug
  BEFORE INSERT OR UPDATE OF name ON public.playgrounds
  FOR EACH ROW EXECUTE FUNCTION public.playgrounds_set_slug();

DROP TRIGGER IF EXISTS trg_attractions_set_slug ON public.attractions;
CREATE TRIGGER trg_attractions_set_slug
  BEFORE INSERT OR UPDATE OF name ON public.attractions
  FOR EACH ROW EXECUTE FUNCTION public.attractions_set_slug();

-- The index the whole story is about: the detail lookup becomes one row by
-- unique key instead of a table download. Unique because two rows answering
-- the same URL is the bug the backfill just resolved, and an index that does
-- not enforce it lets the next duplicate name re-introduce it silently.
CREATE UNIQUE INDEX IF NOT EXISTS idx_playgrounds_slug ON public.playgrounds (slug);
CREATE UNIQUE INDEX IF NOT EXISTS idx_attractions_slug ON public.attractions (slug);

COMMENT ON COLUMN public.playgrounds.slug IS
  'URL slug, maintained by trg_playgrounds_set_slug from name (WEB-PERF-031).';
COMMENT ON COLUMN public.attractions.slug IS
  'URL slug, maintained by trg_attractions_set_slug from name (WEB-PERF-031).';
