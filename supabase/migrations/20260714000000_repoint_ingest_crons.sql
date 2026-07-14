-- Edge-function consolidation (ingest router): repoint any pg_cron jobs that
-- POST to the standalone ingest functions at their old paths onto the new
-- consolidated dispatcher, addressed by name in the URL sub-path
-- (`/functions/v1/ingest/<name>`).
--
-- Rewrites each matching job's command URL in place via cron.alter_job,
-- preserving job name, schedule, and headers (the service-role bearer that
-- requireAdminOrApiKey already accepts). Additive-safe and idempotent: once a
-- job points at /functions/v1/ingest/<name>, its command no longer contains the
-- bare `/functions/v1/<name>` opener, so a re-run is a no-op. No request or
-- response shape changes — only the URL prefix gains `/ingest`.

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
      'scrape-events',
      'restaurant-opening-scraper',
      'ai-crawler',
      'firecrawl-scraper',
      'extract-catchdesmoines-urls',
      'dedupe-content',
      'fix-broken-event-urls'
    ]) AS fn
  LOOP
    FOR jid IN
      SELECT jobid FROM cron.job
      WHERE command LIKE '%/functions/v1/' || r.fn || '%'
        AND command NOT LIKE '%/functions/v1/ingest/%'
    LOOP
      SELECT replace(command,
                     '/functions/v1/' || r.fn,
                     '/functions/v1/ingest/' || r.fn)
        INTO newcmd
      FROM cron.job WHERE jobid = jid;

      PERFORM cron.alter_job(job_id := jid, command := newcmd);
    END LOOP;
  END LOOP;
END $$;
