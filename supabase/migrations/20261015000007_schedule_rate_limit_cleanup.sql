-- rate_limit_entries has never been cleaned.
--
-- 20260402000001 created cleanup_rate_limit_entries() and the comment says
-- "call on schedule or periodically"; nothing ever did. check_rate_limit
-- writes one row per client, endpoint and window, so the table grows with
-- every rate-limited request for ever.
--
-- Plain SQL on pg_cron: no pg_net, no Vault secret, so none of the failure
-- modes behind the failing HTTP crons (cron-health-baseline.json) apply.
--
-- A day of retention rather than the function's hour. The longest window any
-- checkRateLimitPersistent caller uses today is 15 minutes, but a row must
-- outlive its window or the counter resets early, and a day leaves room for
-- a longer window without anyone remembering to revisit this. created_at is
-- indexed (idx_rate_limit_created).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed; skipping rate-limit-cleanup schedule';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rate-limit-cleanup') THEN
    PERFORM cron.unschedule('rate-limit-cleanup');
  END IF;

  PERFORM cron.schedule(
    'rate-limit-cleanup',
    '17 * * * *',
    $cron$DELETE FROM public.rate_limit_entries WHERE created_at < now() - interval '1 day'$cron$
  );
END
$$;
