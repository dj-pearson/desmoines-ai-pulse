-- WEB-AUTO-004: broken source-URL flags on events (additive).
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS source_url_broken BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_url_checked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_events_source_url_broken
  ON public.events (source_url_broken) WHERE source_url_broken = true;

COMMENT ON COLUMN public.events.source_url_broken IS
  'WEB-AUTO-004: source_url is dead and could not be auto-repaired; the public detail page hides the link.';
