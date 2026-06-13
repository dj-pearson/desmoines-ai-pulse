-- WEB-AUTO-007: AI article pipeline (topic -> draft -> quality gate -> auto-publish)
--
-- Additive only: new nullable/defaulted columns on articles, one seed row in
-- system_settings (the pause flag), and a new daily pg_cron job. No drops, no
-- renames, no tightening -- safe for live web + iOS/Android readers (old
-- clients simply ignore the new columns).

-- 1. Provenance + quality-gate columns on articles -------------------------
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS auto_generated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quality_score integer,
  ADD COLUMN IF NOT EXISTS generation_reasons text[],
  ADD COLUMN IF NOT EXISTS generation_topic text;

COMMENT ON COLUMN public.articles.auto_generated IS
  'WEB-AUTO-007: true when the row was created by the auto-article-pipeline (vs human-authored).';
COMMENT ON COLUMN public.articles.quality_score IS
  'WEB-AUTO-007: 0-100 quality-gate score the pipeline assigned at creation time.';

-- Cheap lookup for "auto-published today" cap + admin filtering.
CREATE INDEX IF NOT EXISTS idx_articles_auto_generated
  ON public.articles (auto_generated, published_at)
  WHERE auto_generated = true;

-- 2. Pause flag (single DB config row, admin-toggleable, no code change) -----
-- system_settings is admin-only RLS FOR ALL; service_role (the pipeline) bypasses RLS.
INSERT INTO public.system_settings (setting_type, settings)
SELECT 'article_pipeline', jsonb_build_object('paused', false)
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_settings WHERE setting_type = 'article_pipeline'
);

-- 3. Daily schedule ---------------------------------------------------------
-- Routes through the WEB-AUTO-001 jobRunner (Job Health panel + failure alerts).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('auto-article-pipeline-daily')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-article-pipeline-daily');

    PERFORM cron.schedule(
      'auto-article-pipeline-daily',
      '0 13 * * *',  -- daily 13:00 UTC (~7-8am America/Chicago)
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/auto-article-pipeline',
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
