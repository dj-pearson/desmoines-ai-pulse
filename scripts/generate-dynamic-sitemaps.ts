import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';
import { join } from 'path';

// Supabase configuration
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://wtkhfqpmcegzcbngroui.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0a2hmcXBtY2VnemNibmdyb3VpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM1Mzc5NzcsImV4cCI6MjA2OTExMzk3N30.a-qKhaxy7l72IyT0eLq7kYuxm-wypuMxgycDy95r1aE';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const baseUrl = 'https://desmoinesinsider.com';
const currentDate = new Date().toISOString().split('T')[0];

interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
}

/**
 * Generate XML sitemap content
 */
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

/**
 * Generate attractions sitemap
 */
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

  const urls = attractions.map(attraction => ({
    loc: `${baseUrl}/attractions/${attraction.id}`,
    lastmod: attraction.updated_at ? attraction.updated_at.split('T')[0] : currentDate,
    changefreq: 'monthly',
    priority: '0.7'
  }));

  const xml = generateSitemapXML(urls);
  const filePath = join(process.cwd(), 'public', 'sitemap-attractions.xml');
  writeFileSync(filePath, xml);

  console.log(`✅ Attractions sitemap generated: ${urls.length} URLs`);
  return urls.length;
}

/**
 * Generate playgrounds sitemap
 */
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

  const urls = playgrounds.map(playground => ({
    loc: `${baseUrl}/playgrounds/${playground.id}`,
    lastmod: playground.updated_at ? playground.updated_at.split('T')[0] : currentDate,
    changefreq: 'monthly',
    priority: '0.6'
  }));

  const xml = generateSitemapXML(urls);
  const filePath = join(process.cwd(), 'public', 'sitemap-playgrounds.xml');
  writeFileSync(filePath, xml);

  console.log(`✅ Playgrounds sitemap generated: ${urls.length} URLs`);
  return urls.length;
}

/**
 * Generate articles sitemap
 */
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

  const xml = generateSitemapXML(urls);
  const filePath = join(process.cwd(), 'public', 'sitemap-articles.xml');
  writeFileSync(filePath, xml);

  console.log(`✅ Articles sitemap generated: ${urls.length} URLs`);
  return urls.length;
}

/**
 * Generate guides sitemap
 */
async function generateGuidesSitemap(): Promise<number | null> {
  console.log('📖 Generating guides sitemap...');

  const { data: guides, error } = await supabase
    .from('guides')
    .select('id, slug, title, updated_at')
    .order('title');

  if (error) {
    console.error('❌ Error fetching guides:', error);
    return null;
  }

  const urls = guides.map(guide => ({
    loc: `${baseUrl}/guides/${guide.slug || guide.id}`,
    lastmod: guide.updated_at ? guide.updated_at.split('T')[0] : currentDate,
    changefreq: 'monthly',
    priority: '0.7'
  }));

  const xml = generateSitemapXML(urls);
  const filePath = join(process.cwd(), 'public', 'sitemap-guides.xml');
  writeFileSync(filePath, xml);

  console.log(`✅ Guides sitemap generated: ${urls.length} URLs`);
  return urls.length;
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  console.log('🚀 Starting dynamic sitemap generation...\n');
  console.log(`📅 Date: ${currentDate}`);
  console.log(`🌐 Base URL: ${baseUrl}\n`);

  try {
    const results = await Promise.all([
      generateAttractionsSitemap(),
      generatePlaygroundsSitemap(),
      generateArticlesSitemap(),
      generateGuidesSitemap()
    ]);

    const totalUrls = results.filter(r => r !== null).reduce((sum, count) => sum + count, 0);

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
