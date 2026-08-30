-- WEB-LEGAL-011: keep unapproved ad creatives out of the public bucket.
--
-- The confidentiality problem is only the pending/rejected window. An APPROVED
-- creative is public by nature -- it is displayed in an ad to everyone -- so the
-- fix changes WHERE unapproved files live, not how approved ones are served.
-- ad-creatives stays public and stays the render path, which is what keeps AC1
-- satisfied: campaign_creatives.image_url still holds a public URL, and
-- get_active_ads still returns it to shipped iOS and Android binaries unchanged.
-- Verified in the function body: it filters cc.is_approved = true, so a NULL
-- image_url on an unapproved row is never reachable through it.
--
-- AC7, THE BACKFILL DECISION: there is nothing to backfill. Measured against
-- production 2026-08-22 --
--   public.campaign_creatives        0 rows
--   storage.objects in ad-creatives  0 objects
--   public.ad_impressions            0 rows
-- so the exposure this story describes has zero instances today. Nothing to
-- move and nothing to leave. That is also why this is being built now: the
-- reason to defer was that a bug here means a paying advertiser's creative never
-- publishes, and right now there are no advertisers' creatives to break. The
-- first real upload makes this migration materially harder.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ad-creatives-review',
  'ad-creatives-review',
  false,
  5242880, -- 5 MB, matching the 'ad-creatives' cap in src/hooks/useMediaUpload.ts
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET public = false;  -- never let a re-run leave it public

-- Path convention is unchanged from the public bucket: <campaign_id>/<placement>/<ts>.<ext>
-- so every policy below keys on the first folder segment, exactly as the
-- existing ad-creatives policies do.

DROP POLICY IF EXISTS "Users can upload review creatives to own campaigns" ON storage.objects;
CREATE POLICY "Users can upload review creatives to own campaigns"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ad-creatives-review'
    AND (storage.foldername(name))[1] IN (
      SELECT campaigns.id::text FROM public.campaigns WHERE campaigns.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can view own review creatives" ON storage.objects;
CREATE POLICY "Users can view own review creatives"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'ad-creatives-review'
    AND (storage.foldername(name))[1] IN (
      SELECT campaigns.id::text FROM public.campaigns WHERE campaigns.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete own review creatives" ON storage.objects;
CREATE POLICY "Users can delete own review creatives"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'ad-creatives-review'
    AND (storage.foldername(name))[1] IN (
      SELECT campaigns.id::text FROM public.campaigns WHERE campaigns.user_id = auth.uid()
    )
  );

-- Reviewers need read on everything in the bucket, and delete so an approved or
-- rejected creative can be cleaned out of review storage.
DROP POLICY IF EXISTS "Admins can manage review creatives" ON storage.objects;
CREATE POLICY "Admins can manage review creatives"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'ad-creatives-review'
    AND public.user_has_role_or_higher(auth.uid(), 'admin'::user_role)
  )
  WITH CHECK (
    bucket_id = 'ad-creatives-review'
    AND public.user_has_role_or_higher(auth.uid(), 'admin'::user_role)
  );

-- Where the object lives while it is under review. NULL for anything uploaded
-- before this migration (of which there are none) and for creatives whose review
-- copy has been cleaned up after approval.
--
-- Additive and nullable, so an older client that does not know the column keeps
-- working: it writes image_url at insert time as it always did, and that row
-- simply never uses the private path. No shipped mobile binary writes here --
-- creative upload is a web-only surface.
ALTER TABLE public.campaign_creatives
  ADD COLUMN IF NOT EXISTS review_path text;

COMMENT ON COLUMN public.campaign_creatives.review_path IS
  'Object path in the private ad-creatives-review bucket while unapproved. image_url stays NULL until approval copies the object into the public ad-creatives bucket. WEB-LEGAL-011.';
