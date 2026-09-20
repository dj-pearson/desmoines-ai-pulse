/**
 * job-health-watchdog (WEB-AUTO-001)
 *
 * Scheduled daily. For each observed job it knows the expected cadence; if the
 * job hasn't recorded a SUCCESS within ~2 expected intervals (i.e. it missed two
 * consecutive runs) OR its latest run failed, it emails the admin. This closes
 * the loop so silently-broken automation reports itself instead of needing a
 * human to notice.
 *
 * WEB-BE-043 added the second half of that for ingestion. Cadence alone cannot
 * see a source going dark: scrape-events keeps running on schedule, keeps
 * returning 200, and quietly inserts nothing. So this also reads the per-source
 * counts each ingestion job now writes into automation_job_runs.metadata and
 * applies the rule in _shared/ingestionHealth.ts, plus one check that no ledger
 * row can cover - whether the hub ingest door has written anything lately.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, getCorsHeaders } from '../_shared/cors.ts';
import { requireAdminOrApiKey } from '../_shared/apiKeyAuth.ts';
import { sendJobAlert } from '../_shared/jobRunner.ts';
import {
  evaluateIngestionHealth,
  hubIngestStale,
  HUB_INGEST_MAX_AGE_HOURS,
  INGESTION_JOB_MAX_AGE_HOURS,
  ZERO_INSERT_STREAK,
  type LedgerRun,
} from '../_shared/ingestionHealth.ts';

// Expected max age (hours) between successful runs per job = ~2x the cadence.
// A job missing for longer than this has effectively missed two runs.
const EXPECTED_MAX_AGE_HOURS: Record<string, number> = {
  // Nightly since 20260612000014, which moved it off the weekly cron. This
  // entry still said 2 weeks, so the job could miss thirteen consecutive
  // nightly runs before the watchdog had anything to say (WEB-BE-043 AC5).
  'cleanup-old-events': 48,             // nightly -> 2 days
  'generate-sitemaps': 24 * 2,          // daily -> 2 days
  'dispatch-scheduled-newsletters': 2,  // ~every 30-60 min -> 2h
  'validate-source-urls': 24 * 14,      // weekly -> 2 weeks
  'aggregate-daily-ad-analytics': 48,   // daily -> 2 days
  'data-quality-heal': 48,              // nightly -> 2 days (WEB-AUTO-003)
  // WEB-BE-043: the ingestion jobs were the one class of automation this
  // watchdog had never heard of. Their cadences live beside the per-source
  // rule in _shared/ingestionHealth.ts, because the two have to agree about
  // which jobs exist.
  ...INGESTION_JOB_MAX_AGE_HOURS,
};

/** How many recent runs the per-source rule reads. More than the streak, because
 *  the runs past it are what supply the non-zero baseline. */
const INGESTION_RUN_WINDOW = ZERO_INSERT_STREAK * 3;

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const origin = req.headers.get('origin') || undefined;
  const corsHeaders = getCorsHeaders(origin);

  // Admin / cron / service-role only.
  const authFailure = await requireAdminOrApiKey(req, corsHeaders);
  if (authFailure) return authFailure;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const alerts: string[] = [];
  // Jobs whose automation_job_runs read FAILED, as opposed to returning no rows.
  // Without this the watchdog cannot tell those two apart - see the read-failure
  // handling below for why that made it report healthy while blind.
  const unreadable: string[] = [];

  for (const [jobName, maxAgeHours] of Object.entries(EXPECTED_MAX_AGE_HOURS)) {
    // Latest SUCCESS for cadence; latest run for failure detection.
    const { data: lastSuccess, error: lastSuccessError } = await supabase
      .from('automation_job_runs')
      .select('started_at')
      .eq('job_name', jobName)
      .eq('status', 'success')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: lastRun, error: lastRunError } = await supabase
      .from('automation_job_runs')
      .select('status, started_at, error')
      .eq('job_name', jobName)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // A FAILED READ IS NOT A HEALTHY JOB, and this watchdog used to treat it as
    // one. Both queries discarded their error, so a failure left lastRun null -
    // and the `if (lastRun)` gate below then skipped the alert entirely. The
    // function returned { alerts: [] } and a 200, which reads as "everything is
    // fine" from a monitor whose own reads had just failed.
    //
    // That is WEB-AUTO-001's gap in a second form: it shipped cron observability
    // and could not see a job that never fired, because it watched the work
    // rather than the trigger. A monitor also has to be able to report that it
    // could not look.
    if (lastSuccessError || lastRunError) {
      unreadable.push(jobName);
      continue;
    }

    const now = Date.now();
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

    // No successful run ever recorded, or the last success is too old.
    const lastSuccessAge = lastSuccess
      ? now - new Date(lastSuccess.started_at).getTime()
      : Infinity;

    if (lastSuccessAge > maxAgeMs) {
      // Only alert if the job has EVER run (avoid noise for jobs not yet wired).
      if (lastRun) {
        const msg = lastSuccess
          ? `"${jobName}" has not succeeded in ${Math.round(lastSuccessAge / 3_600_000)}h (expected within ${maxAgeHours}h).`
          : `"${jobName}" has run but never succeeded (last status: ${lastRun.status}).`;
        alerts.push(msg);
        await sendJobAlert(jobName, msg);
      }
    } else if (lastRun?.status === 'failed') {
      const msg = `"${jobName}" most recent run failed: ${lastRun.error ?? 'unknown error'}.`;
      alerts.push(msg);
      await sendJobAlert(jobName, msg);
    }
  }

  // ---------------------------------------------------------------------
  // Per-source health (WEB-BE-043 AC4). The cadence loop above answers "did
  // the job run"; this answers "did the job do anything", which is the
  // question SeatGeek's four-month outage needed and nothing was asking.
  // ---------------------------------------------------------------------
  let sourceAlerts = 0;
  for (const jobName of Object.keys(INGESTION_JOB_MAX_AGE_HOURS)) {
    const { data, error } = await supabase
      .from('automation_job_runs')
      .select('started_at, status, metadata')
      .eq('job_name', jobName)
      .order('started_at', { ascending: false })
      .limit(INGESTION_RUN_WINDOW);

    // Same rule as above: an unreadable job is UNKNOWN, not healthy.
    if (error) {
      if (!unreadable.includes(jobName)) unreadable.push(jobName);
      continue;
    }

    for (const alert of evaluateIngestionHealth(jobName, (data ?? []) as LedgerRun[])) {
      sourceAlerts++;
      alerts.push(alert.message);
      await sendJobAlert(jobName, alert.message);
    }
  }

  // ---------------------------------------------------------------------
  // The hub ingest door (WEB-BE-043 AC3). The four 'hub' sources in
  // eventSourceProfiles are produced by an external process that writes
  // through ingest-events, so nothing inside Supabase schedules it and no
  // ledger row appears when it stops. The only observable is whether a
  // provenanced row has landed recently - ingest-events is the sole writer of
  // produced_by, so any such row came through that door.
  // ---------------------------------------------------------------------
  const { data: newestHubRow, error: hubError } = await supabase
    .from('events')
    .select('created_at')
    .not('produced_by', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (hubError) {
    // Named for the check, not the table: it joins the same UNKNOWN list as a
    // job whose ledger could not be read, and for the same reason.
    if (!unreadable.includes('hub-ingest (events.produced_by)')) {
      unreadable.push('hub-ingest (events.produced_by)');
    }
  } else {
    const hub = hubIngestStale(newestHubRow?.created_at ?? null, Date.now());
    if (hub.stale) {
      const msg =
        `No event has arrived through the hub ingest door (ingest-events) in ` +
        `${Math.round(hub.ageHours ?? 0)}h, over the ${HUB_INGEST_MAX_AGE_HOURS}h expectation. ` +
        'The four hub-owned sources in eventSourceProfiles are not being ingested by anything else.';
      alerts.push(msg);
      sourceAlerts++;
      await sendJobAlert('ingest-events', msg);
    }
  }

  // ONE alert for the read failure, not one per job: a table-wide outage would
  // otherwise page N times for a single cause.
  if (unreadable.length > 0) {
    const msg =
      `job-health-watchdog could not read its evidence for ${unreadable.length} job(s) ` +
      `(${unreadable.slice(0, 5).join(', ')}${unreadable.length > 5 ? ', ...' : ''}). ` +
      'Their health is UNKNOWN, not healthy.';
    alerts.push(msg);
    await sendJobAlert('job-health-watchdog', msg);
  }

  return new Response(
    JSON.stringify({
      checked: Object.keys(EXPECTED_MAX_AGE_HOURS).length,
      // Reported separately so a caller can tell "nothing wrong" from "I could
      // not check". Both used to arrive as an empty alerts array.
      unreadable: unreadable.length,
      // How many of the alerts came from the per-source rule rather than the
      // cadence check. The two mean different things: one says a job stopped
      // running, the other says it kept running and stopped working.
      sourceAlerts,
      alerts,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
