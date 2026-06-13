-- WEB-AUTO-006: Stale-event lifecycle — archive snapshot table + RPCs.
--
-- Phase 1 (hide):    hide_stale_events(hide_after_days)  -> soft-hide past events
-- Phase 2 (purge):   archive_and_purge_events(delete_after_days) -> snapshot then delete
-- Recovery:          unhide_stale_event(event_id)        -> restore a hidden row
--
-- The legacy cleanup_old_events() SQL function (migration 20250107000005)
-- archived a FULL `SELECT *` row into archived_events; that now breaks because
-- events has gained columns archived_events lacks (geom, is_merged, merged_*,
-- recurrence_*, instance_date). This minimal, explicit-column snapshot table is
-- robust to future events-table changes and matches the AC (id, title,
-- source_url, dates). The legacy function/table are left in place (not dropped,
-- per CLAUDE.md) but its cron is retired in the next migration.

-- ---------------------------------------------------------------------------
-- Archive snapshot table (written immediately before a hard delete).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_archive (
  id           UUID PRIMARY KEY,
  title        TEXT,
  source_url   TEXT,
  date         DATE,
  location     TEXT,
  venue        TEXT,
  category     TEXT,
  archive_reason TEXT NOT NULL DEFAULT 'lifecycle_purge',
  archived_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.event_archive IS
  'WEB-AUTO-006: minimal snapshot of events written immediately before the lifecycle hard-delete (record-keeping / forensic recovery).';

CREATE INDEX IF NOT EXISTS event_archive_archived_at_idx ON public.event_archive (archived_at);

ALTER TABLE public.event_archive ENABLE ROW LEVEL SECURITY;

-- Admin-read only; writes happen exclusively via the SECURITY DEFINER RPC below
-- (or service_role, which bypasses RLS).
DROP POLICY IF EXISTS "Admins can read event_archive" ON public.event_archive;
CREATE POLICY "Admins can read event_archive" ON public.event_archive
  FOR SELECT TO authenticated USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- Phase 1: soft-hide stale events.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hide_stale_events(hide_after_days INTEGER DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  cutoff_date DATE;
  hidden_count INTEGER := 0;
BEGIN
  -- Admin or service-role only (service role -> auth.uid() NULL -> allowed).
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'hide_stale_events: admin privileges required';
  END IF;

  cutoff_date := CURRENT_DATE - (hide_after_days || ' days')::INTERVAL;

  -- Only ever hide rows that have NEVER been auto-hidden (hidden_at IS NULL).
  -- This makes admin restores sticky: unhide_stale_event leaves hidden_at set,
  -- so a restored event is skipped here on the next run.
  UPDATE public.events
  SET is_hidden = true, hidden_at = now()
  WHERE date < cutoff_date
    AND is_hidden = false
    AND hidden_at IS NULL;

  GET DIAGNOSTICS hidden_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'status', 'success',
    'cutoff_date', cutoff_date,
    'hide_after_days', hide_after_days,
    'events_hidden', hidden_count
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Phase 2: archive a snapshot, then hard-delete (events older than the long
-- window). Mirrors the child-row cleanup that purge_old_events performed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.archive_and_purge_events(delete_after_days INTEGER DEFAULT 180)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  cutoff_date DATE;
  archived_count INTEGER := 0;
  deleted_count INTEGER := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'archive_and_purge_events: admin privileges required';
  END IF;

  cutoff_date := CURRENT_DATE - (delete_after_days || ' days')::INTERVAL;

  -- Snapshot before delete (idempotent: a re-run won't duplicate rows).
  INSERT INTO public.event_archive (id, title, source_url, date, location, venue, category, archive_reason)
  SELECT id, title, source_url, date, location, venue, category, 'lifecycle_purge'
  FROM public.events
  WHERE date < cutoff_date
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS archived_count = ROW_COUNT;

  -- Delete child/related rows first (avoid FK violations), then the events.
  DELETE FROM public.event_attendance WHERE event_id IN (SELECT id FROM public.events WHERE date < cutoff_date);
  DELETE FROM public.event_photos WHERE event_id IN (SELECT id FROM public.events WHERE date < cutoff_date);
  DELETE FROM public.event_reviews WHERE event_id IN (SELECT id FROM public.events WHERE date < cutoff_date);
  DELETE FROM public.event_tips WHERE event_id IN (SELECT id FROM public.events WHERE date < cutoff_date);
  DELETE FROM public.event_social_metrics WHERE event_id IN (SELECT id FROM public.events WHERE date < cutoff_date);
  DELETE FROM public.content_metrics WHERE content_type = 'event' AND content_id IN (SELECT id FROM public.events WHERE date < cutoff_date);
  DELETE FROM public.content_performance_metrics WHERE content_type = 'event' AND content_id IN (SELECT id FROM public.events WHERE date < cutoff_date);
  DELETE FROM public.content_rating_aggregates WHERE content_type = 'event' AND content_id IN (SELECT id FROM public.events WHERE date < cutoff_date);
  DELETE FROM public.trending_scores WHERE content_type = 'event' AND content_id IN (SELECT id FROM public.events WHERE date < cutoff_date);
  DELETE FROM public.user_ratings WHERE content_type = 'event' AND content_id IN (SELECT id FROM public.events WHERE date < cutoff_date);

  DELETE FROM public.events WHERE date < cutoff_date;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'status', 'success',
    'cutoff_date', cutoff_date,
    'delete_after_days', delete_after_days,
    'events_archived', archived_count,
    'events_deleted', deleted_count
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Recovery: restore a soft-hidden event. Leaves hidden_at populated so the
-- hide job won't immediately re-hide it (see hide_stale_events).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unhide_stale_event(p_event_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  affected INTEGER := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'unhide_stale_event: admin privileges required';
  END IF;

  UPDATE public.events
  SET is_hidden = false
  WHERE id = p_event_id;
  GET DIAGNOSTICS affected = ROW_COUNT;

  RETURN jsonb_build_object('status', CASE WHEN affected > 0 THEN 'success' ELSE 'not_found' END, 'event_id', p_event_id);
END;
$$;

-- Lock down: no anonymous/public execution; admin users + the service-role edge
-- function only. The in-body is_admin() gate is the real authz; the GRANT just
-- removes the implicit PUBLIC execute.
REVOKE ALL ON FUNCTION public.hide_stale_events(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_and_purge_events(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unhide_stale_event(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hide_stale_events(INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.archive_and_purge_events(INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unhide_stale_event(UUID) TO authenticated, service_role;
