-- Edge-function consolidation (maintenance router): repoint any pg_cron jobs
-- that POST to the standalone maintenance functions at their old paths onto the
-- new consolidated dispatcher, addressed by name in the URL sub-path
-- (`/functions/v1/maintenance/<name>`).
--
-- Rewrites each matching job's command URL in place via cron.alter_job,
-- preserving job name, schedule, and headers. Additive-safe and idempotent.
-- geocode-location is intentionally NOT included — it remains a standalone
-- function because a DB trigger invokes it by its current path.
-- No request/response shape changes — only the URL prefix gains `/maintenance`.

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
      'cleanup-old-events',
      'regenerate-sitemaps',
      'data-quality-heal',
      'job-health-watchdog',
      'update-event-datetime',
      'web-vitals-weekly',
      'run-scheduled-audit',
      'seo-audit',
      'log-content-metrics',
      'log-error'
    ]) AS fn
  LOOP
    FOR jid IN
      SELECT jobid FROM cron.job
      WHERE command LIKE '%/functions/v1/' || r.fn || '%'
        AND command NOT LIKE '%/functions/v1/maintenance/%'
    LOOP
      SELECT replace(command,
                     '/functions/v1/' || r.fn,
                     '/functions/v1/maintenance/' || r.fn)
        INTO newcmd
      FROM cron.job WHERE jobid = jid;

      PERFORM cron.alter_job(job_id := jid, command := newcmd);
    END LOOP;
  END LOOP;
END $$;
