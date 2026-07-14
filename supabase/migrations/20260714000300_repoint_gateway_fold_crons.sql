-- Edge-function consolidation (gateway folds): repoint pg_cron jobs for the
-- formerly gateway-authenticated functions that were folded into the ingest and
-- notifications routers. Each is now addressed by name in the router sub-path,
-- and the router enforces requireAdminOrApiKey for these routes (the cron
-- service-role bearer passes, exactly as it satisfied the old gateway check).
--
-- Rewrites each matching job's command URL in place via cron.alter_job,
-- preserving job name, schedule, and headers. Additive-safe and idempotent.

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
    SELECT * FROM (VALUES
      ('auto-enrich-restaurants',       'ingest'),
      ('validate-source-urls',          'ingest'),
      ('search-new-hotels',             'ingest'),
      ('search-new-restaurants',        'ingest'),
      ('crawl-site',                    'ingest'),
      ('dispatch-scheduled-newsletters','notifications'),
      ('send-weekly-digest',            'notifications')
    ) AS t(fn, router)
  LOOP
    FOR jid IN
      SELECT jobid FROM cron.job
      WHERE command LIKE '%/functions/v1/' || r.fn || '%'
        AND command NOT LIKE '%/functions/v1/' || r.router || '/%'
    LOOP
      SELECT replace(command,
                     '/functions/v1/' || r.fn,
                     '/functions/v1/' || r.router || '/' || r.fn)
        INTO newcmd
      FROM cron.job WHERE jobid = jid;

      PERFORM cron.alter_job(job_id := jid, command := newcmd);
    END LOOP;
  END LOOP;
END $$;
