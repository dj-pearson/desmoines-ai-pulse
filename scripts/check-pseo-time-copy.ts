#!/usr/bin/env tsx
/**
 * SEO-056 gate: time-relative pSEO pages carry no copy from another season.
 *
 * /festivals/today was written on 2026-03-17 and said so 53 times (St.
 * Patrick's Day 23, spring 15, March 10); in October it was still in the
 * prerendered HTML. 118 of the 128 published time-relative rows had at least
 * one month, season, holiday or year outside their window. Nothing compared a
 * page's words to its own name.
 *
 * A word is stale when it names a month, season, holiday or year outside both
 * the next seven days and the page's own period (/festivals/august may say
 * August; /festivals/today may say neither March nor St. Patrick's). The rules
 * are staleTimeWords in src/pseo/timeRelative.ts.
 *
 * OFFLINE (always runs):
 *   - the detector still catches the March copy (negative control), so a
 *     regex that stops matching cannot pass everything;
 *   - the evergreen template, for every temporal page the taxonomy can make,
 *     produces no stale word on any day of the year;
 *   - every category the template describes is one CATEGORY_FILTERS filters,
 *     for the same table;
 *   - every hub duplicate in HUB_DUPLICATES has its 301 in public/_redirects
 *     and is out of public/sitemap-pseo.xml.
 *
 * ONLINE (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from the environment or
 * .env; skipped, loudly, without them or with --offline):
 *   - no published time-relative row has a stale word in its title, h1,
 *     description, keywords, sections or structured data;
 *   - no hub duplicate is still published.
 *
 * Usage: npx tsx scripts/check-pseo-time-copy.ts [--offline] [--today YYYY-MM-DD]
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { CATEGORY_FILTERS } from '../src/pseo/listingFilters';
import { audienceDimension, categoryDimension, contentTypeDimension, temporalDimension } from '../src/pseo/taxonomy';
import {
  allowedPeriod,
  buildTimeRelativePage,
  HUB_DUPLICATES,
  isTimeRelative,
  rowText,
  staleTimeWords,
  timeDimension,
  TIME_COPY_CATEGORIES,
} from '../src/pseo/timeRelative';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems: string[] = [];
const args = process.argv.slice(2);
const todayArg = args.includes('--today') ? args[args.indexOf('--today') + 1] : undefined;
const now = todayArg ? new Date(`${todayArg}T12:00:00`) : new Date();
if (Number.isNaN(now.getTime())) {
  console.error(`[pseo-time-copy] --today ${todayArg} is not a date`);
  process.exit(2);
}

// --- offline 1: negative control ---------------------------------------------
{
  const march = "March 17th in Des Moines means one thing: the city goes green for St. Patrick's Day and spring's arrival.";
  const hits = staleTimeWords(march, allowedPeriod('today', new Date(2026, 9, 1, 12)));
  const words = new Set(hits.map((h) => h.word));
  if (!words.has('March') || !words.has("St. Patrick's Day")) {
    problems.push(`detector self-test: the March copy should flag March and St. Patrick's Day on 2026-10-01, got [${[...words].join(', ')}]`);
  }
  if (staleTimeWords(march, allowedPeriod('today', new Date(2026, 2, 17, 12))).length !== 0) {
    problems.push('detector self-test: the March copy must be clean on 2026-03-17');
  }
}

// --- offline 2: the template is clean on every day of the year -------------
{
  const temporal = temporalDimension.values;
  const combos: Array<Array<{ dimension: string; slug: string; name: string }>> = [];
  for (const t of temporal) {
    const td = { dimension: 'temporal', slug: t.slug, name: t.name };
    for (const c of contentTypeDimension.values) combos.push([{ dimension: 'content_type', slug: c.slug, name: c.name }, td]);
    for (const c of categoryDimension.values) combos.push([{ dimension: 'category', slug: c.slug, name: c.name }, td]);
    for (const a of audienceDimension.values) combos.push([{ dimension: 'audience', slug: a.slug, name: a.name }, td]);
  }
  if (combos.length === 0) problems.push('the taxonomy produced no temporal combinations; the template check saw nothing');
  const days: Date[] = [];
  for (let m = 0; m < 12; m++) for (const d of [1, 15, 28]) days.push(new Date(2026, m, d, 12));
  let built = 0;
  const seen = new Set<string>();
  for (const dims of combos) {
    const page = buildTimeRelativePage(dims);
    if (!page) continue;
    built++;
    const text = rowText({ seo: page.seo, sections: page.sections, structured_data: { breadcrumb: page.breadcrumb, faqItems: page.faqs } });
    const slug = timeDimension(dims)?.slug ?? null;
    for (const day of days) {
      const hits = staleTimeWords(text, allowedPeriod(slug, day));
      if (hits.length) {
        const key = dims.map((d) => d.slug).join('/');
        if (!seen.has(key)) problems.push(`template /${key} on ${day.toDateString()}: ${hits.map((h) => h.word).join(', ')}`);
        seen.add(key);
      }
    }
  }
  if (built === 0) problems.push('buildTimeRelativePage built nothing for the taxonomy; the template check saw nothing');
}

// --- offline 3: categories the copy describes are the ones the query filters -
for (const [entity, slugs] of Object.entries(TIME_COPY_CATEGORIES)) {
  for (const slug of slugs) {
    const f = CATEGORY_FILTERS[slug];
    if (!f) problems.push(`timeRelative.ts describes category ${slug}, which CATEGORY_FILTERS does not filter`);
    else if (f.entity !== entity) problems.push(`timeRelative.ts describes ${slug} as ${entity}; CATEGORY_FILTERS lists it as ${f.entity}`);
  }
}

// --- offline 4: hub duplicates are redirected and out of the sitemap ---------
{
  const redirects = readFileSync(path.join(ROOT, 'public', '_redirects'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/));
  const sitemap = readFileSync(path.join(ROOT, 'public', 'sitemap-pseo.xml'), 'utf8');
  for (const [from, to] of Object.entries(HUB_DUPLICATES)) {
    if (!redirects.some(([s, t, code]) => s === from && t === to && code === '301')) {
      problems.push(`${from}: unpublished as a duplicate of ${to} but public/_redirects has no "${from}  ${to}  301"`);
    }
    if (sitemap.includes(`${from}</loc>`)) problems.push(`${from}: redirected to ${to} but still in public/sitemap-pseo.xml`);
  }
}

// --- online: the published rows ----------------------------------------------
function env(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = { ...process.env };
  try {
    for (const line of readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && out[m[1]] === undefined) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  } catch {
    // environment only
  }
  return out;
}

interface Row {
  slug: string;
  dimensions: Array<{ dimension: string; slug: string; name: string }> | null;
  seo: { title?: string; h1?: string; description?: string; keywords?: string[] } | null;
  sections: unknown;
  structured_data: unknown;
}

async function online(): Promise<string> {
  const E = env();
  const base = E.VITE_SUPABASE_URL;
  const key = E.VITE_SUPABASE_ANON_KEY;
  if (args.includes('--offline')) return 'online half skipped (--offline)';
  if (!base || !key) return 'online half SKIPPED: no VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, so published rows were not read';
  const res = await fetch(
    `${base.replace(/\/+$/, '')}/rest/v1/pseo_pages?select=slug,dimensions,seo,sections,structured_data&is_published=eq.true&order=slug&limit=1000`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!res.ok) throw new Error(`pseo_pages: HTTP ${res.status}`);
  const rows = (await res.json()) as Row[];
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('pseo_pages returned no published rows; refusing to report a clean surface');
  let checked = 0;
  for (const r of rows) {
    if (HUB_DUPLICATES[r.slug]) problems.push(`${r.slug}: still published; it duplicates ${HUB_DUPLICATES[r.slug]} and should be unpublished`);
    if (!isTimeRelative({ slug: r.slug, dimensions: r.dimensions })) continue;
    checked++;
    const hits = staleTimeWords(rowText(r), allowedPeriod(timeDimension(r.dimensions)?.slug ?? null, now));
    if (hits.length) {
      const counts = new Map<string, number>();
      for (const h of hits) counts.set(h.word, (counts.get(h.word) ?? 0) + 1);
      problems.push(
        `${r.slug}: ${hits.length} stale word(s): ${[...counts].map(([w, n]) => `${w} ${n}`).join(', ')}; ` +
          'rewrite with scripts/write-pseo-time-relative-pages.ts',
      );
    }
  }
  return `online: ${checked} published time-relative row(s) of ${rows.length} checked`;
}

online()
  .then((summary) => {
    console.log(`[pseo-time-copy] ${summary}; today ${now.toISOString().slice(0, 10)}`);
    if (problems.length) {
      console.error(`[pseo-time-copy] ${problems.length} problem(s):`);
      for (const p of problems) console.error(`  - ${p}`);
      process.exit(1);
    }
    console.log('[pseo-time-copy] OK');
  })
  .catch((err) => {
    console.error(`[pseo-time-copy] ${(err as Error).message}`);
    process.exit(1);
  });
