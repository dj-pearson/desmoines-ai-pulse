-- WEB-AUTO-011: Event-driven sitemap regeneration
-- Content changes on events/restaurants/attractions/articles enqueue a row into
-- sitemap_change_queue via AFTER triggers. A pg_cron job (every 6h) invokes the
-- regenerate-sitemaps edge function, which regenerates the sitemap files into the
-- public `sitemaps` storage bucket, pings search engines, and drains the queue.
-- Build-time generation (npm run generate-sitemaps) remains as a fallback.

-- ---------------------------------------------------------------------------
-- 1. Change-queue table (additive; service-role written, RLS-locked)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sitemap_change_queue (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL,             -- 'event' | 'restaurant' | 'attraction' | 'article'
  content_id   UUID,
  action       TEXT NOT NULL DEFAULT 'upsert', -- 'upsert' | 'delete'
  processed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sitemap_change_queue_unprocessed
  ON public.sitemap_change_queue (created_at)
  WHERE processed_at IS NULL;

-- RLS on (project rule). No public policies: only the service role (edge function
-- + triggers) touches this table; anon/authenticated get no access.
ALTER TABLE public.sitemap_change_queue ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. Trigger function — enqueue a change row. SECURITY DEFINER so it can write
--    regardless of the writer's RLS context. content_type passed as TG_ARGV[0].
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_sitemap_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type   TEXT := TG_ARGV[0];
  v_id     UUID;
  v_action TEXT;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    v_id := OLD.id;
    v_action := 'delete';
  ELSE
    v_id := NEW.id;
    v_action := 'upsert';
  END IF;

  INSERT INTO public.sitemap_change_queue (content_type, content_id, action)
  VALUES (v_type, v_id, v_action);

  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Triggers — only fire on slug/visibility-affecting column changes to keep
--    queue churn low. Guarded by table existence.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'events') THEN
    DROP TRIGGER IF EXISTS trg_sitemap_events ON public.events;
    CREATE TRIGGER trg_sitemap_events
      AFTER INSERT OR DELETE OR UPDATE OF title, date, event_start_utc, is_hidden ON public.events
      FOR EACH ROW EXECUTE FUNCTION public.enqueue_sitemap_change('event');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'restaurants') THEN
    DROP TRIGGER IF EXISTS trg_sitemap_restaurants ON public.restaurants;
    CREATE TRIGGER trg_sitemap_restaurants
      AFTER INSERT OR DELETE OR UPDATE OF name, slug, is_featured ON public.restaurants
      FOR EACH ROW EXECUTE FUNCTION public.enqueue_sitemap_change('restaurant');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'attractions') THEN
    DROP TRIGGER IF EXISTS trg_sitemap_attractions ON public.attractions;
    CREATE TRIGGER trg_sitemap_attractions
      AFTER INSERT OR DELETE OR UPDATE OF name ON public.attractions
      FOR EACH ROW EXECUTE FUNCTION public.enqueue_sitemap_change('attraction');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'articles') THEN
    DROP TRIGGER IF EXISTS trg_sitemap_articles ON public.articles;
    CREATE TRIGGER trg_sitemap_articles
      AFTER INSERT OR DELETE OR UPDATE OF title, slug, status ON public.articles
      FOR EACH ROW EXECUTE FUNCTION public.enqueue_sitemap_change('article');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Public storage bucket for the regenerated sitemap files.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
SELECT 'sitemaps', 'sitemaps', true
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'sitemaps');

-- ---------------------------------------------------------------------------
-- 5. Schedule the event-driven regeneration every 6 hours via pg_cron.
-- ---------------------------------------------------------------------------
DO $cron$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
      EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA cron';
    ELSE
      RAISE NOTICE 'pg_cron unavailable; skipping regenerate-sitemaps schedule';
      RETURN;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'regenerate-sitemaps-event-driven') THEN
    PERFORM cron.unschedule('regenerate-sitemaps-event-driven');
  END IF;

  PERFORM cron.schedule(
    'regenerate-sitemaps-event-driven',
    '0 */6 * * *',
    $$
    SELECT net.http_post(
      url := 'https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/regenerate-sitemaps',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('source', 'cron')::text
    ) as request_id;
    $$
  );

  RAISE NOTICE 'Cron job "regenerate-sitemaps-event-driven" scheduled (every 6h)';
END
$cron$;
