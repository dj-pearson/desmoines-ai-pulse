-- WEB-AUTO-011: Event-driven sitemap regeneration + search-engine ping.
--
-- Today sitemaps are only rebuilt at `npm run build` (deploy) and a daily cron,
-- so new/edited content waits up to a day (or a deploy) to be indexable. This
-- migration makes content changes enqueue into a change-queue, which a 6-hourly
-- job drains by regenerating the affected sitemap files into a public Storage
-- bucket (served fresh at /sitemap*.xml via the Cloudflare Pages middleware,
-- with the build-time static files as fallback) and pinging search engines.
--
-- Additive only: one new table (sitemap_change_queue), one SECURITY DEFINER
-- trigger function + AFTER triggers on existing tables (insert rows only — they
-- never block or mutate the underlying write), a new public Storage bucket, one
-- system_settings pause-flag row, and a new pg_cron job. No drops, no renames,
-- no tightening — safe for live web + iOS/Android readers.

-- 1. Change-queue table -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sitemap_change_queue (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type text NOT NULL,           -- 'events' | 'restaurants' | 'attractions' | 'articles'
  content_id  uuid,                     -- the changed row's id (NULL tolerated)
  change_type text NOT NULL,            -- 'INSERT' | 'UPDATE' | 'DELETE'
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz              -- NULL = still dirty
);

COMMENT ON TABLE public.sitemap_change_queue IS
  'WEB-AUTO-011: content-change events (events/restaurants/attractions/articles) enqueued by AFTER triggers; drained every 6h by the generate-sitemaps job which regenerates the affected sitemap files into Storage.';

-- Cheap "what is still dirty?" probe for the drain job.
CREATE INDEX IF NOT EXISTS idx_sitemap_change_queue_unprocessed
  ON public.sitemap_change_queue (enqueued_at)
  WHERE processed_at IS NULL;

ALTER TABLE public.sitemap_change_queue ENABLE ROW LEVEL SECURITY;

-- Admin-read only; writes happen via the SECURITY DEFINER trigger and the
-- service-role drain job (service_role bypasses RLS). No client write policy.
DO $$ BEGIN
  CREATE POLICY "Admins can read sitemap change queue"
    ON public.sitemap_change_queue FOR SELECT
    TO authenticated
    USING (public.is_admin());
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_function OR undefined_table THEN NULL;
END $$;

-- 2. Trigger function (enqueue on change) -----------------------------------
-- content_type is passed as a trigger argument so one function serves all
-- four tables. Inserts only; never raises (a sitemap-queue hiccup must never
-- block a legitimate content write).
CREATE OR REPLACE FUNCTION public.enqueue_sitemap_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_type text := TG_ARGV[0];
  v_id   uuid;
BEGIN
  BEGIN
    IF TG_OP = 'DELETE' THEN
      v_id := OLD.id;
    ELSE
      v_id := NEW.id;
    END IF;

    INSERT INTO public.sitemap_change_queue (content_type, content_id, change_type)
    VALUES (v_type, v_id, TG_OP);
  EXCEPTION WHEN OTHERS THEN
    -- Never let queue maintenance fail the underlying content write.
    NULL;
  END;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Triggers on the four content tables ------------------------------------
-- AFTER INSERT/UPDATE/DELETE with no WHEN clause (no column references) so the
-- trigger can't fail on per-table schema differences. The drain job dedupes by
-- content_type, so extra enqueues only add cheap queue inserts.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('events'),
      ('restaurants'),
      ('attractions'),
      ('articles')
    ) AS x(tbl)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t.tbl
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_sitemap_enqueue ON public.%I', t.tbl);
      EXECUTE format(
        'CREATE TRIGGER trg_sitemap_enqueue
           AFTER INSERT OR UPDATE OR DELETE ON public.%I
           FOR EACH ROW EXECUTE FUNCTION public.enqueue_sitemap_change(%L)',
        t.tbl, t.tbl
      );
    END IF;
  END LOOP;
END $$;

-- 4. Public Storage bucket for the regenerated sitemap files ----------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('sitemaps', 'sitemaps', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Public read (search-engine crawlers / the Pages middleware fetch these).
DO $$ BEGIN
  CREATE POLICY "Public can read sitemaps"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'sitemaps');
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table OR insufficient_privilege THEN NULL;
END $$;

-- Admins may manage them from the UI; the drain job writes via service_role
-- (which bypasses RLS).
DO $$ BEGIN
  CREATE POLICY "Admins can manage sitemaps"
    ON storage.objects FOR ALL
    TO authenticated
    USING (bucket_id = 'sitemaps' AND public.is_admin())
    WITH CHECK (bucket_id = 'sitemaps' AND public.is_admin());
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table OR undefined_function OR insufficient_privilege THEN NULL;
END $$;

-- 5. Pause flag (single DB config row, admin-toggleable, no code change) -----
INSERT INTO public.system_settings (setting_type, settings)
SELECT 'sitemap_regen', jsonb_build_object('paused', false)
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_settings WHERE setting_type = 'sitemap_regen'
);

-- 6. Every-6-hours schedule -------------------------------------------------
-- Routes through the WEB-AUTO-001 jobRunner (Job Health panel + failure alerts).
-- The build-time generation (npm run build) remains as a fallback; this is now
-- the primary, no-deploy-required path.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('sitemap-regen-6h')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sitemap-regen-6h');

    PERFORM cron.schedule(
      'sitemap-regen-6h',
      '0 */6 * * *',  -- 00:00, 06:00, 12:00, 18:00 UTC
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/generate-sitemaps',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
          'Content-Type', 'application/json',
          'x-trigger-source', 'cron'
        ),
        body := jsonb_build_object('source', 'cron')
      ) as request_id;
      $cron$
    );
  END IF;
END $$;
