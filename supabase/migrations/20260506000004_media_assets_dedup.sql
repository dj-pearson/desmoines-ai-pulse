-- Storage dedup for image backfill: if the same source URL or the same byte
-- content has already been stored, point the new content_id at the existing
-- file_path instead of uploading another copy.

ALTER TABLE public.media_assets
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS source_url text;

-- Hash lookups are the primary dedup path — exact-match lookup, high cardinality.
CREATE INDEX IF NOT EXISTS idx_media_assets_content_hash
  ON public.media_assets(content_hash)
  WHERE content_hash IS NOT NULL;

-- Source URL lookups let us skip downloading entirely when a previous record
-- referenced the same external image URL.
CREATE INDEX IF NOT EXISTS idx_media_assets_source_url
  ON public.media_assets(source_url)
  WHERE source_url IS NOT NULL;

COMMENT ON COLUMN public.media_assets.content_hash IS
  'SHA-256 hex digest of the stored file bytes. Used to dedup identical images stored under different file_paths.';

COMMENT ON COLUMN public.media_assets.source_url IS
  'Original external URL the image was fetched from. Used to skip re-download when the same source URL is processed for another record.';
