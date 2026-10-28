-- event-photos: cap what the bucket accepts and stop any signed-in user
-- writing anywhere in it.
--
-- 20250830013853:101-103 created the bucket with no allowed_mime_types and no
-- file_size_limit, so the only checks on type and size were in the browser. An
-- API call with the anon key and any session could store an SVG (script runs
-- when the public URL is opened directly), an HTML file, or anything up to the
-- project-wide upload cap, all served from a public URL on our storage domain.
--
-- The same migration (lines 117-123) added "Authenticated users can upload
-- event photos", WITH CHECK bucket_id = 'event-photos' AND auth.uid() IS NOT
-- NULL. Permissive policies are ORed, so that one cancelled the folder check
-- in "Users can upload event photos" (20250816041658:16 and 20250816041739:22,
-- both IF NOT EXISTS, so one copy exists): any user could write under any
-- other user's folder. UPDATE and DELETE were already folder-scoped
-- (20250830013853:125-147). No later migration touches this bucket's policies.
--
-- Every writer already uses the uploader's id as the first folder, so the
-- folder-scoped policy alone admits them:
--   src/components/EventPhotoUpload.tsx  `${user.id}/${eventId}/${ts}.${ext}`,
--                                        jpeg/png/webp only, 5MB client cap
--   src/hooks/useMediaUpload.ts          `${userId}/${contentType}/${name}`
--                                        (EventSubmissionForm, MediaLibrary);
--                                        userId falls back to 'anonymous' only
--                                        when there is no session, and an
--                                        anonymous insert was already refused
-- No edge function, iOS or Android code writes to this bucket;
-- _shared/purgeUserStorage.ts only deletes under <uid>/.
--
-- The MIME list is the raster set useMediaUpload accepts, minus image/svg+xml.
-- An SVG pick in useMediaUpload for this bucket is now refused by storage
-- instead of stored; EventPhotoUpload already refused it. 10MB sits above both
-- client caps (5MB), so no upload the UI allows is newly rejected.
--
-- Existing objects are unaffected: the limits and the policy apply to new
-- writes only.

UPDATE storage.buckets
SET
  file_size_limit = 10485760, -- 10MB
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif',
    'image/gif'
  ]
WHERE id = 'event-photos';

DROP POLICY IF EXISTS "Authenticated users can upload event photos" ON storage.objects;

-- The folder-scoped policy is what remains, so make sure it is there rather
-- than trust that one of the two IF NOT EXISTS blocks ran.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Users can upload event photos'
  ) THEN
    CREATE POLICY "Users can upload event photos"
    ON storage.objects
    FOR INSERT
    WITH CHECK (bucket_id = 'event-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;
