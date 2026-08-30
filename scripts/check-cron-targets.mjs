#!/usr/bin/env node
/**
 * A scheduled job must point at a function that exists (WEB-OPS-007).
 *
 * THE FAILURE IS A SUCCESS, which is why nothing has ever reported it. A pg_cron
 * job here posts to an edge function with net.http_post, and the job SUCCEEDS
 * when the POST is ENQUEUED - not when it lands. So a job whose target has never
 * been deployed reports success on every run, forever:
 *
 *     cron_health          the trigger fired      -> healthy
 *     automation_job_runs  the function never ran -> no row, looks idle
 *
 * WEB-OPS-007 AC6 describes the second half. This is the first. Between them
 * nothing checks that the endpoint on the other end of the POST exists, and
 * measuring it found five of the eleven jobs the nightly audit called "now
 * succeeding" were firing into 404s.
 *
 * OFFLINE. Cross-references the /functions/v1/<name> URLs written into
 * supabase/migrations against edge-deploy-baseline.json, which
 * scripts/check-edge-deploys.ts maintains from production. No database, no
 * network, deterministic per commit.
 *
 * WHAT IT CANNOT TELL YOU, stated because the number is large and easy to
 * over-read: a URL in a migration is a job that was SCHEDULED AT SOME POINT, not
 * necessarily one that is scheduled now. A later migration may have unscheduled
 * it, and this reads files rather than cron.job. Treat the list as "these
 * schedules were written against functions that do not exist", and confirm
 * against cron.job before concluding a specific job is live and firing blanks.
 *
 * A REPORT, NOT A GATE, for the same reason: the fix is a deploy, which is
 * outside the repo, so failing a build on it would block every PR on somebody
 * else's action.
 *
 *   node scripts/check-cron-targets.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');
const DEPLOY_BASELINE = join(ROOT, 'edge-deploy-baseline.json');

for (const [label, path] of [['migrations', MIGRATIONS], ['edge-deploy-baseline.json', DEPLOY_BASELINE]]) {
  if (!existsSync(path)) {
    console.error(`[cron-targets] ${label} not found - refusing to pass.`);
    process.exit(1);
  }
}

const undeployed = new Set(JSON.parse(readFileSync(DEPLOY_BASELINE, 'utf8')).undeployed ?? []);
if (undeployed.size === 0) {
  console.log('[cron-targets] the deploy baseline lists nothing undeployed; nothing to cross-reference.');
  process.exit(0);
}

/** function name -> the migration files that post to it. */
const targets = new Map();
for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'))) {
  const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
  for (const m of sql.matchAll(/\/functions\/v1\/([a-z0-9-]+)/g)) {
    if (!targets.has(m[1])) targets.set(m[1], []);
    if (!targets.get(m[1]).includes(file)) targets.get(m[1]).push(file);
  }
}

// A SCAN THAT FOUND NO TARGETS IS NOT A CLEAN RESULT. Several checks in this
// repo have reported success while reading zero inputs; see check-edge-types.
if (targets.size === 0) {
  console.error('[cron-targets] no /functions/v1/ URL found in any migration - refusing to pass.');
  process.exit(1);
}

const missing = [...targets.entries()].filter(([name]) => undeployed.has(name)).sort();

console.log(
  `[cron-targets] ${targets.size} function(s) are posted to from migrations; ${missing.length} have never been deployed.`,
);

if (missing.length === 0) {
  console.log('OK Every scheduled target exists.');
  process.exit(0);
}

// Grouped, because 29 of them are one fleet and listing them flat reads as 29
// separate problems rather than one undeployed subsystem.
const fleet = missing.filter(([n]) => n.startsWith('agent-'));
const rest = missing.filter(([n]) => !n.startsWith('agent-'));

if (fleet.length) {
  console.log(`\n  the agent fleet (${fleet.length}) - one subsystem, not ${fleet.length} problems:`);
  console.log(`    ${fleet.map(([n]) => n).join(', ')}`);
}
for (const [name, files] of rest) {
  console.log(`\n  ${name}`);
  console.log(`    scheduled by ${files.join(', ')}`);
}

console.log(
  '\n  Each of these is a POST to an endpoint that answers 404. The job still\n' +
    '  reports success, because net.http_post succeeds when the request is\n' +
    '  ENQUEUED - so cron_health shows healthy and no automation_job_runs row is\n' +
    '  written either. The work has never happened and nothing says so.\n' +
    '\n' +
    '  A migration URL means the job was scheduled at some point, not that it is\n' +
    '  scheduled now; confirm against cron.job before acting on a single entry.\n' +
    '  The fix is a deploy: Deploy Edge Functions has never run successfully\n' +
    '  because SUPABASE_ACCESS_TOKEN is unset on the Scrape environment.\n',
);
process.exit(0);
