-- seo_locked_at: the row lock generate-seo-content takes while it writes SEO.
--
-- The lock used to be seo_title = 'PROCESSING...', released only in the
-- function's catch block, so a crash or timeout left the row claimed for good:
-- it stopped matching "seo_title is null" and no run looked at it again. A
-- timestamp lets a lock older than 15 minutes count as free
-- (generate-seo-content/selection.ts).
--
-- Apply BEFORE deploying generate-seo-content: the new code selects and writes
-- this column, and PostgREST answers 42703 until it exists. The cleanup of
-- existing 'PROCESSING...' rows and the schedule are in 20261020000006, which
-- goes after the deploy.
--
-- Additive (nullable, no default, no rewrite) and idempotent.
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS seo_locked_at timestamptz;
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS seo_locked_at timestamptz;

COMMENT ON COLUMN public.events.seo_locked_at IS
  'Set by generate-seo-content while it writes this row''s SEO; null when free. Older than 15 minutes counts as free.';
COMMENT ON COLUMN public.restaurants.seo_locked_at IS
  'Set by generate-seo-content while it writes this row''s SEO; null when free. Older than 15 minutes counts as free.';
