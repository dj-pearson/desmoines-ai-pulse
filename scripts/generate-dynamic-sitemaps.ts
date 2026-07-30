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
import { toZonedTime } from 'date-fns-tz';
import { parseISO } from 'date-fns';

const CENTRAL_TIMEZONE = 'America/Chicago';

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

function createSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Create event slug matching app's createEventSlugWithCentralTime (Central Time)
 */
function createEventSlug(title: string, event?: { date?: string; event_start_utc?: string }): string {
  const titleSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  if (!event) return titleSlug;
  try {
    const dateToUse = event.event_start_utc || event.date;
    if (!dateToUse) return titleSlug;
    const dateObj = typeof dateToUse === 'string' ? parseISO(dateToUse) : dateToUse;
    const centralDate = toZonedTime(dateObj, CENTRAL_TIMEZONE);
    const year = centralDate.getFullYear();
    const month = String(centralDate.getMonth() + 1).padStart(2, '0');
    const day = String(centralDate.getDate()).padStart(2, '0');
    return `${titleSlug}-${year}-${month}-${day}`;
  } catch {
    return titleSlug;
  }
}

function generateSitemapXML(urls: SitemapUrl[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `  <url>
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

  const xml = generateSitemapXML(urls);
  writeFileSync(join(process.cwd(), 'public', 'sitemap-events.xml'), xml);
  console.log(`✅ Events sitemap generated: ${urls.length} URLs`);
  return urls.length;
}

async function generateRestaurantsSitemap(): Promise<number | null> {
  console.log('🍽️ Generating restaurants sitemap...');

  const { data: restaurants, error } = await supabase
    .from('restaurants')
    .select('name, slug, is_featured, updated_at')
    .order('name')
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

  const xml = generateSitemapXML(urls);
  writeFileSync(join(process.cwd(), 'public', 'sitemap-restaurants.xml'), xml);
  console.log(`✅ Restaurants sitemap generated: ${urls.length} URLs`);
  return urls.length;
}

async function generateAttractionsSitemap(): Promise<number | null> {
  console.log('📍 Generating attractions sitemap...');

  const { data: attractions, error } = await supabase
    .from('attractions')
    .select('id, name, updated_at')
    .order('name');

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

  const xml = generateSitemapXML(urls);
  writeFileSync(join(process.cwd(), 'public', 'sitemap-attractions.xml'), xml);
  console.log(`✅ Attractions sitemap generated: ${urls.length} URLs`);
  return urls.length;
}

async function generatePlaygroundsSitemap(): Promise<number | null> {
  console.log('🎮 Generating playgrounds sitemap...');

  const { data: playgrounds, error } = await supabase
    .from('playgrounds')
    .select('id, name, updated_at')
    .order('name');

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

  const xml = generateSitemapXML(urls);
  writeFileSync(join(process.cwd(), 'public', 'sitemap-playgrounds.xml'), xml);
  console.log(`✅ Playgrounds sitemap generated: ${urls.length} URLs`);
  return urls.length;
}

async function generateArticlesSitemap(): Promise<number | null> {
  console.log('📰 Generating articles sitemap...');

  const { data: articles, error } = await supabase
    .from('articles')
    .select('id, slug, updated_at, created_at')
    .order('created_at', { ascending: false });

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

  const xml = generateSitemapXML(urls);
  writeFileSync(join(process.cwd(), 'public', 'sitemap-articles.xml'), xml);
  console.log(`✅ Articles sitemap generated: ${urls.length} URLs`);
  return urls.length;
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
    .order('title');

  if (error) {
    console.error('❌ Error fetching guides:', error);
    // Do NOT return early. Returning before the write is what let a stale file
    // ship silently for months — the worst of the available options, because it
    // looks like success. Write a valid sitemap containing just the hub so the
    // output always reflects this run.
    const fallback = generateSitemapXML([
      { loc: `${baseUrl}/guides`, lastmod: currentDate, changefreq: 'monthly', priority: '0.7' },
    ]);
    writeFileSync(join(process.cwd(), 'public', 'sitemap-guides.xml'), fallback);
    console.warn('⚠️ Guides sitemap fell back to the hub URL only — stale entries have been cleared.');
    return null;
  }

  const urls = (guides ?? []).map(guide => ({
    loc: `${baseUrl}/guides/${guide.slug || guide.id}`,
    lastmod: guide.updated_at ? guide.updated_at.split('T')[0] : currentDate,
    changefreq: 'monthly',
    priority: '0.7'
  }));

  if (urls.length === 0) {
    urls.push({ loc: `${baseUrl}/guides`, lastmod: currentDate, changefreq: 'monthly', priority: '0.7' });
  }

  const xml = generateSitemapXML(urls);
  writeFileSync(join(process.cwd(), 'public', 'sitemap-guides.xml'), xml);
  console.log(`✅ Guides sitemap generated: ${urls.length} URLs`);
  return urls.length;
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
      generateGuidesSitemap()
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
