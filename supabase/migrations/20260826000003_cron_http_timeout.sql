-- pg_net's http_post defaults to timeout_milliseconds = 5000. Most of these
-- jobs call functions that do real work — backfill-images processes a batch,
-- scrape-events walks a source list — and none of them answer inside 5s.
--
-- The request is still sent and the function still runs; pg_net just stops
-- waiting and records a timeout, so the job shows as failed and job-health
-- reports "has run but never succeeded". Measured: backfill-images at the 5s
-- default times out, at 30s returns 200 with processed=5, updated=5.
--
-- 30s is a trigger timeout, not a work budget. Jobs whose function legitimately
-- runs longer should return 202 immediately and continue in the background
-- rather than have this raised further.

do $timeouts$
declare
  j record;
  rewritten text;
begin
  for j in select jobid, jobname, command from cron.job
           where command ilike '%net.http_post%'
             and command not ilike '%timeout_milliseconds%'
  loop
    -- Append the arg to the http_post call. The call always ends with a closing
    -- paren that follows the last named argument; anchor on the final ')' that
    -- closes http_post by matching the body/headers argument that precedes it.
    rewritten := regexp_replace(
      j.command,
      '(net\.http_post\s*\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*)\)',
      '\1,
      timeout_milliseconds := 30000)',
      'i'
    );

    if rewritten is distinct from j.command then
      perform cron.alter_job(j.jobid, command := rewritten);
      raise notice 'timeout set on %', j.jobname;
    end if;
  end loop;
end
$timeouts$;
