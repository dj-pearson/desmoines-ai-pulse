#!/usr/bin/env node
/**
 * Refresh scripts/pseo-demand-routes.json (SEO-029).
 *
 *   node scripts/generate-pseo-demand-routes.mjs [--csv <Search Console Pages.csv> ...]
 *
 * WHAT THE FILE IS FOR. It is the list of pSEO pages Google has already shown
 * to searchers. Two consumers read it:
 *
 *   scripts/generate-dynamic-sitemaps.ts  submits every PUBLISHED path in it in
 *                                         sitemap-pseo.xml, alongside the
 *                                         shippable set from WEB-SEO-013
 *   scripts/prerender.mjs                 renders everything in sitemap-pseo.xml
 *                                         in an unbudgeted pass that fails the
 *                                         build when a page comes out as the
 *                                         homepage
 *
 * Measured 2026-09-30 as Googlebot: 74 of the 87 pSEO URLs in the Search Console
 * Pages export returned the homepage's <title> and H1. Every one of them had a
 * published pseo_pages row. They were not in sitemap-pseo.xml (the shippable
 * filter held it at 14), so the prerender never reached them and Cloudflare
 * served the SPA fallback, which is the prerendered homepage.
 *
 * WHY DEMAND AND NOT "EVERY PUBLISHED ROW". WEB-SEO-013 measured that 101 of the
 * 123 pages above the inventory floor list the same entities as another page,
 * and kept them out of the sitemap so we are not submitting doorway pages. That
 * reasoning still holds for pages nobody has found. It does not hold for a page
 * Google has already indexed and is ranking: leaving it out of the sitemap does
 * not un-index it, it only means the crawler keeps receiving our homepage at
 * that URL. A measured impression is the line.
 *
 * WHY A COMMITTED FILE. Same reason as prerender-priority.json: the build host
 * has the anon key, and gsc_page_performance is admin-only, so a build-time read
 * would quietly return [] and the pages would drop back out.
 *
 * SOURCES. gsc_page_performance over the trailing 365 days (Management API, the
 * same credential generate-prerender-priority.mjs uses), plus any Search Console
 * "Pages" CSV exports passed with --csv. The table and the export disagree at
 * the edges (the export carries rows the sync does not), so the larger of the
 * two figures is kept per path rather than their sum: they overlap in time.
 *
 * Only paths with a pseo_pages row are kept. Redirect sources in
 * public/_redirects are dropped (submitting a URL that 301s is the defect
 * check-sitemap-redirects exists to catch), and so is any slug another route
 * in App.tsx claims first (/restaurants/west-des-moines renders
 * RestaurantDetails, not the pSEO page), using the same classifier
 * pseoShippable.ts uses.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { classifySlugs } from './lib/pseoRouteClaims.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'scripts', 'pseo-demand-routes.json');
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'wtkhfqpmcegzcbngroui';
const WINDOW_DAYS = Number(process.env.PSEO_DEMAND_WINDOW_DAYS) || 365;

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

async function query(token, sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`Management API returned ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error('Management API returned a non-array');
  return rows;
}

const normPath = (p) => {
  const stripped = p.replace(/^https?:\/\/[^/]+/, '').split(/[?#]/)[0].replace(/\/+$/, '');
  return stripped === '' ? '/' : stripped;
};

// A path we will interpolate into SQL and write into a sitemap. Lower-case
// slug segments only; anything else is not a pSEO slug and is dropped.
const SAFE_PATH = /^(\/[a-z0-9-]+){1,2}$/;

function csvImpressions(file) {
  const out = new Map();
  const lines = readFileSync(file, 'utf8').split(/\r?\n/).slice(1);
  for (const line of lines) {
    const [url, , imp] = line.split(',');
    if (!url || !imp) continue;
    const n = Number(imp);
    if (!Number.isFinite(n) || n <= 0) continue;
    const p = normPath(url);
    if (!SAFE_PATH.test(p)) continue;
    out.set(p, Math.max(out.get(p) ?? 0, n));
  }
  return out;
}

const csvFiles = [];
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--csv' && process.argv[i + 1]) csvFiles.push(process.argv[++i]);
}

const token = readEnvToken();
if (!token) {
  console.error(
    '[pseo-demand] SUPABASE_ACCESS_TOKEN not found in the environment or .env. Nothing was written.',
  );
  process.exit(1);
}

const demand = new Map();
const gscRows = await query(
  token,
  `select rtrim(regexp_replace(page_url, '^https?://[^/]+', ''), '/') as p,
          sum(impressions)::int as imp
     from gsc_page_performance
    where date >= current_date - ${WINDOW_DAYS}
    group by 1
   having sum(impressions) > 0`,
);
for (const row of gscRows) {
  if (typeof row?.p !== 'string' || typeof row?.imp !== 'number') continue;
  const p = normPath(row.p);
  if (SAFE_PATH.test(p)) demand.set(p, Math.max(demand.get(p) ?? 0, row.imp));
}
for (const file of csvFiles) {
  for (const [p, n] of csvImpressions(file)) demand.set(p, Math.max(demand.get(p) ?? 0, n));
}

const candidates = [...demand.keys()];
if (candidates.length === 0) {
  console.error('[pseo-demand] no candidate paths from any source. Refusing to write an empty list.');
  process.exit(1);
}
// SAFE_PATH above is what makes this literal list safe to inline.
const literal = candidates.map((p) => `'${p}'`).join(',');
const rows = await query(
  token,
  `select slug, is_published from pseo_pages where slug in (${literal}) order by slug`,
);

const claims = classifySlugs(
  rows.map((r) => r.slug),
  { appPath: join(ROOT, 'src', 'App.tsx'), redirectsPath: join(ROOT, 'public', '_redirects') },
);
const redirected = new Set(claims.redirected);
const routes = {};
let unpublished = 0;
let dropped = 0;
for (const row of rows) {
  if (redirected.has(row.slug) || claims.claimed.has(row.slug)) {
    dropped++;
    continue;
  }
  if (!row.is_published) unpublished++;
  routes[row.slug] = { impressions: demand.get(row.slug), published: row.is_published === true };
}

const count = Object.keys(routes).length;
if (count === 0) {
  console.error('[pseo-demand] no measured path has a pseo_pages row. Refusing to write an empty list.');
  process.exit(1);
}

writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      $comment:
        'SEO-029. pSEO paths with measured Search Console impressions. Published ones are submitted in ' +
        'sitemap-pseo.xml and prerendered in an unbudgeted, fail-the-build pass. Regenerate with ' +
        'node scripts/generate-pseo-demand-routes.mjs [--csv Pages.csv]. Never edit by hand.',
      generatedAt: new Date().toISOString().slice(0, 10),
      windowDays: WINDOW_DAYS,
      sources: ['gsc_page_performance', ...csvFiles.map((f) => `csv:${f.split(/[\\/]/).slice(-2).join('/')}`)],
      routes,
    },
    null,
    2,
  )}\n`,
);

console.log(
  `[pseo-demand] wrote ${count} pSEO paths (${unpublished} unpublished; ${dropped} dropped as redirect sources or claimed by another route) to ${OUT}`,
);
