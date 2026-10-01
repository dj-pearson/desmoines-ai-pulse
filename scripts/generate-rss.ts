/**
 * Writes public/rss.xml from published articles and upcoming events (SEO-031).
 * Runs in `npm run build` after the sitemaps, with the same anon credentials.
 *
 *   npx tsx scripts/generate-rss.ts
 *
 * A failed query does not fail the build, matching generate-dynamic-sitemaps:
 * the feed is a convenience, the deploy is not. If both queries fail the file
 * on disk is left as it is rather than replaced with an empty channel, and the
 * run says so.
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { BRAND } from '../src/lib/brandConfig';
import { articleItem, eventItem, renderRss, type RssArticle, type RssEvent, type RssItem } from './lib/rssFeed';

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

const ARTICLE_LIMIT = 30;
const EVENT_LIMIT = 50;
const EVENT_HORIZON_DAYS = 30;

async function main(): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('⚠️ rss: no Supabase credentials; public/rss.xml left as it is');
    return;
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const now = new Date();
  const horizon = new Date(now.getTime() + EVENT_HORIZON_DAYS * 24 * 60 * 60 * 1000);

  const [articles, events] = await Promise.all([
    supabase
      .from('articles')
      .select('id, slug, title, excerpt, category, published_at, created_at')
      .eq('status', 'published')
      .lte('published_at', now.toISOString())
      .order('published_at', { ascending: false })
      .order('id')
      .limit(ARTICLE_LIMIT),
    supabase
      .from('events')
      .select('id, title, date, event_start_utc, venue, category, seo_description, geo_summary, original_description, created_at')
      .gte('date', now.toISOString())
      .lt('date', horizon.toISOString())
      // The same unpublish switches the sitemap and useEventBySlug honour: a
      // feed must not link a page the app answers as gone.
      .neq('is_hidden', true)
      .neq('is_merged', true)
      .is('archived_at', null)
      .order('date', { ascending: true })
      .order('id')
      .limit(EVENT_LIMIT),
  ]);

  if (articles.error) console.error('❌ rss: articles query failed:', articles.error.message);
  if (events.error) console.error('❌ rss: events query failed:', events.error.message);
  if (articles.error && events.error) {
    console.warn('⚠️ rss: both queries failed; public/rss.xml left as it is');
    return;
  }

  const items: RssItem[] = [
    ...((articles.data ?? []) as RssArticle[]).map((a) => articleItem(a, baseUrl)),
    ...((events.data ?? []) as RssEvent[]).map((e) => eventItem(e, baseUrl)),
  ].filter((i): i is RssItem => i !== null);

  const xml = renderRss(
    {
      baseUrl,
      title: BRAND.name,
      description: `New articles and upcoming events in Des Moines, Iowa, from ${BRAND.name}.`,
      buildDate: now,
    },
    items,
  );
  writeFileSync(join(process.cwd(), 'public', 'rss.xml'), xml);
  console.log(`✅ rss.xml: ${articles.data?.length ?? 0} article(s), ${events.data?.length ?? 0} event(s)`);
}

main().catch((error) => {
  console.error('❌ rss: generation failed:', error);
});
