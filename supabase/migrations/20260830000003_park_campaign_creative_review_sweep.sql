-- campaign-creative-review is not deployed, and campaign-creative-review-sweep
-- calls it every 10 minutes: 154 404s in the last 24 hours, ~4,320 a month.
-- That is 96% of all wasted invocations from crons pointing at functions that
-- do not exist, and it is the single loudest entry in the edge logs, which
-- makes every other failure harder to see.
--
-- Parked rather than unscheduled, so re-enabling is one statement once
-- .github/workflows/deploy-edge-functions.yml ships the function:
--
--   select cron.alter_job(jobid, active := true)
--   from cron.job where jobname = 'campaign-creative-review-sweep';
--
-- The four other crons whose target is undeployed are deliberately LEFT ON:
--
--   regenerate-sitemaps-event-driven  0 */6 * * *   ~120/mo
--   social-daily-poster-daily         0 14 * * *     ~30/mo
--   saved-search-alerts-nightly       0 7 * * *      ~30/mo
--   web-vitals-weekly                 0 6 * * 1       ~4/mo
--
-- Together they are ~184 invocations a month, which is not worth silencing.
-- Their 404s are the only visible signal that a shipped feature - sitemap
-- regeneration, and saved-search alerts, which is sold on the Insider tier - is
-- not actually running. Parking them would make the dashboard green and the
-- feature still broken, which is the failure mode this whole audit kept finding.

select cron.alter_job(jobid, active := false)
from cron.job
where jobname = 'campaign-creative-review-sweep' and active;
