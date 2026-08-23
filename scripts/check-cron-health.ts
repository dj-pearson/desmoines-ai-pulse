#!/usr/bin/env tsx
/**
 * Scheduled-job health check (WEB-OPS-007).
 *
 * WHAT IT ASKS, and why nothing else asks it. Every autonomous agent, every
 * nightly backfill, every digest and reminder in this project is delivered by a
 * pg_cron job that posts to an edge function. The only place the scheduler
 * records whether that worked is cron.job_run_details, which lives in a schema
 * PostgREST cannot reach. So the verdict existed the whole time and nothing had
 * ever read it.
 *
 * WEB-AUTO-001 shipped "cron/job observability, auto-retry, failure alerts" and
 * did not catch this, because it observes automation_job_runs -- a table the
 * edge functions write WHEN THEY RUN. A job that never fires writes no row, so
 * an agent that has never once executed is indistinguishable from an agent with
 * nothing to do. Monitoring the work instead of the trigger is the whole gap.
 *
 * WHAT IT FOUND, production 2026-08-22, whole retained history:
 *   84,718 succeeded / 171,633 failed, oldest row 2025-07-30
 *   57 of 61 jobs had NEVER succeeded -- not once, in thirteen months
 * The four that work are the four calling a plain SQL function. Two causes:
 *   1. current_setting('app.settings.supabase_url') -- never set on this
 *      database, and without the missing_ok flag current_setting THROWS.
 *   2. net.http_post(..., body := <text>) -- the installed pg_net takes
 *      `body jsonb`, so the call resolves to no function at all.
 *
 * WHY IT RATCHETS RATHER THAN DEMANDING ZERO. 57 broken jobs cannot be fixed in
 * one pass -- one cause needs a service-role key this repo must never write
 * down -- and a check that is red on day one gets switched off. So it fails on
 * a job that gets WORSE: a new name in the failing set, or a job that was
 * succeeding and stopped.
 *
 * Counts, names and error text only. Never cron.job.command, which embeds the
 * credential lookup.
 *
 * It reads a SNAPSHOT rather than cron.job_run_details itself. Aggregating that
 * table live times out over the API -- 188 MB, 256k rows, indexed only on runid,
 * and CREATE INDEX on it returns "must be owner of table job_run_details". The
 * snapshot is refreshed every 30 minutes by a pg_cron job that calls a plain SQL
 * function, so neither failure mode above can reach it, and a stale snapshot
 * fails this check rather than freezing it green.
 *
 * Usage:
 *   npx tsx scripts/check-cron-health.ts            # check
 *   npx tsx scripts/check-cron-health.ts --update   # re-baseline
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'cron-health-baseline.json');
const UPDATE = process.argv.includes('--update');
/** A snapshot older than this means the snapshot job itself stopped. */
const MAX_SNAPSHOT_AGE_MINUTES = 120;

function env(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  const f = join(ROOT, '.env');
  if (!existsSync(f)) return undefined;
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    if (line.slice(0, i).trim() === key) return line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return undefined;
}

const URL_ = env('SUPABASE_URL') ?? env('VITE_SUPABASE_URL');
const KEY = env('SUPABASE_SERVICE_ROLE_KEY');
if (!URL_ || !KEY) {
  // Skips rather than fails: a fork or a local checkout has no service-role key,
  // and this must not be the reason someone deletes the step.
  console.error('[cron-health] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set - skipping.');
  process.exit(0);
}

interface Row {
  jobname: string;
  schedule: string;
  active: boolean;
  window_hours: number;
  runs: number;
  succeeded: number;
  failed: number;
  last_success: string | null;
  last_failure: string | null;
  last_error: string | null;
  captured_at: string;
}

const res = await fetch(`${URL_}/rest/v1/rpc/cron_health`, {
  method: 'POST',
  headers: {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
  },
  body: '{}',
});

if (!res.ok) {
  console.error(`[cron-health] cron_health RPC returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  console.error('  Apply supabase/migrations/20260822000009_cron_health_snapshot.sql if it is missing.');
  process.exit(1);
}

const rows = (await res.json()) as Row[];
if (rows.length === 0) {
  console.error('[cron-health] cron_health returned no jobs at all - refusing to pass.');
  console.error('  Either the snapshot has never been populated, or pg_cron has no jobs.');
  process.exit(1);
}

// The snapshot is written by the cron-health-snapshot job, which is one of the
// few that works because it calls a plain SQL function and makes no HTTP call.
// If it stops, every count below freezes at its last value and this check would
// keep passing on stale data -- the precise failure this story is about.
const capturedAt = new Date(rows[0].captured_at);
const ageMinutes = (Date.now() - capturedAt.getTime()) / 60_000;
if (!Number.isFinite(ageMinutes) || ageMinutes > MAX_SNAPSHOT_AGE_MINUTES) {
  console.error(
    `[cron-health] snapshot is ${Math.round(ageMinutes)} minutes old ` +
      `(captured ${rows[0].captured_at}), over the ${MAX_SNAPSHOT_AGE_MINUTES}-minute limit.`,
  );
  console.error('  The cron-health-snapshot job (*/30) has stopped, so these counts are frozen.');
  process.exit(1);
}

// A job with no runs in the window is not evidence of anything: a weekly job
// simply has not come around yet. Only jobs that actually ran are judged.
const ran = rows.filter((r) => r.runs > 0);
const failing = ran.filter((r) => r.succeeded === 0 && r.failed > 0).map((r) => r.jobname).sort();
const healthy = ran.filter((r) => r.succeeded > 0).map((r) => r.jobname).sort();

const totals = ran.reduce(
  (a, r) => ({ ok: a.ok + r.succeeded, bad: a.bad + r.failed }),
  { ok: 0, bad: 0 },
);

if (UPDATE) {
  writeFileSync(BASELINE, `${JSON.stringify({ failing, healthy }, null, 2)}\n`);
  console.log(`[cron-health] baseline written: ${failing.length} failing, ${healthy.length} healthy.`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error('[cron-health] no baseline. Create one with --update.');
  process.exit(1);
}

const base = JSON.parse(readFileSync(BASELINE, 'utf8')) as { failing: string[]; healthy: string[] };
const knownFailing = new Set(base.failing ?? []);
const knownHealthy = new Set(base.healthy ?? []);

const newlyFailing = failing.filter((j) => !knownFailing.has(j));
const regressed = failing.filter((j) => knownHealthy.has(j));
const fixed = base.failing.filter((j) => healthy.includes(j));

console.log(
  `[cron-health] last ${rows[0].window_hours}h (snapshot ${Math.round(ageMinutes)}m old): ${ran.length} job(s) ran, ` +
    `${healthy.length} healthy, ${failing.length} failing every run. ` +
    `${totals.ok} succeeded / ${totals.bad} failed.`,
);

if (fixed.length) {
  console.log(`\nNow succeeding (${fixed.length}) - re-baseline to lock it in:`);
  for (const j of fixed) console.log(`  ${j}`);
}

const broken = [...new Set([...newlyFailing, ...regressed])].sort();
if (broken.length) {
  console.error(`\nX ${broken.length} scheduled job(s) newly failing every run:`);
  for (const j of broken) {
    const r = ran.find((x) => x.jobname === j)!;
    console.error(`  ${j}  (${r.failed} failures, schedule ${r.schedule})`);
    if (r.last_error) console.error(`    ${r.last_error.replace(/\s+/g, ' ').slice(0, 160)}`);
  }
  console.error(
    '\n  A pg_cron job failing every run is invisible from the app: the edge\n' +
      '  function it calls never executes, so it writes no automation_job_runs row\n' +
      '  and looks like an agent with nothing to do.\n' +
      '  If the failure is expected, re-baseline: npx tsx scripts/check-cron-health.ts --update\n',
  );
  process.exit(1);
}

console.log('\nOK No scheduled job newly failing.');
