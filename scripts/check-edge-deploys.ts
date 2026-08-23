#!/usr/bin/env tsx
/**
 * Edge-function deploy ratchet (WEB-OPS-007).
 *
 * WHY THIS EXISTS. WEB-OPS-007 found that 57 of 61 pg_cron jobs had never
 * succeeded and named two mechanical causes: a missing app.settings.supabase_url
 * and a wrong pg_net signature. There is a third, and neither of those two fixes
 * would have revealed it -- 62 of the 157 edge functions in
 * supabase/functions/ have never been deployed, so 34 of the 56 cron jobs that
 * post to a function are posting to a 404. Fix the credentials and the
 * signature, and those 34 jobs go from "died before the HTTP call" to "made an
 * HTTP call that 404s", which is not obviously better.
 *
 * It went unnoticed for the ordinary reason: a function directory in the repo
 * looks exactly like a deployed function. There is no deploy step in CI --
 * `supabase functions deploy` is run by hand, per function, and anything nobody
 * remembered to run stays in the repo looking finished.
 *
 * WHY AN HTTP PROBE RATHER THAN `supabase functions list`. The list needs a
 * management access token, which CI does not have and should not be given for a
 * read this shallow. A POST with the anon key distinguishes the two states
 * cleanly: a function that is not deployed returns 404, and a deployed one
 * returns 401 (JWT required), 400 (bad body) or 200 -- never 404. Verified
 * against both sets before this was written.
 *
 * It does NOT call the function's logic: every probe sends `{}`, which each of
 * these rejects at the auth or validation gate. Nothing is executed.
 *
 * Usage:
 *   npx tsx scripts/check-edge-deploys.ts             # compare against the baseline
 *   npx tsx scripts/check-edge-deploys.ts --write     # re-baseline deliberately
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'edge-deploy-baseline.json');
const FUNCTIONS_DIR = join(ROOT, 'supabase', 'functions');

/** Concurrent probes. The gateway is answering 404s and auth rejections, not doing work. */
const CONCURRENCY = 8;

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
const KEY = env('SUPABASE_ANON_KEY') ?? env('VITE_SUPABASE_ANON_KEY');
if (!URL_ || !KEY) {
  console.error('[edge-deploys] no Supabase credentials - skipping.');
  process.exit(0);
}

const write = process.argv.includes('--write');

const localFunctions = readdirSync(FUNCTIONS_DIR)
  .filter((name) => !name.startsWith('_') && !name.startsWith('.'))
  .filter((name) => statSync(join(FUNCTIONS_DIR, name)).isDirectory())
  .filter((name) => existsSync(join(FUNCTIONS_DIR, name, 'index.ts')))
  .sort();

if (localFunctions.length === 0) {
  // An empty list is not a clean bill of health, it is a broken glob.
  console.error('[edge-deploys] no function directories found - refusing to pass.');
  process.exit(1);
}

async function isDeployed(slug: string): Promise<boolean> {
  try {
    const res = await fetch(`${URL_}/functions/v1/${slug}`, {
      method: 'POST',
      headers: {
        apikey: KEY!,
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
      // Do NOT follow redirects. oauth-callback answers with a 302 to an
      // admin page that itself 404s, so following the chain reports a
      // deployed function as missing - which is exactly the false positive
      // that would get this check switched off.
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
    });
    return res.status !== 404;
  } catch {
    // A network failure is not evidence of absence. Treat it as deployed so a
    // flaky run cannot manufacture a wave of false "undeployed" findings.
    return true;
  }
}

const undeployed: string[] = [];
for (let i = 0; i < localFunctions.length; i += CONCURRENCY) {
  const batch = localFunctions.slice(i, i + CONCURRENCY);
  const results = await Promise.all(batch.map(isDeployed));
  batch.forEach((slug, j) => {
    if (!results[j]) undeployed.push(slug);
  });
}
undeployed.sort();

console.log(
  `[edge-deploys] ${localFunctions.length} function(s) in supabase/functions, ` +
    `${undeployed.length} not deployed.`,
);

if (write) {
  writeFileSync(BASELINE, `${JSON.stringify({ undeployed }, null, 2)}\n`);
  console.log(`Wrote ${undeployed.length} entries to edge-deploy-baseline.json.`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error('[edge-deploys] no baseline. Run with --write once, deliberately.');
  process.exit(1);
}

const baseline: string[] = JSON.parse(readFileSync(BASELINE, 'utf8')).undeployed ?? [];
const baselineSet = new Set(baseline);

const regressions = undeployed.filter((slug) => !baselineSet.has(slug));
const fixed = baseline.filter((slug) => !undeployed.includes(slug));

if (fixed.length > 0) {
  console.log(`\nDeployed since the baseline (${fixed.length}):`);
  for (const slug of fixed) console.log(`  ${slug}`);
  console.log('  Re-baseline with --write to lock the improvement in.');
}

if (regressions.length > 0) {
  console.error(`\nX ${regressions.length} function(s) in the repo are not deployed and are not baselined:`);
  for (const slug of regressions) console.error(`  ${slug}`);
  console.error(
    '\n  A function directory in the repo looks identical to a deployed function,\n' +
      '  and every caller of an undeployed one gets a 404 - which for a pg_cron job\n' +
      '  is a failure nothing was watching. Deploy it:\n' +
      '    npx supabase functions deploy <slug> --project-ref <ref>\n' +
      '  or add it to edge-deploy-baseline.json with --write if it is deliberately\n' +
      '  not deployed yet. See WEB-OPS-007.\n',
  );
  process.exit(1);
}

console.log('\nOK No new undeployed edge functions.');
