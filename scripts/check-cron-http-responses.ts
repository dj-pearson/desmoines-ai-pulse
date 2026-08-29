#!/usr/bin/env tsx
/**
 * What the scheduled POSTs got back (WEB-OPS-007 AC4).
 *
 * check-cron-health.ts reads cron.job_run_details and answers "did the job
 * fire". That is not the same question as "did anything happen", because
 * net.http_post succeeds when the request is ENQUEUED. A job whose target
 * returns 404 or 500 is recorded as succeeded, forever, and the only record of
 * the truth is net._http_response - which nothing in this project had ever read.
 *
 * READING IT ONCE, on 2026-08-29, found four production defects that every other
 * monitor showed as green:
 *
 *   1,105 runs of campaign-creative-review-sweep posting at a function that was
 *     never deployed -> {"code":"NOT_FOUND"}
 *   184 consecutive hourly send-event-reminders runs 500ing on Postgres 42804
 *   batch-enhance-events throwing "Cannot read properties of undefined" twice a
 *     day, because its cron posts a payload shape it has never supported
 *   all 10 event-scrape sources failing inside a wrapper that returned
 *     {"success":true} with HTTP 200 - the one this check could NOT see, which
 *     is why scrape-events now reports total failure as a 500
 *
 * WHAT IT CANNOT SEE, said plainly: a function that fails and reports success
 * with a 2xx. Status codes are the only signal pg_net keeps. That gap is real
 * and is the reason the scrape fix mattered separately.
 *
 * RATCHET, not zero. There are known failures today and a check that is red on
 * day one gets deleted (WEB-CI-020, WEB-CI-021). It fails on a NEW failure
 * signature - one not in the baseline - and prints the rest.
 *
 *   npx tsx scripts/check-cron-http-responses.ts            # check
 *   npx tsx scripts/check-cron-http-responses.ts --update   # re-baseline
 *
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Skips without them, like
 * check-cron-health, so a fork is never the reason someone deletes the step.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'cron-http-baseline.json');
const UPDATE = process.argv.includes('--update');
const WINDOW_HOURS = 48;

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
  console.error('[cron-http] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set - skipping.');
  process.exit(0);
}

interface Row {
  status_code: number | null;
  signature: string;
  failures: number;
  first_seen: string;
  last_seen: string;
  sample: string;
}

const res = await fetch(`${URL_}/rest/v1/rpc/cron_http_failures`, {
  method: 'POST',
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ window_hours: WINDOW_HOURS }),
});

if (res.status === 404 || res.status === 400) {
  // PGRST202 - the RPC is not applied. Say which migration rather than failing
  // with a bare status, because the fix is one file.
  console.error(`[cron-http] cron_http_failures is not available (${res.status}).`);
  console.error('  Apply supabase/migrations/20260829000003_cron_http_failures.sql.');
  process.exit(1);
}
if (!res.ok) {
  console.error(`[cron-http] RPC returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  process.exit(1);
}

const rows = (await res.json()) as Row[];
const total = rows.reduce((s, r) => s + Number(r.failures), 0);

console.log(
  `[cron-http] ${rows.length} distinct failure signature(s) across ${total} non-2xx scheduled response(s) ` +
    `in the last ${WINDOW_HOURS}h.`,
);
for (const r of rows) {
  console.log(`   ${String(r.status_code ?? '---').padStart(3)}  x${String(r.failures).padEnd(5)} ${r.signature.slice(0, 96)}`);
}

if (UPDATE) {
  writeFileSync(
    BASELINE,
    JSON.stringify(
      {
        $comment:
          'WEB-OPS-007 AC4. Known non-2xx responses to scheduled POSTs. This list must only ever SHRINK - ' +
          'each entry is a scheduled job whose target is answering with an error.',
        generated: new Date().toISOString().slice(0, 10),
        signatures: rows.map((r) => ({ status_code: r.status_code, signature: r.signature })),
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`[cron-http] baseline written: ${rows.length} signature(s).`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error(`[cron-http] ${BASELINE} is missing. Create it with --update.`);
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as {
  signatures: { status_code: number | null; signature: string }[];
};
const known = new Set(baseline.signatures.map((s) => `${s.status_code}|${s.signature}`));
const fresh = rows.filter((r) => !known.has(`${r.status_code}|${r.signature}`));

if (fresh.length > 0) {
  console.error('\n❌ A scheduled job is getting a NEW error back (WEB-OPS-007)\n');
  for (const r of fresh) {
    console.error(`  ${r.status_code ?? 'no status'} x${r.failures}, first seen ${r.first_seen}`);
    console.error(`      ${r.sample.slice(0, 220)}`);
  }
  console.error(
    '\ncron.job_run_details will show these jobs as SUCCEEDED - it records the enqueue,\n' +
      'not the response. Correlate first_seen against cron.job schedules to find which\n' +
      'job it is. Re-baseline with --update only once the cause is understood.\n',
  );
  process.exit(1);
}

const gone = baseline.signatures.filter(
  (s) => !rows.some((r) => `${r.status_code}|${r.signature}` === `${s.status_code}|${s.signature}`),
);
if (gone.length > 0) {
  console.log(`\n${gone.length} baselined failure(s) did not recur in this window - re-baseline to lock that in.`);
}

console.log('\nOK No scheduled job is getting an error it was not already getting.');
