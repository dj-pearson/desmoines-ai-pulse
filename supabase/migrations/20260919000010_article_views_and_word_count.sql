-- WEB-BE-056. Two things the articles surface needs from the database.
--
-- 1. A view counter that counts.
--
-- useArticles incremented articles.view_count with a client read-modify-write:
-- SELECT the row, then UPDATE view_count = value + 1. Two problems, and the
-- first makes the second moot.
--
-- RLS on articles grants anon SELECT only (20250825195148). So the UPDATE was
-- rejected for every reader that has ever opened an article, the failure was
-- swallowed into a catch, and view_count has never moved - which is why the
-- 'popular' sort orders by a column of zeros and every detail page renders
-- "0 views". Every render also issued a doomed write, bots and the prerenderer
-- included.
--
-- Even with the grant it would be wrong: read-modify-write loses counts under
-- any concurrency, and two readers on the same article at the same moment
-- record one view between them.
--
-- SECURITY DEFINER for the reason increment_event_view gives (20260822000011):
-- the caller is anonymous and must NOT hold UPDATE on articles. The function is
-- the whole grant - it can add one to one counter on one row and nothing else.
-- Keyed by SLUG because that is what the detail route has; the id is not in the
-- URL.

CREATE OR REPLACE FUNCTION public.increment_article_view(p_slug text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.articles
     SET view_count = COALESCE(view_count, 0) + 1
   WHERE slug = p_slug
     AND status = 'published';
$$;

COMMENT ON FUNCTION public.increment_article_view(text) IS
  'WEB-BE-056: one view of one published article, by slug. Anonymous-callable; replaces a client UPDATE that RLS rejected.';

REVOKE ALL ON FUNCTION public.increment_article_view(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_article_view(text) TO anon, authenticated;

-- 2. A word count, so the list stops shipping every article body.
--
-- /articles renders "N min read" from formatReadTime(article.content), which is
-- the ONLY reason the list query selects content at all. So the full body of
-- every article - drafts included, since the page filtered status in the
-- browser - crossed the wire to render one label per card.
--
-- Additive, NOT NULL with a constant default: no table rewrite, and any client
-- still reading `content` is unaffected. The reader switch is a LATER release
-- (CLAUDE.md, Backward Compatibility): Cloudflare Pages deploys on push while
-- migrations are applied by hand, so a list projecting word_count before this
-- lands would get 42703 on the whole select and /articles would go blank.

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS word_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.articles.word_count IS
  'WEB-BE-056: words in content, maintained by trg_articles_word_count. Lets the list render read time without shipping the body.';

CREATE OR REPLACE FUNCTION public.sync_article_word_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- regexp_split_to_array on runs of whitespace, ignoring leading/trailing.
  -- An empty or NULL body is 0 rather than 1, which a naive split would give.
  NEW.word_count := CASE
    WHEN NEW.content IS NULL OR btrim(NEW.content) = '' THEN 0
    ELSE array_length(regexp_split_to_array(btrim(NEW.content), '\s+'), 1)
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_articles_word_count ON public.articles;
CREATE TRIGGER trg_articles_word_count
  BEFORE INSERT OR UPDATE OF content ON public.articles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_article_word_count();

-- Backfill. Written as an UPDATE of content to itself would fire the trigger,
-- but that rewrites every row's content; setting the column directly is the
-- same result without touching the body.
UPDATE public.articles
   SET word_count = CASE
     WHEN content IS NULL OR btrim(content) = '' THEN 0
     ELSE array_length(regexp_split_to_array(btrim(content), '\s+'), 1)
   END
 WHERE word_count = 0;
