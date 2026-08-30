-- WEB-FEAT-010: Review composer photos + report-to-moderation
-- Extends the existing user_ratings review pipeline (WEB-AUTO-009) with photos
-- and a user "report" that feeds the content_moderation queue. All additive.

-- ---------------------------------------------------------------------------
-- 1. Photo URLs on the review row (additive; defaults to empty array).
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_ratings
  ADD COLUMN IF NOT EXISTS photo_urls TEXT[] NOT NULL DEFAULT '{}';

-- ---------------------------------------------------------------------------
-- 2. Public-read storage bucket for review photos.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
SELECT 'review-photos', 'review-photos', true
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'review-photos');

-- ---------------------------------------------------------------------------
-- 3. Owner-scoped storage RLS. Files live under <user_id>/<file>, so a user can
--    only write/replace/delete their own; anyone can read (public bucket).
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Users upload own review photos') THEN
    CREATE POLICY "Users upload own review photos"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'review-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Review photos are publicly readable') THEN
    CREATE POLICY "Review photos are publicly readable"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'review-photos');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Users manage own review photos') THEN
    CREATE POLICY "Users manage own review photos"
      ON storage.objects FOR ALL
      USING (bucket_id = 'review-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. report_review: any authenticated user can flag a review for admin attention.
--    Feeds content_moderation (the WEB-AUTO-009 queue) WITHOUT auto-hiding the
--    review (avoids a single report censoring content); an admin decides.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_review(p_rating_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_text TEXT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT review_text INTO v_text FROM public.user_ratings WHERE id = p_rating_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'review_not_found';
  END IF;

  INSERT INTO public.content_moderation (content_type, content_id, status, reasons, excerpt, decided_kind)
  VALUES ('review', p_rating_id, 'flagged', '["user_report"]'::jsonb, left(COALESCE(v_text, ''), 200), 'system')
  ON CONFLICT (content_type, content_id)
  DO UPDATE SET status = 'flagged', reasons = '["user_report"]'::jsonb, updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.report_review(UUID) TO authenticated;
