-- WEB-AUTO-005: duplicate venue/event detection + merge.
-- Additive merge-bookkeeping columns on the two deduplicated content tables.
-- `is_merged` defaults false so every existing reader stays correct (CLAUDE.md
-- backward-compat: old web/mobile clients that don't filter the flag just keep
-- seeing every row, exactly as before). `merged_into` is a PLAIN uuid (no FK) on
-- purpose so the dynamic FK-repointing in merge_duplicate_content() never tries
-- to repoint it as if it were child data.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS is_merged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS merged_into uuid,
  ADD COLUMN IF NOT EXISTS merged_at timestamptz;

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS is_merged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS merged_into uuid,
  ADD COLUMN IF NOT EXISTS merged_at timestamptz;

-- Partial indexes: merged rows are the rare case we filter out of public lists.
CREATE INDEX IF NOT EXISTS idx_events_is_merged
  ON public.events (is_merged) WHERE is_merged = true;
CREATE INDEX IF NOT EXISTS idx_restaurants_is_merged
  ON public.restaurants (is_merged) WHERE is_merged = true;
