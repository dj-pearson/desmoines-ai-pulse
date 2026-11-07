-- media: an upload must land in the uploader's own folder unless an admin
-- makes it, and the bucket no longer accepts SVG (WEB-SEC-040).
--
-- 20260127000001:284-287 created "Authenticated users can upload to media
-- bucket" WITH CHECK (bucket_id = 'media') and nothing else, and :11-36 put
-- image/svg+xml in allowed_mime_types. The bucket is public, so any signed-in
-- account could store an SVG at any path and Supabase's own public URL
-- (/storage/v1/object/public/media/...) would serve it as image/svg+xml, where
-- script runs when the URL is opened directly. WEB-SEC-036 hardened the
-- /media/* Pages Function only; the storage URL never went through it.
-- UPDATE (:289-295) was already folder-scoped. No later migration touches
-- this bucket's policies or limits.
--
-- Every writer is admin-only or already uses the uploader's id as the first
-- folder:
--   src/components/admin/HotelEditDialog.tsx       `hotels/${uuid}.${ext}`
--   src/components/admin/AttractionEditDialog.tsx  `attractions/${uuid}.${ext}`
--                                                  (both mounted only under
--                                                  /admin/* with requireAdmin,
--                                                  i.e. admin or root_admin,
--                                                  which is what
--                                                  user_has_role_or_higher(
--                                                  uid, 'admin') admits)
--   src/hooks/useMediaUpload.ts                    `${userId}/${contentType}/${name}`
--                                                  (only media caller is the
--                                                  admin MediaLibrary; the
--                                                  other caller,
--                                                  EventSubmissionForm, uses
--                                                  event-photos)
--   _shared/imageStorage.ts                        `<type>s/<id>/...`, called
--                                                  from ai-crawler,
--                                                  firecrawl-scraper,
--                                                  backfill-images,
--                                                  find-image-candidates and
--                                                  apply-image, all with the
--                                                  service role, which bypasses
--                                                  RLS. Its ALLOWED_IMAGE_MIME
--                                                  has no SVG, so the narrower
--                                                  MIME list refuses nothing it
--                                                  sends.
-- No iOS or Android code writes to this bucket; _shared/purgeUserStorage.ts
-- only deletes under <uid>/.
--
-- Admins keep an any-path insert and update, using the same role check as the
-- videos bucket (20261028000002). allowed_mime_types is the previous list
-- minus image/svg+xml; file_size_limit is unchanged at 10MB. An SVG picked in
-- the admin dialogs is now refused by storage instead of stored.
--
-- Existing objects are unaffected: the limits and policies govern new writes
-- only. Any SVG already in the bucket is still served from its public URL and
-- has to be found and removed by hand (see the WEB-SEC-040 notes).

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif'
]
WHERE id = 'media';

DROP POLICY IF EXISTS "Authenticated users can upload to media bucket" ON storage.objects;

CREATE POLICY "Authenticated users can upload to media bucket"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'media'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.user_has_role_or_higher(auth.uid(), 'admin'::user_role)
  )
);

-- Same owner-or-admin rule for UPDATE, with an explicit WITH CHECK so a move
-- or overwrite cannot land outside the caller's folder either. For a
-- non-admin this is what the old USING-only policy already enforced.
DROP POLICY IF EXISTS "Users can update their own media files" ON storage.objects;

CREATE POLICY "Users can update their own media files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'media'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.user_has_role_or_higher(auth.uid(), 'admin'::user_role)
  )
)
WITH CHECK (
  bucket_id = 'media'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.user_has_role_or_higher(auth.uid(), 'admin'::user_role)
  )
);
