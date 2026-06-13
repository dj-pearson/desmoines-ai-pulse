-- WEB-FEAT-010: Review composer with photo upload + community reporting.
--
-- Additive only (CLAUDE.md backward-compat): new nullable column, new bucket,
-- new table. Nothing renamed/dropped/tightened; older iOS/Android binaries that
-- read user_ratings ignore the new photo_urls key.

-- ============================================================
-- 1. user_ratings.photo_urls  (review photo URLs, additive)
-- ============================================================
ALTER TABLE public.user_ratings
  ADD COLUMN IF NOT EXISTS photo_urls text[];

COMMENT ON COLUMN public.user_ratings.photo_urls IS
  'WEB-FEAT-010: public URLs of up to 3 review photos in the review-photos bucket. NULL/empty when text-only.';

-- ============================================================
-- 2. review-photos storage bucket (public read so photos render)
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'review-photos',
  'review-photos',
  true,
  1048576, -- 1MB hard cap at the bucket (client compresses to < 500KB)
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 1048576,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

-- Owner-scoped paths: first folder segment is the uploader's auth uid.
DO $$ BEGIN
  CREATE POLICY "Users can upload own review photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'review-photos' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table OR undefined_function OR insufficient_privilege THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own review photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'review-photos' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table OR undefined_function OR insufficient_privilege THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own review photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'review-photos' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table OR undefined_function OR insufficient_privilege THEN NULL;
END $$;

-- Public bucket → anyone can read (review photos are public content).
DO $$ BEGIN
  CREATE POLICY "Public can view review photos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'review-photos');
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table OR undefined_function OR insufficient_privilege THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can manage all review photos"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'review-photos' AND
    public.is_admin()
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table OR undefined_function OR undefined_object OR insufficient_privilege THEN NULL;
END $$;

-- ============================================================
-- 3. content_reports  (community report -> moderation queue)
-- ============================================================
-- A report from a logged-in reader. moderate-content (action:'report') inserts
-- here and re-flags the reviewed row once distinct reporters cross a threshold,
-- which surfaces it in the existing ModerationQueuePanel (status != 'approved').
CREATE TABLE IF NOT EXISTS public.content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type text NOT NULL,            -- 'review' (extensible)
  content_id uuid NOT NULL,              -- e.g. user_ratings.id
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_type, content_id, reporter_id) -- one report per user per item
);

CREATE INDEX IF NOT EXISTS idx_content_reports_target
  ON public.content_reports (content_type, content_id);

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

-- Reporters insert their OWN report (reporter_id must be the caller).
DO $$ BEGIN
  CREATE POLICY "Users can file own content reports"
  ON public.content_reports FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- A reporter can see the reports they filed; admins see all.
DO $$ BEGIN
  CREATE POLICY "Users can view own content reports"
  ON public.content_reports FOR SELECT
  TO authenticated
  USING (reporter_id = auth.uid() OR public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
