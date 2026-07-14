-- Edge-function consolidation (images / gsc / social routers): repoint any
-- pg_cron jobs that POST to the standalone functions folded into these routers
-- onto the new dispatchers, addressed by name in the router sub-path.
--
-- Rewrites each matching job's command URL in place via cron.alter_job,
-- preserving job name, schedule, and headers. Additive-safe and idempotent.
-- No request/response shape changes — only the URL prefix gains the router name.

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
      ('apply-image',           'images'),
      ('backfill-images',       'images'),
      ('find-image-candidates', 'images'),
      ('parse-menu-upload',     'images'),
      ('gsc-fetch-properties',  'gsc'),
      ('gsc-sync-data',         'gsc'),
      ('google-indexing-api',   'gsc'),
      ('social-daily-poster',   'social'),
      ('social-media-manager',  'social'),
      ('manage-social-account', 'social')
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
