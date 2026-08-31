#!/usr/bin/env node
/**
 * Refresh scripts/prerender-priority.json from Search Console data (SEO-027 AC7).
 *
 *   node scripts/generate-prerender-priority.mjs
 *
 * WHY A COMMITTED FILE RATHER THAN A QUERY AT BUILD TIME. prerender.mjs runs on
 * the Cloudflare Pages build host, which has the anon key and nothing else, and
 * gsc_page_performance is `FOR ALL USING (is_admin())` - anon reads it as []. It
 * would not fail, it would silently produce an EMPTY ranking and fall back to
 * alphabetical order, which is the defect SEO-027 exists to fix and it would be
 * invisible. A committed artifact cannot degrade quietly: it is either in the
 * repo or the build says so.
 *
 * It also keeps the build offline-deterministic. Two builds of one tree must
 * choose the same pages, or check-entity-coverage is policing network weather.
 *
 * CREDENTIALS. Reads SUPABASE_ACCESS_TOKEN from .env and goes through the
 * Supabase Management API, which runs as `postgres` and so is not subject to the
 * is_admin() policy above. That is the same path the SEO-023 work used; a
 * service-role key is not needed and is deliberately not read here.
 *
 * STALENESS IS SAFE, not silent. The ranking decides render ORDER only - never
 * which URLs exist, which is always the sitemaps. A file that is months old
 * ranks by months-old impressions, which is still far better than ranking by the
 * first letter of a slug. Re-run it after a Search Console sync; the header the
 * file carries says when it was last measured.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'scripts', 'prerender-priority.json');
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'wtkhfqpmcegzcbngroui';
const WINDOW_DAYS = Number(process.env.PRERENDER_PRIORITY_WINDOW_DAYS) || 365;

function readEnvToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;
  const envFile = join(ROOT, '.env');
  if (!existsSync(envFile)) return null;
  const line = readFileSync(envFile, 'utf8')
    .split('\n')
    .find((l) => l.startsWith('SUPABASE_ACCESS_TOKEN='));
  if (!line) return null;
  return line.slice('SUPABASE_ACCESS_TOKEN='.length).trim().replace(/^['"]|['"]$/g, '');
}

const token = readEnvToken();
if (!token) {
  console.error(
    '[prerender-priority] SUPABASE_ACCESS_TOKEN not found in the environment or .env.\n' +
      '  It is needed to read gsc_page_performance, which anon sees as [] behind is_admin().\n' +
      '  Nothing was written; the existing ranking is left in place.',
  );
  process.exit(1);
}

// rtrim the trailing slash so the key matches a sitemap <loc> pathname. Google
// reports /restaurants/ and /restaurants as separate rows and both are this site.
const SQL = `
  select rtrim(regexp_replace(page_url, '^https?://[^/]+', ''), '/') as p,
         sum(impressions)::int as imp
    from gsc_page_performance
   where date >= current_date - ${WINDOW_DAYS}
   group by 1
  having sum(impressions) > 0
   order by imp desc
`;

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: SQL }),
});
if (!res.ok) {
  console.error(`[prerender-priority] Management API returned ${res.status}: ${await res.text()}`);
  process.exit(1);
}
const rows = await res.json();
if (!Array.isArray(rows) || rows.length === 0) {
  // Refuse to overwrite a good ranking with an empty one. An empty result means
  // the sync stopped running, not that the site stopped earning impressions.
  console.error(
    `[prerender-priority] the query returned ${Array.isArray(rows) ? 0 : 'a non-array'}. ` +
      'Refusing to overwrite the committed ranking with an empty one - check that the ' +
      'gsc-sync-daily cron is applied and running (SEO-023).',
  );
  process.exit(1);
}

// Validate before this reaches the filesystem. The rows are our own database
// read over an authenticated channel, so this is not expected to reject
// anything - but the output is a committed artifact that prerender-order.mjs
// trusts, and an unchecked key here would be written verbatim. Anything that is
// not a rooted path with a finite non-negative count is dropped and counted.
const impressions = {};
let rejected = 0;
for (const row of rows) {
  const path = row?.p === '' ? '/' : row?.p;
  const imp = row?.imp;
  if (typeof path !== 'string' || !path.startsWith('/') || path.includes('\n')) {
    rejected += 1;
    continue;
  }
  if (typeof imp !== 'number' || !Number.isFinite(imp) || imp < 0) {
    rejected += 1;
    continue;
  }
  impressions[path] = imp;
}

if (rejected > 0) {
  console.warn(`[prerender-priority] dropped ${rejected} row(s) that were not a rooted path with a finite count.`);
}

if (Object.keys(impressions).length === 0) {
  console.error(
    '[prerender-priority] every row was rejected by validation. Refusing to overwrite ' +
      'the committed ranking with an empty one.',
  );
  process.exit(1);
}

writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      $comment:
        'SEO-027. Measured Search Console impressions per path, used ONLY to order the entity ' +
        'prerender pass (scripts/prerender-order.mjs). Regenerate with ' +
        'node scripts/generate-prerender-priority.mjs. Never edit by hand.',
      generatedAt: new Date().toISOString().slice(0, 10),
      windowDays: WINDOW_DAYS,
      source: 'gsc_page_performance',
      paths: Object.keys(impressions).length,
      totalImpressions: Object.values(impressions).reduce((a, b) => a + b, 0),
      impressions,
    },
    null,
    2,
  )}\n`,
);

console.log(
  `[prerender-priority] wrote ${Object.keys(impressions).length} paths ` +
    `(${Object.values(impressions).reduce((a, b) => a + b, 0)} impressions over ${WINDOW_DAYS} days) to ${OUT}`,
);
