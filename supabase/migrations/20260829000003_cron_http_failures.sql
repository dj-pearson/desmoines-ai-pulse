-- What the scheduled POSTs actually got back (WEB-OPS-007 AC4).
--
-- cron.job_run_details records that net.http_post was ENQUEUED, not what came
-- back, so a job whose target 404s or 500s reports "succeeded" forever. The
-- verdict does exist - pg_net writes it to net._http_response - and nothing in
-- this project has ever read that table.
--
-- Reading it on 2026-08-29 found four distinct production defects that every
-- other monitor showed as healthy:
--
--   all 10 event-scrape sources failing, wrapped in {"success":true} and HTTP 200
--   38 responses of {"code":"NOT_FOUND"} from campaign-creative-review-sweep,
--     which has fired 1,105 times at a function that was never deployed
--   send-event-reminders 500ing on 42804 for 184 consecutive hourly runs
--   batch-enhance-events throwing "Cannot read properties of undefined" twice a
--     day because its cron posts a payload shape it has never supported
--
-- Four schedulers, four callees, four different ways of not agreeing. The
-- contract between a pg_cron job and the edge function it posts to is checked by
-- nothing at all, and this RPC is what lets a check read the answer.
--
-- WHY AN RPC: net._http_response lives in a schema PostgREST cannot reach, the
-- same reason cron_health (20260822000009) exists for cron.job_run_details. This
-- follows that function exactly - SECURITY DEFINER, pinned search_path, admin or
-- service-role only.
--
-- NO URL COLUMN. pg_net's response table does not store the request URL and the
-- queue row is deleted once processed, so failures are grouped by a normalised
-- signature of the response body instead. That is enough to say "something
-- scheduled is getting a 404 forty times a day" and to name the error; pairing a
-- signature with its job is done by correlating times against cron.job.
--
-- Additive: new function, no existing shape changed.

CREATE OR REPLACE FUNCTION public.cron_http_failures(window_hours integer DEFAULT 24)
RETURNS TABLE (
  status_code integer,
  signature text,
  failures bigint,
  first_seen timestamptz,
  last_seen timestamptz,
  sample text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- service_role (cron, CI) has auth.uid() null and is allowed through; a
  -- signed-in caller must be an admin. Same gate as cron_health.
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'cron_http_failures requires admin';
  END IF;

  RETURN QUERY
  SELECT
    r.status_code,
    -- Collapse the varying parts so one recurring failure is one row rather
    -- than forty: digits, uuids and quoted values carry per-run detail.
    left(
      regexp_replace(
        regexp_replace(coalesce(r.error_msg, r.content::text), '[0-9a-f]{8}-[0-9a-f-]{27}', '<uuid>', 'g'),
        '[0-9]+', 'N', 'g'
      ),
      160
    ) AS signature,
    count(*) AS failures,
    min(r.created) AS first_seen,
    max(r.created) AS last_seen,
    left(coalesce(r.error_msg, r.content::text), 300) AS sample
  FROM net._http_response r
  WHERE r.created > now() - make_interval(hours => window_hours)
    AND (r.status_code IS NULL OR r.status_code < 200 OR r.status_code >= 300)
  GROUP BY 1, 2, 6
  ORDER BY 3 DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.cron_http_failures(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cron_http_failures(integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.cron_http_failures(integer) IS
  'Non-2xx responses to scheduled net.http_post calls, grouped by a normalised signature. '
  'WEB-OPS-007 AC4: cron records the enqueue, not the outcome. Read by scripts/check-cron-http-responses.ts.';
