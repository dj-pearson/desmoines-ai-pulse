-- Approved ad artwork can no longer be swapped by the advertiser after review
-- (business plan WP4 item 4).
--
-- ad-creatives is the PUBLIC bucket, and since WEB-LEGAL-011
-- (20260822000010) it holds only APPROVED creatives: uploads go to the private
-- ad-creatives-review bucket, and src/lib/adCreativeStorage.ts publishCreative
-- copies a file here, as the approving admin, when it is approved. The three
-- owner policies from 20251107000001:38-100 are from before that split. They
-- still let the campaign owner INSERT, UPDATE and DELETE anything under
-- <campaign_id>/ in the public bucket, which is exactly where the approved
-- file sits and the path campaign_creatives.image_url points at. An owner
-- could have an ad approved and then overwrite the object with something
-- nobody reviewed, and every page and every shipped app binary serving that
-- URL would show it.
--
-- No client uses these grants: CreativeUploadForm.tsx and
-- campaign-creative-review write only to ad-creatives-review, and the admin
-- publish path is covered by the admin policy on this bucket, which stays.
-- Owner SELECT ("Users can view own ad creatives"), the public read of
-- approved campaigns and the team read are untouched.
--
-- Tightening, deliberately in one release: nothing legitimate loses access.
-- Apply is deferred (plan D3).

DROP POLICY IF EXISTS "Users can upload to own campaigns" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own ad creatives" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own ad creatives" ON storage.objects;
