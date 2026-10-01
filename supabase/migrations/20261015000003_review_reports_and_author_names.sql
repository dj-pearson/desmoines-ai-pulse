-- IOS-DD-GUIDES-02 / IOS-DD-GUIDES-03: review author names and the iOS report
-- path. Both additive.
--
-- 1. review_author_names(p_user_ids uuid[])
--    iOS asked for `profiles:user_id (first_name, last_name)` inside the
--    user_ratings select. user_ratings has no FK to profiles, so PostgREST
--    answers PGRST200 and fails the whole list (the web hit the same thing,
--    WEB-QA-034, src/hooks/useRatings.ts). A separate profiles read does not
--    help either: profiles has no public SELECT policy, so a normal viewer
--    gets no names. This function hands out the short public form only
--    ("Dana M."), and only for users who have a review someone can see: an
--    approved one, or the caller's own. It cannot be used to enumerate names
--    of arbitrary accounts. Capped at 100 ids per call.
--
-- 2. rating_abuse_reports bridge
--    Old iOS binaries insert into public.rating_abuse_reports. No migration
--    in this repo creates it, but scripts/db-snapshot.json (2026-08-24) shows
--    it in production with rating_id / reported_by / reason / status, and
--    nothing reads it: no admin screen, no job. New binaries call
--    report_review(p_rating_id) (20260623000004) like the web and Android.
--    Where the table exists, a trigger forwards each insert into the
--    content_moderation queue so old-binary reports reach a moderator. Where
--    it does not, nothing is created and the old insert keeps failing with
--    42P01 as it always has.

CREATE OR REPLACE FUNCTION public.review_author_names(p_user_ids uuid[])
RETURNS TABLE (user_id uuid, display_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    p.user_id,
    NULLIF(btrim(p.first_name), '')
      || COALESCE(' ' || upper(left(NULLIF(btrim(p.last_name), ''), 1)) || '.', '')
      AS display_name
  FROM public.profiles p
  WHERE p.user_id = ANY (p_user_ids[1:100])
    AND EXISTS (
      SELECT 1 FROM public.user_ratings r
      WHERE r.user_id = p.user_id
        AND (r.moderation_status = 'approved' OR r.user_id = auth.uid())
    );
$$;

REVOKE ALL ON FUNCTION public.review_author_names(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_author_names(uuid[]) TO anon, authenticated;

DO $bridge$
BEGIN
  IF to_regclass('public.rating_abuse_reports') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'rating_abuse_reports'
         AND column_name = 'rating_id'
     )
  THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.rating_abuse_report_to_moderation()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, pg_temp
      AS $body$
      BEGIN
        -- Compared as text: the snapshot does not record rating_id's type,
        -- and a uuid = text mismatch would fail the old binary's insert.
        INSERT INTO public.content_moderation
          (content_type, content_id, status, reasons, excerpt, decided_kind)
        SELECT 'review', r.id, 'flagged', '["user_report"]'::jsonb,
               left(COALESCE(r.review_text, ''), 200), 'system'
        FROM public.user_ratings r
        WHERE r.id::text = NEW.rating_id::text
        ON CONFLICT (content_type, content_id)
        DO UPDATE SET status = 'flagged', reasons = '["user_report"]'::jsonb, updated_at = now();
        RETURN NEW;
      EXCEPTION WHEN OTHERS THEN
        -- The bridge is best-effort. The report row itself must still land,
        -- as it did before this trigger existed.
        RAISE WARNING 'rating_abuse_report_to_moderation: %', SQLERRM;
        RETURN NEW;
      END;
      $body$;
    $fn$;

    EXECUTE 'DROP TRIGGER IF EXISTS rating_abuse_report_to_moderation ON public.rating_abuse_reports';
    EXECUTE 'CREATE TRIGGER rating_abuse_report_to_moderation
               AFTER INSERT ON public.rating_abuse_reports
               FOR EACH ROW EXECUTE FUNCTION public.rating_abuse_report_to_moderation()';
  ELSE
    RAISE NOTICE 'rating_abuse_reports not present; no bridge trigger created';
  END IF;
END
$bridge$;
