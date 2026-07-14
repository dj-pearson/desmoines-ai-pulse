-- Edge-function consolidation (support router): repoint any pg_cron jobs that
-- POST to the standalone support functions at their old paths onto the new
-- consolidated dispatcher, addressed by name in the URL sub-path
-- (`/functions/v1/support/<name>`).
--
-- Rewrites each matching job's command URL in place via cron.alter_job,
-- preserving job name, schedule, and headers. Additive-safe and idempotent.
-- (support-kb-embed is intended to run on a schedule; this repoints it if such
-- a job exists.) No request/response shape changes — only the URL prefix gains
-- `/support`.

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
      'support-chat',
      'support-console',
      'support-csat-submit',
      'support-kb-admin',
      'support-kb-embed',
      'support-kb-search',
      'support-ticket-reclassify'
    ]) AS fn
  LOOP
    FOR jid IN
      SELECT jobid FROM cron.job
      WHERE command LIKE '%/functions/v1/' || r.fn || '%'
        AND command NOT LIKE '%/functions/v1/support/%'
    LOOP
      SELECT replace(command,
                     '/functions/v1/' || r.fn,
                     '/functions/v1/support/' || r.fn)
        INTO newcmd
      FROM cron.job WHERE jobid = jid;

      PERFORM cron.alter_job(job_id := jid, command := newcmd);
    END LOOP;
  END LOOP;
END $$;
