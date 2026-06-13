-- WEB-AUTO-006: Stale-event lifecycle — soft-hide columns.
--
-- Two-phase lifecycle replaces the old single-phase hard delete: events are
-- first soft-hidden N days after their date, then archived + hard-deleted only
-- after a much longer window. These columns drive phase 1 (soft-hide).
--
-- ADDITIVE + BACKWARD-COMPATIBLE per CLAUDE.md:
--   * is_hidden defaults FALSE, so existing web/mobile readers (which never
--     reference the column) are unaffected and every current row stays visible.
--   * hidden_at is nullable; NULL means "never auto-hidden". The hide job only
--     touches rows where hidden_at IS NULL, so an admin-restored event is never
--     re-hidden (see hide_stale_events / unhide_stale_event in the next migration).

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;

COMMENT ON COLUMN public.events.is_hidden IS
  'WEB-AUTO-006: soft-hidden from public surfaces (stale-event lifecycle phase 1). Default false.';
COMMENT ON COLUMN public.events.hidden_at IS
  'WEB-AUTO-006: when the row was auto-hidden by the lifecycle job. NULL = never auto-hidden; non-null blocks re-hide after an admin restore.';

-- Partial index: public browse queries filter `is_hidden <> true`; this keeps
-- the visible-event scan lean without indexing the (large, growing) hidden set.
CREATE INDEX IF NOT EXISTS events_is_hidden_idx
  ON public.events (is_hidden)
  WHERE is_hidden = true;
