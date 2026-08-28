/**
 * Generate dynamic sitemaps for events, restaurants, attractions, playgrounds, articles, and guides.
 * Run before build to populate individual sitemap XML files.
 *
 * Requires: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
 * Optional: VITE_SITE_URL (defaults to https://desmoinesinsider.com)
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { computePseoShippable } from './lib/pseoShippable';
// Slug shapes live in one place so the freshness check cannot build a URL the
// generator would not have written. See scripts/lib/sitemapSlugs.ts.
import { createSlug, createEventSlug } from './lib/sitemapSlugs';

// Load .env for local development (Cloudflare Pages / Infisical set env vars at build time)
function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  try {
    const content = readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex <= 0) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key && !process.env[key]) process.env[key] = value;
    }
  } catch {
    // Ignore .env parse errors
  }
}
loadEnvFile(join(process.cwd(), '.env'));
loadEnvFile(join(process.cwd(), '.env.local'));


// Environment variables - no hardcoded secrets
// Support both VITE_* (frontend) and plain names (Infisical/server scripts)
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const baseUrl = process.env.VITE_SITE_URL || process.env.SITE_URL || 'https://desmoinesinsider.com';
const currentDate = new Date().toISOString().split('T')[0];

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing required env vars. Set one of:');
  console.error('   VITE_SUPABASE_URL or SUPABASE_URL');
  console.error('   VITE_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY');
  console.error('');
  console.error('For Infisical: npm run generate-sitemaps:infisical');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
}

/**
 * Collapses repeated <loc> values, keeping the first and its metadata.
 *
 * Two rows that slug to the same URL produced two identical <url> blocks.
 * Measured 2026-08-27 against production: sitemap-events carried 413 entries for
 * 397 distinct URLs and sitemap-playgrounds 69 for 67, and the live file has
 * been doing this for as long as the duplicate rows have existed. A URL listed
 * twice does not rank twice; it makes the file disagree with its own count and
 * advertises a duplication problem to the one audience most likely to act on it.
 *
 * DEDUPING HERE IS NOT A FIX FOR THE DUPLICATE ROWS and must not be mistaken for
 * one - see WEB-SEO-017 for the crawler-side cause and the 10 event groups still
 * awaiting a per-group merge. This stops the sitemap being a second, avoidable
 * symptom of them, and the collapsed count is logged every run precisely so
 * fixing it here does not make the underlying rows invisible.
 *
 * It lives in the single function every generator funnels through, so a sitemap
 * added later cannot reintroduce it.
 *
 * Keeping the FIRST occurrence is deliberate: callers order deliberately
 * (events by date desc, restaurants by name), so the first is the one the
 * generator meant to rank.
 *
 * THAT ARGUMENT NEEDS A TOTAL ORDER, which none of the six queries had. They
 * ordered by one column and stopped, so every tie was broken by whatever
 * Postgres happened to return - and ties are the normal case here, not the
 * edge: hundreds of events share a date, and two restaurants share the name
 * "Texas Roadhouse". So "the first occurrence" was not a stable choice, and
 * the checked-in sitemaps were rewritten on every single build with the same
 * URL set in a different sequence. Real changes were invisible in a diff of
 * several hundred reordered lines.
 *
 * Every query now carries .order('id') as a final tiebreaker. Ordering is not
 * significant to a crawler; determinism is significant to review. It also
 * pre-empts a sharper version of the same fault: PostgREST caps a response at
 * 1000 rows, and once events passes that, an ambiguous sort decides WHICH
 * events make the cut. That is membership churn with no data change. The
 * counts today are 397 events and 478 restaurants, so this is latent.
 */
function dedupeUrls(urls: SitemapUrl[], label: string): SitemapUrl[] {
  const seen = new Set<string>();
  const kept: SitemapUrl[] = [];
  const collapsed = new Map<string, number>();

  for (const url of urls) {
    if (seen.has(url.loc)) {
      collapsed.set(url.loc, (collapsed.get(url.loc) ?? 1) + 1);
      continue;
    }
    seen.add(url.loc);
    kept.push(url);
  }

  if (collapsed.size > 0) {
    const extra = [...collapsed.values()].reduce((n, c) => n + c - 1, 0);
    console.warn(
      `⚠️ ${label}: ${collapsed.size} URL(s) appeared more than once (${extra} extra entr(ies)) and were collapsed. ` +
        'These are duplicate ROWS, not a sitemap bug - see WEB-SEO-017.'
    );
    for (const [loc, count] of [...collapsed].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
      console.warn(`     x${count}  ${loc}`);
    }
  }

  return kept;
}

/**
 * Writes a sitemap and returns how many URLs actually landed in it.
 *
 * The count matters: every generator used to log `urls.length`, which is the
 * count BEFORE duplicates are collapsed, so sitemap-events reported 413 URLs
 * while writing 397. A number that describes the input rather than the output is
 * how a duplication problem stays invisible in a log people read every build.
 */
function writeSitemap(filename: string, urls: SitemapUrl[], label: string): number {
  const unique = dedupeUrls(urls, label);
  writeFileSync(join(process.cwd(), 'public', filename), renderSitemapXML(unique));
  return unique.length;
}

function renderSitemapXML(unique: SitemapUrl[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${unique.map(url => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${url.lastmod || currentDate}</lastmod>
    <changefreq>${url.changefreq || 'weekly'}</changefreq>
    <priority>${url.priority || '0.7'}</priority>
  </url>`).join('\n')}
</urlset>`;
}

async function generateEventsSitemap(): Promise<number | null> {
  console.log('📅 Generating events sitemap...');

  // Only submit events a searcher can still act on.
  //
  // This query previously had NO date filter, so the sitemap advertised every
  // event ever ingested: 744 of 1000 URLs (74%) were for events that had
  // already happened. Submitting expired pages burns crawl budget on content
  // that cannot rank and is a well-known contributor to the "discovered,
  // currently not indexed" state this project is trying to fix (PROD-SEO-001).
  //
  // The grace window keeps very recently finished events, which still get
  // searched for ("was X any good") and may hold fresh links, without
  // advertising a two-year backlog.
  const GRACE_DAYS = 7;
  const cutoff = new Date(Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  // PostgREST caps a single response at max-rows (1000 by default), so the old
  // `.limit(5000)` was silently truncated — the generator quietly dropped rows
  // and reported success. Page explicitly so the cap cannot hide data again.
  const PAGE = 1000;
  const eventList: Array<{ title: string; date: string | null; event_start_utc: string | null; updated_at: string | null }> = [];

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('events')
      .select('title, date, event_start_utc, updated_at')
      .gte('date', cutoff)
      .order('date', { ascending: false })
      .order('id')
      .range(from, from + PAGE - 1);

    if (error) {
      console.error('❌ Error fetching events:', error);
      return null;
    }

    const batch = data ?? [];
    eventList.push(...batch);
    if (batch.length < PAGE) break;

    // Sitemaps cap at 50,000 URLs; stop well short rather than emit an invalid file.
    if (eventList.length >= 45000) {
      console.warn(`⚠️ Event sitemap hit the 45,000 URL guard — output is truncated.`);
      break;
    }
  }

  console.log(`   ${eventList.length} event(s) dated on or after ${cutoff} (grace: ${GRACE_DAYS}d)`);

  if (eventList.length === 0) {
    console.warn('⚠️ No events found in database - check RLS policies or add events');
  }

  const urls = eventList.map(event => {
    const slug = createEventSlug(event.title, event);
    const lastmod = event.updated_at ? event.updated_at.split('T')[0] : currentDate;
    return {
      loc: `${baseUrl}/events/${slug}`,
      lastmod,
      changefreq: 'weekly',
      priority: '0.7'
    };
  });

  // Sitemap spec requires at least one <url> - include events index if empty
  if (urls.length === 0) {
    urls.push({
      loc: `${baseUrl}/events`,
      lastmod: currentDate,
      changefreq: 'daily',
      priority: '0.9'
    });
  }

  const written = writeSitemap('sitemap-events.xml', urls, 'events');
  console.log(`✅ Events sitemap generated: ${written} URLs`);
  return written;
}

async function generateRestaurantsSitemap(): Promise<number | null> {
  console.log('🍽️ Generating restaurants sitemap...');

  const { data: restaurants, error } = await supabase
    .from('restaurants')
    .select('name, slug, is_featured, updated_at')
    .order('name')
    .order('id')
    .limit(5000);

  if (error) {
    console.error('❌ Error fetching restaurants:', error);
    return null;
  }

  const urls = restaurants.map(restaurant => {
    const slug = restaurant.slug || createSlug(restaurant.name);
    const lastmod = restaurant.updated_at ? restaurant.updated_at.split('T')[0] : currentDate;
    const priority = restaurant.is_featured ? '0.8' : '0.6';
    return {
      loc: `${baseUrl}/restaurants/${slug}`,
      lastmod,
      changefreq: 'monthly',
      priority
    };
  });

  if (urls.length === 0) {
    urls.push({ loc: `${baseUrl}/restaurants`, lastmod: currentDate, changefreq: 'weekly', priority: '0.8' });
  }

  const written = writeSitemap('sitemap-restaurants.xml', urls, 'restaurants');
  console.log(`✅ Restaurants sitemap generated: ${written} URLs`);
  return written;
}

async function generateAttractionsSitemap(): Promise<number | null> {
  console.log('📍 Generating attractions sitemap...');

  const { data: attractions, error } = await supabase
    .from('attractions')
    .select('id, name, updated_at')
    .order('name')
    .order('id');

  if (error) {
    console.error('❌ Error fetching attractions:', error);
    return null;
  }

  const urls = attractions.map(attraction => {
    const slug = createSlug(attraction.name);
    const lastmod = attraction.updated_at ? attraction.updated_at.split('T')[0] : currentDate;
    return {
      loc: `${baseUrl}/attractions/${slug}`,
      lastmod,
      changefreq: 'monthly',
      priority: '0.7'
    };
  });

  if (urls.length === 0) {
    urls.push({ loc: `${baseUrl}/attractions`, lastmod: currentDate, changefreq: 'monthly', priority: '0.7' });
  }

  const written = writeSitemap('sitemap-attractions.xml', urls, 'attractions');
  console.log(`✅ Attractions sitemap generated: ${written} URLs`);
  return written;
}

async function generatePlaygroundsSitemap(): Promise<number | null> {
  console.log('🎮 Generating playgrounds sitemap...');

  const { data: playgrounds, error } = await supabase
    .from('playgrounds')
    .select('id, name, updated_at')
    .order('name')
    .order('id');

  if (error) {
    console.error('❌ Error fetching playgrounds:', error);
    return null;
  }

  const urls = playgrounds.map(playground => {
    const slug = createSlug(playground.name);
    const lastmod = playground.updated_at ? playground.updated_at.split('T')[0] : currentDate;
    return {
      loc: `${baseUrl}/playgrounds/${slug}`,
      lastmod,
      changefreq: 'monthly',
      priority: '0.6'
    };
  });

  if (urls.length === 0) {
    urls.push({ loc: `${baseUrl}/playgrounds`, lastmod: currentDate, changefreq: 'monthly', priority: '0.7' });
  }

  const written = writeSitemap('sitemap-playgrounds.xml', urls, 'playgrounds');
  console.log(`✅ Playgrounds sitemap generated: ${written} URLs`);
  return written;
}

async function generateArticlesSitemap(): Promise<number | null> {
  console.log('📰 Generating articles sitemap...');

  const { data: articles, error } = await supabase
    .from('articles')
    .select('id, slug, updated_at, created_at')
    .order('created_at', { ascending: false })
    .order('id');

  if (error) {
    console.error('❌ Error fetching articles:', error);
    return null;
  }

  const urls = articles.map(article => ({
    loc: `${baseUrl}/articles/${article.slug || article.id}`,
    lastmod: article.updated_at ? article.updated_at.split('T')[0] : currentDate,
    changefreq: 'weekly',
    priority: '0.8'
  }));

  if (urls.length === 0) {
    urls.push({ loc: `${baseUrl}/articles`, lastmod: currentDate, changefreq: 'weekly', priority: '0.8' });
  }

  const written = writeSitemap('sitemap-articles.xml', urls, 'articles');
  console.log(`✅ Articles sitemap generated: ${written} URLs`);
  return written;
}

/**
 * pSEO pages (WEB-SEO-013).
 *
 * src/pseo/ contains a complete programmatic-SEO system — taxonomy, ten page
 * types, a generation pipeline, two edge functions and live routes — and until
 * now no sitemap referenced a single page it produced, so nothing it generated
 * was discoverable except by typing the URL.
 *
 * `slug` in pseo_pages is the FULL pathname with a leading slash (see
 * fetchPseoPage in src/pseo/hooks/usePseoPage.ts), which is why it is
 * concatenated directly rather than prefixed with a route.
 */
async function generatePseoSitemap(): Promise<number | null> {
  console.log('🧩 Generating pSEO sitemap...');

  const target = join(process.cwd(), 'public', 'sitemap-pseo.xml');

  // IT SOURCES THE SHIPPABLE SET, NOT is_published.
  //
  // This used to select every published row above a 0.6 quality_score, capped
  // at 300, and the comment here said the inventory gate belonged where pages
  // are published because "the sitemap step cannot re-count live inventory per
  // page without N queries". The N queries turned out to cost 19 seconds for
  // 244 pages, which is nothing against a two-minute build, and the gate never
  // arrived at the publish step - so the 244 URLs shipped.
  //
  // Measured 2026-08-27: of those 244, 123 clear AC5's inventory floor and 101
  // of THOSE render a listing identical to another passing page's. Submitting
  // them is the doorway pattern by the ordinary definition, several URLs
  // rendering the same content to catch different queries, and a sitemap is a
  // stronger signal to Google than leaving a page merely reachable.
  //
  // quality_score is gone from the selection rather than kept alongside. It
  // scores the generated PROSE; the floor counts the ENTITIES the page lists.
  // A page can be well-written about nothing, and that is the failure mode here.
  //
  // The 300-URL cap is gone with it. It was capping a number that does not
  // exist - the shippable set is 22 - and AC6's batching now has room to raise
  // real pages into it rather than to hold back duplicates.
  let shippable: Awaited<ReturnType<typeof computePseoShippable>>;
  try {
    shippable = await computePseoShippable({
      base: SUPABASE_URL,
      key: SUPABASE_KEY,
      now: new Date(),
    });
  } catch (error) {
    console.error('❌ Error computing the shippable pSEO set:', error);
    // Same reasoning as the guides generator: never leave a stale file behind,
    // because that looks like success. Write nothing-but-valid instead.
    writeSitemap(
      'sitemap-pseo.xml',
      [{ loc: `${baseUrl}/things-to-do`, lastmod: currentDate, changefreq: 'weekly', priority: '0.6' }],
      'pseo',
    );
    console.warn('⚠️ pSEO sitemap fell back to the hub URL only.');
    return null;
  }

  // A PAGE WHOSE QUERY FAILED READS AS rendered 0, which is indistinguishable
  // from a page with no inventory - so a transient network fault would silently
  // shrink the sitemap and look exactly like a clean run. Keep the last good
  // file instead. This is not the stale-file case the fallback above guards
  // against: there the measurement is absent, here it is known to be partial.
  if (shippable.errors > 0) {
    console.warn(
      `⚠️ ${shippable.errors} pSEO listing quer${shippable.errors === 1 ? 'y' : 'ies'} failed, so the shippable set is understated. ` +
        'Keeping the existing sitemap-pseo.xml rather than publishing a shrunken one.'
    );
    return null;
  }

  const published = shippable.results.length;
  const bySlug = new Map(shippable.pages.map((p: { slug: string }) => [p.slug, p]));
  const excluded = published - shippable.canonical.length;

  // Never truncate silently — a filtered sitemap that reports only its own size
  // reads as full coverage.
  if (excluded > 0) {
    console.warn(
      `⚠️ ${excluded} published pSEO page(s) excluded: below AC5's inventory floor, ` +
        `or a duplicate of another URL's listing (${shippable.shadowed.length} duplicates). ` +
        'Run `npm run check-pseo-inventory` for the per-page verdict.'
    );
  }

  if (shippable.temporalOnlyByClaim.length > 0) {
    console.warn(
      `⚠️ ${shippable.temporalOnlyByClaim.length} listing(s) are submitted under a SEASONAL url because their ` +
        'evergreen one is claimed by an entity-detail route (e.g. /asian/fall, because /restaurants/asian ' +
        'resolves to RestaurantDetails). WEB-SEO-013 AC7 - decide who owns /<content-type>/<category>.'
    );
  }

  const urls = shippable.canonical.map((slug: string) => {
    const page = bySlug.get(slug) as { updated_at?: string; published_at?: string } | undefined;
    return {
      loc: `${baseUrl}${slug.startsWith('/') ? slug : `/${slug}`}`,
      lastmod: (page?.updated_at || page?.published_at || currentDate).split('T')[0],
      changefreq: 'weekly',
      priority: '0.6'
    };
  });

  if (urls.length === 0) {
    urls.push({ loc: `${baseUrl}/things-to-do`, lastmod: currentDate, changefreq: 'weekly', priority: '0.6' });
  }

  const written = writeSitemap('sitemap-pseo.xml', urls, 'pseo');
  console.log(`✅ pSEO sitemap generated: ${written} URLs (of ${published} published)`);
  return written;
}

async function generateGuidesSitemap(): Promise<number | null> {
  console.log('📖 Generating guides sitemap...');

  // WEB-SEO-003: this queried `public.guides`, which does not exist (42P01).
  // Every run logged the error and returned null BEFORE writing, so the
  // committed public/sitemap-guides.xml survived untouched from the day it was
  // added and has been handed to Google ever since as if it were current.
  //
  // The real table is `seasonal_guides`, which is what /guides/:slug reads via
  // useSeasonalGuide (App.tsx:471 -> SeasonalGuide.tsx). Only published rows
  // belong in a sitemap.
  const { data: guides, error } = await supabase
    .from('seasonal_guides')
    .select('id, slug, title, updated_at, is_published')
    .eq('is_published', true)
    .order('title')
    .order('id');

  if (error) {
    console.error('❌ Error fetching guides:', error);
    // Do NOT return early. Returning before the write is what let a stale file
    // ship silently for months — the worst of the available options, because it
    // looks like success. Write a valid sitemap containing just the hub so the
    // output always reflects this run.
    writeSitemap(
      'sitemap-guides.xml',
      [{ loc: `${baseUrl}/guides`, lastmod: currentDate, changefreq: 'monthly', priority: '0.7' }],
      'guides',
    );
    console.warn('⚠️ Guides sitemap fell back to the hub URL only — stale entries have been cleared.');
    return null;
  }

  // The /guides hub goes in FIRST, always. It was only being added on the
  // empty and error paths, so the moment a single published guide existed the
  // hub dropped out of the sitemap — and the hub is the one URL here that is
  // actually prerendered (it is in PRERENDER_ROUTES; /guides/:slug is not).
  // Measured 2026-08-11: /guides returns its own 106 KB document with the title
  // "Des Moines Local Guides", while every /guides/:slug returns the same
  // 173,953-byte prerendered HOMEPAGE to a JS-less crawler. So the generator
  // was submitting only the URLs that serve homepage content and omitting the
  // one that serves its own. WEB-SEO-003.
  const urls = [
    { loc: `${baseUrl}/guides`, lastmod: currentDate, changefreq: 'monthly', priority: '0.8' },
    ...(guides ?? []).map(guide => ({
      loc: `${baseUrl}/guides/${guide.slug || guide.id}`,
      lastmod: guide.updated_at ? guide.updated_at.split('T')[0] : currentDate,
      changefreq: 'monthly',
      priority: '0.7'
    })),
  ];

  const written = writeSitemap('sitemap-guides.xml', urls, 'guides');
  console.log(`✅ Guides sitemap generated: ${written} URLs`);
  return written;
}

async function main(): Promise<void> {
  console.log('🚀 Starting dynamic sitemap generation...\n');
  console.log(`📅 Date: ${currentDate}`);
  console.log(`🌐 Base URL: ${baseUrl}\n`);

  try {
    const results = await Promise.all([
      generateEventsSitemap(),
      generateRestaurantsSitemap(),
      generateAttractionsSitemap(),
      generatePlaygroundsSitemap(),
      generateArticlesSitemap(),
      generateGuidesSitemap(),
      generatePseoSitemap()
    ]);

    const totalUrls = results.filter((r): r is number => r !== null).reduce((sum, count) => sum + count, 0);

    // Update sitemap.xml index lastmod date
    const sitemapIndexPath = join(process.cwd(), 'public', 'sitemap.xml');
    const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${baseUrl}/sitemap-static.xml</loc>
    <lastmod>${currentDate}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${baseUrl}/sitemap-events.xml</loc>
    <lastmod>${currentDate}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${baseUrl}/sitemap-restaurants.xml</loc>
    <lastmod>${currentDate}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${baseUrl}/sitemap-attractions.xml</loc>
    <lastmod>${currentDate}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${baseUrl}/sitemap-playgrounds.xml</loc>
    <lastmod>${currentDate}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${baseUrl}/sitemap-articles.xml</loc>
    <lastmod>${currentDate}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${baseUrl}/sitemap-guides.xml</loc>
    <lastmod>${currentDate}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${baseUrl}/sitemap-pseo.xml</loc>
    <lastmod>${currentDate}</lastmod>
  </sitemap>
</sitemapindex>`;
    writeFileSync(sitemapIndexPath, sitemapIndex);

    console.log('\n' + '='.repeat(50));
    console.log('✨ Dynamic sitemap generation complete!');
    console.log(`📊 Total URLs generated: ${totalUrls}`);
    console.log('='.repeat(50));
  } catch (error) {
    console.error('❌ Error generating sitemaps:', error);
    process.exit(1);
  }
}

main();
