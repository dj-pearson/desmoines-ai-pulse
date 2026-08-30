-- WEB-LEGAL-007 (part 1): close the one public bucket nothing uses.
--
-- Every storage bucket in this project is public:true, which in Supabase means
-- an unauthenticated GET on a guessable path, with no expiry and no revocation.
-- That is correct for buckets whose contents are displayed publicly anyway. It
-- is not correct for a bucket nobody can account for.
--
-- `user-uploads` was created in August 2025 alongside event-photos, in two
-- near-identical migrations a minute apart (20250816041658 / 20250816041739),
-- and nothing has referenced it since: a grep across src/, scripts/ and
-- supabase/functions/ finds no upload, no download and no getPublicUrl against
-- it. An unused public bucket is at best pointless and at worst a forgotten
-- store of personal files readable by anyone who guesses a path.
--
-- Made private rather than dropped, deliberately. This sandbox cannot reach the
-- project to see whether it holds objects, and dropping a bucket destroys
-- whatever is in it. Flipping `public` closes anonymous read immediately, keeps
-- the contents, and is reversible with a one-line UPDATE. The owner-scoped RLS
-- policy from 20250816041658 ("Users can manage their own uploads", FOR ALL on
-- the <user_id>/ prefix) still governs authenticated access, so a signed-in
-- owner is unaffected.
--
-- Follow-up for whoever has production access: list the bucket. If it is empty,
-- drop it. If it is not, find out what wrote to it, because nothing in this
-- repo does.

UPDATE storage.buckets
SET public = false
WHERE id = 'user-uploads';

-- The remaining public buckets are public on purpose, recorded here so the next
-- audit does not have to re-derive it:
--   event-photos, review-photos, media, thumbnails  -- rendered on public pages
--   videos                                          -- rendered on public pages
--   sitemaps                                        -- fetched by search engines
--   ad-creatives                                    -- see WEB-LEGAL-011; approved
--                                                      ads are public by nature,
--                                                      but pending and rejected
--                                                      ones should not be
