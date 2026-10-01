-- IOS-DD-GUIDES-01: any signed-in account could publish a featured article.
--
-- 20250825195148 created "Authors can manage their own articles" FOR ALL
-- USING (auth.uid() = author_id) with no WITH CHECK. For INSERT, a FOR ALL
-- policy without WITH CHECK reuses USING as the check, so any authenticated
-- user can insert a row with author_id = auth.uid(), status = 'published',
-- is_featured = true and priority = 10. "Anyone can view published articles"
-- then serves it to every reader (web, iOS, Android), and the publish webhook
-- and sitemap triggers fire on it. No later migration touches these policies.
--
-- Legitimate publishers are admins (web ArticleEditor, gated on is_admin())
-- and service_role (the AI content pipeline). Neither is affected: the guard
-- returns immediately for them.
--
-- This tightens only a write no shipped client performs. iOS and Android only
-- SELECT from articles (and iOS's old view-count UPDATE was already refused by
-- RLS, see 20260919000010). The precedent for tightening in one release under
-- that condition is 20260902000013 (deals INSERT).
--
-- Policies are unchanged. The guard is a BEFORE trigger, so a non-admin author
-- keeps the ability to write drafts; they just cannot move a row into, or edit
-- a row that is already in, a public state.
--
-- SECURITY INVOKER, deliberately (the plan sketched DEFINER). The guard has
-- to tell a direct client write from a write made inside a trusted SECURITY
-- DEFINER function: increment_article_view(p_slug) (20260919000010) UPDATEs
-- published rows for every anonymous reader, and publish_scheduled_articles()
-- flips 'scheduled' to 'published'. Only an invoker trigger sees the
-- caller's current_user: 'anon' / 'authenticated' for a PostgREST write, the
-- definer function's owner inside those functions. A definer trigger would
-- always see its own owner and could not tell them apart, and would have
-- blocked every article view count.
--
-- Manual verification (run as a superuser in a transaction, then ROLLBACK):
--
--   BEGIN;
--   SELECT set_config('request.jwt.claims',
--     json_build_object('sub', '<non-admin user uuid>', 'role', 'authenticated')::text, true);
--   SET LOCAL ROLE authenticated;
--   INSERT INTO public.articles (title, slug, content, author_id, status)
--     VALUES ('t', 'guard-test-' || gen_random_uuid(), 'x', '<same uuid>', 'published')
--     RETURNING status, published_at;          -- expect: draft | NULL
--   UPDATE public.articles SET status = 'published'
--     WHERE slug LIKE 'guard-test-%' RETURNING status;  -- expect: draft
--   ROLLBACK;
--
-- And with 'role' = 'service_role' in the claims (or no claims at all) the same
-- INSERT should come back 'published'. Also check the view counter still works
-- for anon: SET LOCAL ROLE anon; SELECT public.increment_article_view('<slug>');
-- must not raise published_article_admin_only.

CREATE OR REPLACE FUNCTION public.articles_author_publish_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  has_cms_cols boolean;
BEGIN
  -- Only direct client writes are guarded. Inside a SECURITY DEFINER function
  -- (view counter, scheduler) current_user is that function's owner.
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF auth.role() IS NULL OR auth.role() = 'service_role' OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- is_featured / priority arrive with 20251203000001; reference them only
  -- when they exist so this function is valid on any schema generation.
  -- pg_attribute rather than information_schema: the latter filters by the
  -- caller's privileges, and this runs as the caller.
  SELECT count(*) = 2 INTO has_cms_cols
  FROM pg_catalog.pg_attribute
  WHERE attrelid = 'public.articles'::regclass
    AND attname IN ('is_featured', 'priority')
    AND attnum > 0 AND NOT attisdropped;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('published', 'scheduled') THEN
      NEW.status := 'draft';
    END IF;
    NEW.published_at := NULL;
    NEW.view_count := 0;
    IF has_cms_cols THEN
      NEW := jsonb_populate_record(NEW, jsonb_build_object('is_featured', false, 'priority', 0));
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF OLD.status = 'published' THEN
    RAISE EXCEPTION 'published_article_admin_only' USING ERRCODE = '42501';
  END IF;

  IF NEW.status IN ('published', 'scheduled') THEN
    NEW.status := OLD.status;
  END IF;
  NEW.published_at := OLD.published_at;
  NEW.view_count := OLD.view_count;
  IF has_cms_cols THEN
    NEW := jsonb_populate_record(
      NEW,
      jsonb_build_object(
        'is_featured', to_jsonb(OLD) -> 'is_featured',
        'priority', to_jsonb(OLD) -> 'priority'
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Sorts before article_publish_webhook_trigger; BEFORE triggers run ahead of
-- AFTER triggers regardless.
DROP TRIGGER IF EXISTS articles_author_publish_guard ON public.articles;
CREATE TRIGGER articles_author_publish_guard
  BEFORE INSERT OR UPDATE ON public.articles
  FOR EACH ROW EXECUTE FUNCTION public.articles_author_publish_guard();

-- Report, do not unpublish: anything already published by a non-admin author
-- is for the operator to review by hand.
DO $$
DECLARE
  n bigint;
BEGIN
  SELECT count(*) INTO n
  FROM public.articles a
  WHERE a.status = 'published'
    AND a.author_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = a.author_id AND ur.role IN ('admin', 'root_admin')
    );
  RAISE NOTICE 'articles_author_publish_guard: % published article(s) by non-admin authors; review with SELECT id, slug, author_id FROM public.articles a WHERE status = ''published'' AND author_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = a.author_id AND ur.role IN (''admin'',''root_admin''))', n;
EXCEPTION WHEN undefined_table OR undefined_column THEN
  RAISE NOTICE 'articles_author_publish_guard: user_roles not available, skipped the review count';
END $$;
