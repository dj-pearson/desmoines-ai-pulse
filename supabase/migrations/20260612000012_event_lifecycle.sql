-- WEB-AUTO-006: Stale-event lifecycle (two-phase soft-hide -> archive snapshot -> hard-delete)
-- Additive only (new columns, new table, cron reschedule). No drops, no tightening,
-- no narrowing of existing reads -> CLAUDE.md backward-compatibility safe.

-- 1. Additive lifecycle flags on events. Default false keeps every existing
--    web/mobile reader correct (an un-flagged row stays visible, exactly as today).
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;

-- Partial index serves both the browse filter (.neq('is_hidden', true) over future
-- dates) and the nightly hide sweep (date < cutoff AND is_hidden = false).
CREATE INDEX IF NOT EXISTS events_visible_date_idx
  ON public.events(date)
  WHERE is_hidden = false;

COMMENT ON COLUMN public.events.is_hidden IS
  'WEB-AUTO-006: soft-hide flag. Set true N days after the event date by the cleanup-old-events lifecycle; clear it to fully restore. Public list/detail queries exclude is_hidden=true.';

-- 2. Lightweight archive snapshot written immediately before a hard delete so a
--    purged event is never lost without a record (id, title, source_url, dates).
CREATE TABLE IF NOT EXISTS public.event_archive_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL UNIQUE,
  title TEXT,
  source_url TEXT,
  category TEXT,
  location TEXT,
  venue TEXT,
  event_date DATE,
  snapshot JSONB,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_archive_snapshots_archived_at_idx
  ON public.event_archive_snapshots(archived_at);
CREATE INDEX IF NOT EXISTS event_archive_snapshots_event_date_idx
  ON public.event_archive_snapshots(event_date);

ALTER TABLE public.event_archive_snapshots ENABLE ROW LEVEL SECURITY;

-- Admin-read only; writes flow through the service-role edge function (BYPASSRLS).
DROP POLICY IF EXISTS "Admins can read event archive snapshots" ON public.event_archive_snapshots;
CREATE POLICY "Admins can read event archive snapshots"
  ON public.event_archive_snapshots
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

GRANT SELECT ON public.event_archive_snapshots TO authenticated;

COMMENT ON TABLE public.event_archive_snapshots IS
  'WEB-AUTO-006: immutable snapshot of an event captured just before its 180-day hard-delete. Recovery/audit reference; not user-facing.';

-- 3. Retire the legacy hard-delete-at-90-days cron (cleanup_old_events SQL
--    function, zero observability / no recovery window) and route the lifecycle
--    through the cleanup-old-events edge function instead, so every run flows
--    through the WEB-AUTO-001 jobRunner (Job Health panel + failure alerts).
--    The SQL function itself is left in place (additive rule, no drop) -- only
--    its schedule is removed.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('cleanup-old-events-weekly')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-old-events-weekly');

    PERFORM cron.unschedule('event-lifecycle-nightly')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'event-lifecycle-nightly');

    PERFORM cron.schedule(
      'event-lifecycle-nightly',
      '0 4 * * *',  -- daily 04:00 UTC
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/cleanup-old-events',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
          'Content-Type', 'application/json',
          'x-trigger-source', 'cron'
        ),
        body := jsonb_build_object('manual', false)
      ) as request_id;
      $cron$
    );
  END IF;
END $$;
