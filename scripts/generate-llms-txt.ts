/**
 * Writes public/llms.txt from live counts (SEO-047). Runs in `npm run build`
 * after the sitemaps and the RSS feed, with the same anon credentials.
 *
 *   npx tsx scripts/generate-llms-txt.ts
 *
 * Each count uses the filter the matching sitemap generator uses, so the file
 * cannot claim more pages than the site will serve. Month pages are read back
 * off public/sitemap-events.xml, which generate-dynamic-sitemaps has just
 * written, rather than recomputed.
 *
 * Like generate-rss, a failure never fails the build. One failed count drops
 * that number from the sentence; no credentials, or every count failing,
 * leaves the file on disk as it is.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { BRAND } from '../src/lib/brandConfig';
import { isInMetro } from '../src/lib/geo';
import { centralMonthOf } from '../src/lib/monthPages';
import { renderLlmsTxt, upcomingMonthSlugs, type LlmsCounts } from './lib/llmsTxt';

function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let value = t.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && !process.env[key]) process.env[key] = value;
  }
}
loadEnvFile(join(process.cwd(), '.env'));
loadEnvFile(join(process.cwd(), '.env.local'));

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const baseUrl = (process.env.VITE_SITE_URL || process.env.SITE_URL || BRAND.baseUrl).replace(/\/+$/, '');
const OUT = join(process.cwd(), 'public', 'llms.txt');

/** YYYY-MM-DD in Central, the site's own calendar. */
function centralDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

async function headCount(label: string, query: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number | null> {
  const { count, error } = await query;
  if (error) {
    console.error(`❌ llms: ${label} count failed: ${error.message}`);
    return null;
  }
  return count;
}

async function readCounts(supabase: SupabaseClient, today: string): Promise<LlmsCounts> {
  const [upcomingEvents, openRestaurants, attractions, articles, playgrounds] = await Promise.all([
    // generate-dynamic-sitemaps' event filter, with today in place of the
    // 7-day grace cutoff: "upcoming" means not over yet.
    headCount(
      'events',
      supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .or(`date.gte.${today},end_date.gte.${today}`)
        .neq('is_merged', true)
        .neq('is_hidden', true)
        .is('archived_at', null),
    ),
    headCount(
      'restaurants',
      supabase
        .from('restaurants')
        .select('id', { count: 'exact', head: true })
        .neq('is_merged', true)
        .or('status.is.null,status.neq.closed')
        .or('business_status.is.null,business_status.neq.CLOSED_PERMANENTLY'),
    ),
    headCount(
      'attractions',
      supabase.from('attractions').select('id', { count: 'exact', head: true }).eq('is_active', true),
    ),
    headCount(
      'articles',
      supabase
        .from('articles')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'published')
        .lte('published_at', new Date().toISOString()),
    ),
    // isInMetro is a TypeScript predicate (a row with no coordinates counts as
    // inside), so this one is counted client-side, as the sitemap does.
    (async () => {
      const { data, error } = await supabase.from('playgrounds').select('latitude, longitude');
      if (error) {
        console.error(`❌ llms: playgrounds count failed: ${error.message}`);
        return null;
      }
      return (data ?? []).filter((p) => isInMetro(p.latitude, p.longitude)).length;
    })(),
  ]);
  return { upcomingEvents, openRestaurants, attractions, playgrounds, articles };
}

function monthSlugsFromSitemap(): string[] {
  const file = join(process.cwd(), 'public', 'sitemap-events.xml');
  if (!existsSync(file)) return [];
  const xml = readFileSync(file, 'utf8');
  const slugs: string[] = [];
  for (const m of xml.matchAll(/<loc>[^<]*\/events\/([a-z]+-\d{4})<\/loc>/g)) slugs.push(m[1]);
  return upcomingMonthSlugs(slugs, centralMonthOf(new Date()));
}

async function main(): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('⚠️ llms: no Supabase credentials; public/llms.txt left as it is');
    return;
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const now = new Date();
  const asOf = centralDate(now);
  const counts = await readCounts(supabase, asOf);

  if (Object.values(counts).every((v) => v === null)) {
    console.warn('⚠️ llms: every count failed; public/llms.txt left as it is');
    return;
  }

  writeFileSync(OUT, renderLlmsTxt({ baseUrl, asOf, counts, monthSlugs: monthSlugsFromSitemap() }));
  console.log(
    `✅ llms.txt: ${counts.upcomingEvents} events, ${counts.openRestaurants} restaurants, ` +
      `${counts.attractions} attractions, ${counts.playgrounds} playgrounds, ${counts.articles} articles`,
  );
}

main().catch((error) => {
  console.error('❌ llms: generation failed:', error);
});
