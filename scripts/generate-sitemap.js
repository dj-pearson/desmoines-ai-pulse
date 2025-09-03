import { writeFileSync } from 'fs';
import { join } from 'path';

const generateSitemap = () => {
  const baseUrl = 'https://desmoinespulse.com'; // Update this to your actual domain
  const currentDate = new Date().toISOString().split('T')[0];
  
  // Define your site pages here
  const pages = [
    { url: '/', priority: '1.0', changefreq: 'daily' },
    { url: '/events', priority: '0.9', changefreq: 'daily' },
    { url: '/about', priority: '0.7', changefreq: 'monthly' },
    { url: '/contact', priority: '0.6', changefreq: 'monthly' },
    // Add more pages as needed
  ];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(page => `  <url>
    <loc>${baseUrl}${page.url}</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  const publicDir = join(process.cwd(), 'public');
  const sitemapPath = join(publicDir, 'sitemap.xml');
  
  writeFileSync(sitemapPath, sitemap);
  
  console.log('✅ Sitemap generated:', sitemapPath);
  console.log('📊 Total pages:', pages.length);
  console.log('📅 Last modified:', currentDate);
};

generateSitemap();
