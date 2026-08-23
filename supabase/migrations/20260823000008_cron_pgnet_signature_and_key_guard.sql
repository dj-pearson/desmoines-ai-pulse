-- WEB-OPS-007 AC2 + AC3: fix the pg_net signature on the seven jobs that carry
-- it, and make each one RAISE when the service-role key is absent.
--
-- MEASURED against cron.job_run_details over the last 7 days before writing
-- this, rather than taken from the story:
--     19,462 failures  unrecognized configuration parameter "app.settings.supabase_url"   <- AC1, owner's
--         58 failures  function net.http_post(url => unknown, headers => jsonb, body => text) does not exist
--          1 failure   unrecognized configuration parameter "app.settings.service_role_key"
-- So AC1 is 99.7% of the volume and is not touched here - the key value must be
-- set once against the database by the owner and must never appear in a
-- migration. AC2 is the 58, and it is all seven jobs below.
--
-- THE BUG IS ONE CAST. The installed pg_net is
--     net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer)
-- and every one of these seven passes `body := jsonb_build_object(...)::text`.
-- Named arguments are otherwise fine, which is why the 45 other jobs using
-- `body :=` are NOT affected: they pass jsonb and resolve correctly.
--
-- WHY THE GUARD IS NOT OPTIONAL, and this is AC3's warning verbatim. These seven
-- HARDCODE their URL, so unlike the 48 AC1 jobs they never touch
-- app.settings.supabase_url and nothing throws before the HTTP call. They read
-- the key with current_setting(..., true), which returns NULL when unset, and
-- 'Bearer ' || NULL is NULL. Remove the ::text alone and each job would post
-- unauthenticated; net.http_post returns a request id immediately and never
-- reports the HTTP status back to cron, so pg_cron would record SUCCESS while
-- the edge function answered 401 - or 404, since several of these targets are
-- among the 62 undeployed functions. That is strictly worse than today's loud
-- failure, which is why the RAISE goes in with the cast fix and not after it.
--
-- BEHAVIOUR TODAY IS UNCHANGED IN KIND: every one of these still fails on every
-- run while the key is unset. Only the message changes, from a signature error
-- that reads like a code bug to one naming the missing setting. The moment the
-- owner sets app.settings.service_role_key, they start working.

DO $migration$
DECLARE
  r          record;
  jid        bigint;
  newcmd     text;
  base_url   text := 'https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed; nothing to alter';
    RETURN;
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      -- jobname,                            edge function,             body payload SQL,                                        extra headers SQL
      ('regenerate-sitemaps-event-driven',   'regenerate-sitemaps',     $p$jsonb_build_object('source', 'cron')$p$,               $h${}$h$),
      ('saved-search-alerts-nightly',        'saved-search-alerts',     $p$jsonb_build_object('source', 'cron')$p$,               $h${}$h$),
      ('social-daily-poster-daily',          'social-daily-poster',     $p$jsonb_build_object('source', 'cron')$p$,               $h${}$h$),
      ('auto-enrich-restaurants-daily',      'auto-enrich-restaurants', $p$jsonb_build_object('batchSize', 20, 'prioritizeNew', true)$p$, $h${}$h$),
      ('validate-source-urls-weekly',        'validate-source-urls',    $p$jsonb_build_object('limit', 50, 'useAI', true)$p$,     $h${}$h$),
      ('nightly-coordinate-backfill',        'backfill-all-coordinates',$p$jsonb_build_object('trigger_source', 'cron', 'scheduled_at', now())$p$, $h${}$h$),
      ('generate-weekend-guide',             'generate-weekend-guide',  $p$jsonb_build_object('trigger', 'cron', 'timestamp', now())$p$, $h$jsonb_build_object('x-point', 'cron-trigger')$h$)
    ) AS t(jobname, fn, payload_sql, extra_headers_sql)
  LOOP
    SELECT jobid INTO jid FROM cron.job WHERE jobname = r.jobname;
    IF jid IS NULL THEN
      RAISE NOTICE 'cron job % not found; skipping', r.jobname;
      CONTINUE;
    END IF;

    newcmd := format(
      $cmd$DO $job$
BEGIN
  IF coalesce(current_setting('app.settings.service_role_key', true), '') = '' THEN
    RAISE EXCEPTION 'app.settings.service_role_key is not set; refusing to POST to %1$s unauthenticated (WEB-OPS-007)';
  END IF;
  PERFORM net.http_post(
    url := %2$L,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
      'Content-Type', 'application/json'
    ) || %3$s,
    body := %4$s
  );
END
$job$;$cmd$,
      r.fn,
      base_url || r.fn,
      COALESCE(NULLIF(r.extra_headers_sql, '{}'), '''{}''::jsonb'),
      r.payload_sql
    );

    PERFORM cron.alter_job(jid, command => newcmd);
    RAISE NOTICE 'rewrote cron job % (jobid %)', r.jobname, jid;
  END LOOP;
END
$migration$;
