#!/usr/bin/env node
/**
 * WEB-SEO-011 - how far behind the database the live sitemaps are.
 *
 * Sitemaps are generated inside `npm run build`, which Cloudflare Pages runs on
 * push to main. Nothing else regenerates them: the pg_cron job that would
 * (regenerate-sitemaps-event-driven) has never succeeded, and sitemap_change_queue
 * has been growing since July. So the freshness of every sitemap is currently a
 * side effect of how often someone pushes, and AC2's failure - "a week with no
 * deploy is a week of stale sitemaps on an events site" - is real and completely
 * invisible.
 *
 * THE HEADLINE NUMBER IS THE INGEST-TO-DISCOVERABLE GAP: events that are in the
 * database and not in the live sitemap, and how long the oldest of them has been
 * waiting. That is AC7's "median days from event ingest to indexed URL" measured
 * one step earlier, at the step this project actually controls, and unlike the
 * GSC version it needs no OAuth grant and no 16-month window.
 *
 * IT REPORTS AND NEVER GATES. Exit code is always 0, like check-pseo-inventory.
 * A sitemap lagging the database is a production-data condition, not a code
 * defect: during a quiet week it is EXPECTED, and a check that goes red for
 * expected behaviour is the permanently-red trap this repo has already switched
 * two lanes off for (WEB-CI-020, WEB-CI-021). It belongs in the nightly audit,
 * where a number that moves is the point.
 *
 * WHY IT DOES NOT SIMPLY COMPARE lastmod TO THE LAST DEPLOY. That was the first
 * design and it is wrong. Measured 2026-08-27: sitemap-events and
 * sitemap-restaurants both carry a newest lastmod of the deploy date, and
 * sitemap-pseo carries 2026-03-18 - five months back - because pseo_pages rows
 * genuinely have not changed since March. An old lastmod on a file whose content
 * is old is correct, so the rule would fire on the one sitemap that is behaving.
 * lastmod is reported here as information and carries no verdict.
 *
 * Slug construction is imported from scripts/lib/sitemapSlugs.ts, the same
 * module the generator uses. Building URLs differently from the generator would
 * make every event look missing and report a catastrophic gap on a current file.
 *
 * Needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. Optional VITE_SITE_URL.
 *
 *   npx tsx scripts/check-sitemap-freshness.ts
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createEventSlug } from './lib/sitemapSlugs';

/** Matches GRACE_DAYS in generate-dynamic-sitemaps.ts. */
const GRACE_DAYS = 7;
const PAGE = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  try {
    for (const line of readFileSync(path, 'utf8').replace(/\r\n/g, '\n').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key && !process.env[key]) process.env[key] = value;
    }
  } catch {
    /* ignore */
  }
}
loadEnvFile('.env');
loadEnvFile('.env.local');

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const SITE = (process.env.VITE_SITE_URL || process.env.SITE_URL || 'https://desmoinesinsider.com').replace(/\/+$/, '');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('check-sitemap-freshness: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required.');
  process.exit(1);
}

const HEADERS = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

async function fetchAllEvents(cutoff: string) {
  const rows: Array<{ title: string; date: string | null; event_start_utc: string | null; created_at: string | null }> = [];
  for (let offset = 0; ; offset += PAGE) {
    const url =
      `${SUPABASE_URL}/rest/v1/events?select=title,date,event_start_utc,created_at` +
      `&date=gte.${cutoff}&order=date.desc&limit=${PAGE}&offset=${offset}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`events: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    const page = await res.json();
    if (!Array.isArray(page)) throw new Error(`events: ${JSON.stringify(page).slice(0, 200)}`);
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

async function fetchSitemap(name: string) {
  const res = await fetch(`${SITE}/${name}`, { headers: { 'User-Agent': 'DesMoinesInsiderFreshnessCheck/1.0' } });
  if (!res.ok) return { ok: false as const, status: res.status, locs: [] as string[], lastmods: [] as string[] };
  const xml = await res.text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  const lastmods = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1].trim());
  return { ok: true as const, status: res.status, locs, lastmods };
}

/**
 * Cloudflare Pages builds on push to main, so the last commit there is the best
 * available proxy for "when were these files last regenerated". Best-effort:
 * a shallow CI clone may not have it, and that is reported rather than guessed.
 */
function lastDeployIso(): string | null {
  for (const ref of ['origin/main', 'main']) {
    try {
      return execFileSync('git', ['log', '-1', '--format=%cI', ref], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      /* try the next ref */
    }
  }
  return null;
}

const daysBetween = (from: string, to: number) => Math.floor((to - Date.parse(from)) / DAY_MS);

async function main() {
  const now = Date.now();
  const cutoff = new Date(now - GRACE_DAYS * DAY_MS).toISOString().split('T')[0];

  const [events, eventsSitemap] = await Promise.all([fetchAllEvents(cutoff), fetchSitemap('sitemap-events.xml')]);

  console.log(`[sitemap-freshness] ${SITE} against ${events.length} event(s) dated on or after ${cutoff}.`);

  if (!eventsSitemap.ok) {
    console.log(`\n⚠️ ${SITE}/sitemap-events.xml returned HTTP ${eventsSitemap.status}. Nothing to compare.`);
    return;
  }

  const livePaths = eventsSitemap.locs.map((l) => l.replace(/^https?:\/\/[^/]+/, ''));
  const live = new Set(livePaths);
  const expected = events.map((e) => ({ ...e, path: `/events/${createEventSlug(e.title, e)}` }));

  // Two events sharing a title, a date and a venue produce ONE slug, so a
  // duplicate row becomes a repeated <loc>. Counted separately from the gap
  // because it has a different cause and a different owner: the duplicates come
  // from the crawler (WEB-SEO-017), the sitemap just faithfully reprints them.
  const liveDuplicates = [...new Map(
    livePaths
      .filter((p, i) => livePaths.indexOf(p) !== i)
      .map((p) => [p, livePaths.filter((q) => q === p).length]),
  ).entries()].sort((a, b) => b[1] - a[1]);

  const missing = expected.filter((e) => !live.has(e.path));
  const expectedPaths = new Set(expected.map((e) => e.path));
  const orphaned = [...live].filter((p) => p.startsWith('/events/') && !expectedPaths.has(p));

  console.log(
    `[sitemap-freshness] live sitemap has ${eventsSitemap.locs.length} <loc> entr(ies), ${live.size} distinct; ` +
      `today's data would produce ${expectedPaths.size} distinct from ${events.length} row(s).`,
  );

  if (liveDuplicates.length) {
    const extra = liveDuplicates.reduce((n, [, count]) => n + count - 1, 0);
    console.log(`
REPEATED IN THE LIVE SITEMAP  (${liveDuplicates.length} URL(s), ${extra} extra entr(ies))`);
    console.log('  Duplicate event rows, not a sitemap bug - see WEB-SEO-017. Submitting a URL twice');
    console.log('  does not help it rank and makes the file disagree with its own URL count.');
    for (const [path, count] of liveDuplicates.slice(0, 5)) console.log(`  x${count}  ${path}`);
    if (liveDuplicates.length > 5) console.log(`  ... and ${liveDuplicates.length - 5} more`);
  }

  // THE NUMBER THIS SCRIPT EXISTS FOR.
  console.log(`\nINGESTED, NOT YET DISCOVERABLE  (${missing.length})`);
  if (missing.length === 0) {
    console.log('  Every event in the window is in the live sitemap.');
  } else {
    const withAge = missing
      .filter((e) => e.created_at)
      .map((e) => ({ ...e, age: daysBetween(e.created_at as string, now) }))
      .sort((a, b) => b.age - a.age);
    const oldest = withAge[0];
    if (oldest) {
      const median = withAge[Math.floor(withAge.length / 2)];
      console.log(`  oldest ingested ${oldest.age} day(s) ago, median ${median.age} day(s). AC7 targets under 3.`);
    }
    for (const e of (withAge.length ? withAge : missing).slice(0, 10)) {
      const age = 'age' in e ? `${(e as { age: number }).age}d` : '?';
      console.log(`  ${String(age).padStart(4)}  ${e.path}`);
    }
    if (missing.length > 10) console.log(`  ... and ${missing.length - 10} more`);
  }

  // The other direction, and it is not symmetric: an expired URL burns crawl
  // budget on a page that cannot rank, which is the defect GRACE_DAYS exists to
  // bound. A handful is the grace window working; hundreds is a stale file.
  console.log(`\nADVERTISED, NO LONGER IN THE WINDOW  (${orphaned.length})`);
  if (orphaned.length) {
    for (const p of orphaned.slice(0, 5)) console.log(`  ${p}`);
    if (orphaned.length > 5) console.log(`  ... and ${orphaned.length - 5} more`);
  } else {
    console.log('  Nothing advertised that today\'s data would not produce.');
  }

  // Information only - see the header on why lastmod carries no verdict here.
  const deploy = lastDeployIso();
  console.log('\nNEWEST lastmod PER SITEMAP  (information; an old lastmod on unchanged content is correct)');
  for (const name of ['sitemap-events.xml', 'sitemap-restaurants.xml', 'sitemap-pseo.xml', 'sitemap-articles.xml']) {
    const sm = await fetchSitemap(name);
    if (!sm.ok) {
      console.log(`  ${name.padEnd(26)} HTTP ${sm.status}`);
      continue;
    }
    const newest = sm.lastmods.sort().pop() ?? '(none)';
    console.log(`  ${name.padEnd(26)} ${newest}   ${sm.locs.length} URL(s)`);
  }
  console.log(
    `  last deploy (last commit on main): ${deploy ?? 'unavailable - shallow clone?'}` +
      (deploy ? `, ${daysBetween(deploy, now)} day(s) ago` : ''),
  );

  console.log(
    `\n[sitemap-freshness] ${missing.length} event(s) ingested and not yet advertised, ` +
      `${orphaned.length} advertised past the ${GRACE_DAYS}-day window, ` +
      `${liveDuplicates.length} URL(s) repeated. Reported, not gated.`,
  );
}

main().catch((err) => {
  // A reporting job must not fail the nightly on a network blip, but it must not
  // pass silently either - a run that printed nothing would read as "no gap".
  console.error(`[sitemap-freshness] could not complete: ${String(err.message ?? err).slice(0, 300)}`);
  process.exit(0);
});
