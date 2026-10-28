-- videos: an upload must land in the uploader's own folder.
--
-- 20260127000001:310-313 created "Authenticated users can upload to videos
-- bucket" WITH CHECK (bucket_id = 'videos') and nothing else. The bucket is
-- public with a 100MB cap (:40-52), so any signed-in account could put a 100MB
-- file at any path, including under another user's folder, and have it served
-- from a public URL. UPDATE and DELETE on this bucket were already limited to
-- (storage.foldername(name))[1] = auth.uid()::text (:315-329); INSERT was the
-- one write that was not. No later migration touches these policies.
--
-- Every writer already uses the uploader's id as the first folder:
--   src/components/media/VideoUpload.tsx  `${user.id}/${contentType}/${ts}.${ext}`
--   src/hooks/useMediaUpload.ts           `${userId}/${contentType}/${name}`
--                                         (admin MediaLibrary); 'anonymous'
--                                         only without a session, which the
--                                         TO authenticated clause refused anyway
-- No edge function, iOS or Android code uploads here (service role bypasses
-- RLS regardless); _shared/purgeUserStorage.ts only deletes under <uid>/.
--
-- Admins keep an any-path insert, using the same role check as the
-- ad-creatives-review admin policy (20260822000010:71-79). Existing objects
-- are untouched; this governs new writes only.

DROP POLICY IF EXISTS "Authenticated users can upload to videos bucket" ON storage.objects;

CREATE POLICY "Authenticated users can upload to videos bucket"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'videos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.user_has_role_or_higher(auth.uid(), 'admin'::user_role)
  )
);
