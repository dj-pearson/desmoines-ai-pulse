-- WEB-QA-016: restore event photo sharing.
--
-- PROBLEM
-- The event photo feature writes and reads two columns on
-- public.event_discussions that do not exist:
--
--   * EventPhotoUpload inserts { message_type: 'photo', media_url: <url> } —
--     which fails with PGRST204 "Could not find the 'media_url' column", so the
--     upload throws after the file has already been put in storage. Verified
--     against the live database.
--   * EventPhotoGallery filters `message_type === 'photo' && media_url`, so the
--     gallery is permanently empty.
--   * EventSocialHub renders a "Photos (N)" tab, permanently 0, and branches on
--     `message_type !== 'comment'` which is never true.
--
-- The read side never errored — the select is `*`, so both fields simply came
-- back undefined and every consumer silently took the empty branch. That is why
-- this went unnoticed: only the write path surfaced an error, and it does so
-- inside a try/catch that reports a generic upload failure.
--
-- FIX
-- Add both columns. `message_type` defaults to 'comment' so every existing row
-- keeps its current meaning, and the constraint matches the union the client
-- already uses ('comment' | 'photo' | 'video' | 'tip').
--
-- BACKWARD COMPATIBILITY (CLAUDE.md)
-- Purely additive and safe in a single release:
--   * ADD COLUMN ... NULL / with a constant DEFAULT — no rewrite of existing
--     rows' meaning, and existing writers that omit these columns still succeed.
--   * No column, table or RPC is removed or renamed; no request/response shape
--     changes for any shipped mobile binary.
--   * No CHECK constraint is added, so nothing can start rejecting writes.

ALTER TABLE public.event_discussions
  ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'comment',
  ADD COLUMN IF NOT EXISTS media_url TEXT;

-- NO CHECK CONSTRAINT, DELIBERATELY.
-- A CHECK on message_type was written and then removed: scripts/check-migration-safety.mjs
-- correctly flags it as [add-check] "a new/tightened CHECK can reject values old
-- clients send". It would be harmless *today* — the column is new, so nothing
-- writes it yet — but it bakes in a tightening: the moment any client sends a
-- fifth kind ('link', 'poll', ...) the insert starts failing, and per CLAUDE.md
-- loosening a CHECK later is the multi-release direction. The client already
-- constrains the union in TypeScript, which is where this belongs until the full
-- set of writers is known. Overriding the linter here was the wrong trade.

-- The gallery filters on message_type and requires media_url to be present, so
-- index the common lookup: photos for one event, newest first.
CREATE INDEX IF NOT EXISTS idx_event_discussions_event_media
  ON public.event_discussions (event_id, created_at DESC)
  WHERE media_url IS NOT NULL;

COMMENT ON COLUMN public.event_discussions.message_type IS
  'Kind of discussion entry: comment (default), photo, video or tip. Photo/video entries carry media_url (WEB-QA-016).';
COMMENT ON COLUMN public.event_discussions.media_url IS
  'Public storage URL for a photo or video entry. NULL for plain comments (WEB-QA-016).';
