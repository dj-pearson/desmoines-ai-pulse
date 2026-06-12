/**
 * job-health-watchdog (WEB-AUTO-001)
 *
 * Scheduled daily. For each observed job it knows the expected cadence; if the
 * job hasn't recorded a SUCCESS within ~2 expected intervals (i.e. it missed two
 * consecutive runs) OR its latest run failed, it emails the admin. This closes
 * the loop so silently-broken automation reports itself instead of needing a
 * human to notice.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, getCorsHeaders } from '../_shared/cors.ts';
import { requireAdminOrApiKey } from '../_shared/apiKeyAuth.ts';
import { sendJobAlert } from '../_shared/jobRunner.ts';

// Expected max age (hours) between successful runs per job = ~2x the cadence.
// A job missing for longer than this has effectively missed two runs.
const EXPECTED_MAX_AGE_HOURS: Record<string, number> = {
  'cleanup-old-events': 24 * 14,        // weekly cron -> alert after 2 weeks
  'generate-sitemaps': 24 * 2,          // daily -> 2 days
  'dispatch-scheduled-newsletters': 2,  // ~every 30-60 min -> 2h
  'validate-source-urls': 24 * 14,      // weekly -> 2 weeks
  'aggregate-daily-ad-analytics': 48,   // daily -> 2 days
  'data-quality-heal': 48,              // nightly -> 2 days (WEB-AUTO-003)
};

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

  for (const [jobName, maxAgeHours] of Object.entries(EXPECTED_MAX_AGE_HOURS)) {
    // Latest SUCCESS for cadence; latest run for failure detection.
    const { data: lastSuccess } = await supabase
      .from('automation_job_runs')
      .select('started_at')
      .eq('job_name', jobName)
      .eq('status', 'success')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: lastRun } = await supabase
      .from('automation_job_runs')
      .select('status, started_at, error')
      .eq('job_name', jobName)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

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

  return new Response(
    JSON.stringify({ checked: Object.keys(EXPECTED_MAX_AGE_HOURS).length, alerts }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
