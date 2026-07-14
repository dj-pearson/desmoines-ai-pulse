-- Edge-function consolidation (content router): repoint any pg_cron jobs that
-- POST to the standalone AI-content functions at their old paths onto the new
-- consolidated dispatcher, addressed by name in the URL sub-path
-- (`/functions/v1/content/<name>`).
--
-- Rewrites each matching job's command URL in place via cron.alter_job,
-- preserving job name, schedule, and headers. Additive-safe and idempotent.
-- No request/response shape changes — only the URL prefix gains `/content`.

DO $$
DECLARE
  r   record;
  jid bigint;
  newcmd text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT unnest(ARRAY[
      'ai-article-pipeline',
      'analyze-competitor',
      'analyze-content',
      'analyze-images',
      'batch-enhance-events',
      'bulk-enhance-events',
      'bulk-update-restaurants',
      'campaign-creative-review',
      'enhance-content',
      'generate-article',
      'generate-hotel-affiliate-urls',
      'generate-proposal',
      'generate-pseo-page',
      'generate-seo-content',
      'generate-weekend-guide',
      'moderate-content',
      'pseo-batch-worker',
      'suggest-article-topics'
    ]) AS fn
  LOOP
    FOR jid IN
      SELECT jobid FROM cron.job
      WHERE command LIKE '%/functions/v1/' || r.fn || '%'
        AND command NOT LIKE '%/functions/v1/content/%'
    LOOP
      SELECT replace(command,
                     '/functions/v1/' || r.fn,
                     '/functions/v1/content/' || r.fn)
        INTO newcmd
      FROM cron.job WHERE jobid = jid;

      PERFORM cron.alter_job(job_id := jid, command := newcmd);
    END LOOP;
  END LOOP;
END $$;
