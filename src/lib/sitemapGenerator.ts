import { format } from "date-fns";

interface SitemapURL {
  loc: string;
  lastmod?: string;
  changefreq?:
    | "always"
    | "hourly"
    | "daily"
    | "weekly"
    | "monthly"
    | "yearly"
    | "never";
  priority?: number;
}

interface SitemapData {
  events: Array<{
    id: string;
    slug?: string;
    date: string;
    updated_at?: string;
  }>;
  restaurants: Array<{ id: string; slug?: string; updated_at?: string }>;
  attractions: Array<{ id: string; slug?: string; updated_at?: string }>;
  playgrounds: Array<{ id: string; slug?: string; updated_at?: string }>;
  articles: Array<{ slug: string; updated_at?: string }>;
}

const BASE_URL = "https://desmoinesinsider.com";

// Suburbs for location-based pages
const SUBURBS = [
  "west-des-moines",
  "ankeny",
  "urbandale",
  "johnston",
  "altoona",
  "clive",
  "windsor-heights",
];

// Neighborhoods
const NEIGHBORHOODS = [
  "downtown",
  "east-village",
  "beaverdale",
  "highland-park",
  "ingersoll",
  "sherman-hill",
  "valley-junction",
];

// Generate main sitemap index
export function generateSitemapIndex(): string {
  const sitemaps = [
    "sitemap-static.xml",
    "sitemap-events.xml",
    "sitemap-restaurants.xml",
    "sitemap-attractions.xml",
    "sitemap-playgrounds.xml",
    "sitemap-articles.xml",
    "sitemap-guides.xml",
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemaps
  .map(
    (sitemap) => `  <sitemap>
    <loc>${BASE_URL}/${sitemap}</loc>
    <lastmod>${format(new Date(), "yyyy-MM-dd")}</lastmod>
  </sitemap>`
  )
  .join("\n")}
</sitemapindex>`;

  return xml;
}

// Generate static pages sitemap
export function generateStaticSitemap(): string {
  const staticPages: SitemapURL[] = [
    // Main pages
    { loc: `${BASE_URL}/`, changefreq: "daily", priority: 1.0 },
    { loc: `${BASE_URL}/events`, changefreq: "daily", priority: 0.9 },
    { loc: `${BASE_URL}/restaurants`, changefreq: "weekly", priority: 0.8 },
    { loc: `${BASE_URL}/attractions`, changefreq: "monthly", priority: 0.7 },
    { loc: `${BASE_URL}/playgrounds`, changefreq: "monthly", priority: 0.7 },
    { loc: `${BASE_URL}/articles`, changefreq: "weekly", priority: 0.8 },

    // Time-sensitive pages (high priority for local SEO)
    { loc: `${BASE_URL}/events/today`, changefreq: "hourly", priority: 0.95 },
    {
      loc: `${BASE_URL}/events/this-weekend`,
      changefreq: "daily",
      priority: 0.9,
    },

    // Location-based event pages
    ...SUBURBS.map((suburb) => ({
      loc: `${BASE_URL}/events/${suburb}`,
      changefreq: "weekly" as const,
      priority: 0.8,
    })),

    // Restaurant location pages
    ...SUBURBS.map((suburb) => ({
      loc: `${BASE_URL}/restaurants/${suburb}`,
      changefreq: "weekly" as const,
      priority: 0.7,
    })),

    // Neighborhood pages
    { loc: `${BASE_URL}/neighborhoods`, changefreq: "monthly", priority: 0.6 },
    ...NEIGHBORHOODS.map((neighborhood) => ({
      loc: `${BASE_URL}/neighborhoods/${neighborhood}`,
      changefreq: "weekly" as const,
      priority: 0.7,
    })),

    // Guide pages
    { loc: `${BASE_URL}/guides`, changefreq: "weekly", priority: 0.6 },
    { loc: `${BASE_URL}/weekend`, changefreq: "weekly", priority: 0.8 },

    // Other important pages
    { loc: `${BASE_URL}/advertise`, changefreq: "monthly", priority: 0.5 },
    {
      loc: `${BASE_URL}/business-partnership`,
      changefreq: "monthly",
      priority: 0.5,
    },
  ];

  return generateXMLSitemap(staticPages);
}

// Generate events sitemap
export function generateEventsSitemap(events: SitemapData["events"]): string {
  const eventUrls: SitemapURL[] = events.map((event) => ({
    loc: `${BASE_URL}/events/${event.slug || event.id}`,
    lastmod: event.updated_at
      ? format(new Date(event.updated_at), "yyyy-MM-dd")
      : format(new Date(), "yyyy-MM-dd"),
    changefreq: "weekly",
    priority: 0.7,
  }));

  return generateXMLSitemap(eventUrls);
}

// Generate restaurants sitemap
export function generateRestaurantsSitemap(
  restaurants: SitemapData["restaurants"]
): string {
  const restaurantUrls: SitemapURL[] = restaurants.map((restaurant) => ({
    loc: `${BASE_URL}/restaurants/${restaurant.slug || restaurant.id}`,
    lastmod: restaurant.updated_at
      ? format(new Date(restaurant.updated_at), "yyyy-MM-dd")
      : format(new Date(), "yyyy-MM-dd"),
    changefreq: "monthly",
    priority: 0.6,
  }));

  return generateXMLSitemap(restaurantUrls);
}

// Generate attractions sitemap
export function generateAttractionsSitemap(
  attractions: SitemapData["attractions"]
): string {
  const attractionUrls: SitemapURL[] = attractions.map((attraction) => ({
    loc: `${BASE_URL}/attractions/${attraction.slug || attraction.id}`,
    lastmod: attraction.updated_at
      ? format(new Date(attraction.updated_at), "yyyy-MM-dd")
      : format(new Date(), "yyyy-MM-dd"),
    changefreq: "monthly",
    priority: 0.6,
  }));

  return generateXMLSitemap(attractionUrls);
}

// Generate playgrounds sitemap
export function generatePlaygroundsSitemap(
  playgrounds: SitemapData["playgrounds"]
): string {
  const playgroundUrls: SitemapURL[] = playgrounds.map((playground) => ({
    loc: `${BASE_URL}/playgrounds/${playground.slug || playground.id}`,
    lastmod: playground.updated_at
      ? format(new Date(playground.updated_at), "yyyy-MM-dd")
      : format(new Date(), "yyyy-MM-dd"),
    changefreq: "monthly",
    priority: 0.6,
  }));

  return generateXMLSitemap(playgroundUrls);
}

// Generate articles sitemap
export function generateArticlesSitemap(
  articles: SitemapData["articles"]
): string {
  const articleUrls: SitemapURL[] = articles.map((article) => ({
    loc: `${BASE_URL}/articles/${article.slug}`,
    lastmod: article.updated_at
      ? format(new Date(article.updated_at), "yyyy-MM-dd")
      : format(new Date(), "yyyy-MM-dd"),
    changefreq: "weekly",
    priority: 0.7,
  }));

  return generateXMLSitemap(articleUrls);
}

// Generate guides sitemap
export function generateGuidesSitemap(): string {
  const guides = [
    "rainy-day",
    "date-night",
    "kids-activities",
    "free-things-to-do",
    "outdoor-activities",
    "indoor-activities",
    "summer-guide",
    "winter-guide",
    "spring-activities",
    "fall-activities",
    "best-pizza",
    "best-coffee",
    "best-brunch",
    "pet-friendly",
  ];

  const guideUrls: SitemapURL[] = guides.map((guide) => ({
    loc: `${BASE_URL}/guides/${guide}`,
    changefreq: "monthly",
    priority: 0.6,
  }));

  return generateXMLSitemap(guideUrls);
}

// Helper function to generate XML sitemap
function generateXMLSitemap(urls: SitemapURL[]): string {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) => `  <url>
    <loc>${url.loc}</loc>
    ${url.lastmod ? `<lastmod>${url.lastmod}</lastmod>` : ""}
    ${url.changefreq ? `<changefreq>${url.changefreq}</changefreq>` : ""}
    ${url.priority ? `<priority>${url.priority}</priority>` : ""}
  </url>`
  )
  .join("\n")}
</urlset>`;

  return xml;
}

// Generate robots.txt content
export function generateRobotsTxt(): string {
  return `# Des Moines Insider - Robots.txt
# Optimized for search engine indexing and AI crawlers

User-agent: *
Allow: /
Disallow: /admin
Disallow: /auth
Disallow: /profile
Disallow: /dashboard
Disallow: /api/
Disallow: /social
Disallow: /gamification
Disallow: /_redirects
Disallow: /_headers
Disallow: /sw.js

# Allow important crawlable paths
Allow: /events/
Allow: /restaurants/
Allow: /playgrounds/
Allow: /attractions/
Allow: /neighborhoods/
Allow: /articles/
Allow: /guides/

# Special permissions for AI crawlers
User-agent: GPTBot
Allow: /
Disallow: /admin
Disallow: /auth
Disallow: /profile
Disallow: /dashboard

User-agent: PerplexityBot
Allow: /
Disallow: /admin
Disallow: /auth
Disallow: /profile
Disallow: /dashboard

User-agent: Claude-Web
Allow: /
Disallow: /admin
Disallow: /auth
Disallow: /profile
Disallow: /dashboard

User-agent: ChatGPT-User
Allow: /
Disallow: /admin
Disallow: /auth
Disallow: /profile
Disallow: /dashboard

# Sitemap locations
Sitemap: ${BASE_URL}/sitemap.xml
Sitemap: ${BASE_URL}/sitemap-events.xml
Sitemap: ${BASE_URL}/sitemap-restaurants.xml
Sitemap: ${BASE_URL}/sitemap-attractions.xml
Sitemap: ${BASE_URL}/sitemap-playgrounds.xml
Sitemap: ${BASE_URL}/sitemap-articles.xml
Sitemap: ${BASE_URL}/sitemap-guides.xml

# Crawl delay for respectful crawling
Crawl-delay: 1`;
}
