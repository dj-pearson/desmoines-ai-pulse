import { supabase } from "@/integrations/supabase/client";
import { createEventSlugWithCentralTime } from "./timezone";
import { BRAND } from "./brandConfig";
import { createLogger } from '@/lib/logger';

const log = createLogger('EnhancedSitemapGenerator');

interface SitemapUrl {
  loc: string;
  lastmod: string;
  changefreq: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority: number;
}

export class EnhancedSitemapGenerator {
  private baseUrl = BRAND.baseUrl;
  private currentDate = new Date().toISOString().split("T")[0];

  async generateMainSitemap(): Promise<string> {
    const urls: SitemapUrl[] = [];

    // Add static pages with proper SEO priorities
    urls.push(
      {
        loc: `${this.baseUrl}/`,
        lastmod: this.currentDate,
        changefreq: "daily",
        priority: 1.0,
      },
      {
        loc: `${this.baseUrl}/events`,
        lastmod: this.currentDate,
        changefreq: "hourly",
        priority: 0.9,
      },
      {
        loc: `${this.baseUrl}/restaurants`,
        lastmod: this.currentDate,
        changefreq: "daily",
        priority: 0.8,
      },
      {
        loc: `${this.baseUrl}/playgrounds`,
        lastmod: this.currentDate,
        changefreq: "weekly",
        priority: 0.7,
      },
      {
        loc: `${this.baseUrl}/attractions`,
        lastmod: this.currentDate,
        changefreq: "weekly",
        priority: 0.7,
      },
      {
        loc: `${this.baseUrl}/neighborhoods`,
        lastmod: this.currentDate,
        changefreq: "monthly",
        priority: 0.6,
      }
    );

    return this.generateXML(urls);
  }

  async generateEventsSitemap(): Promise<string> {
    const urls: SitemapUrl[] = [];

    try {
      // Get future events only for better SEO
      const { data: events, error } = await supabase
        .from("events")
        .select("id, title, date, updated_at, created_at, event_start_utc")
        .gte("date", new Date().toISOString().split("T")[0])
        .order("date", { ascending: true })
        .limit(50000);

      if (!error && events) {
        events.forEach((event) => {
          const slug = createEventSlugWithCentralTime(event.title, event);
          const lastmod = event.updated_at || event.created_at || this.currentDate;
          const eventDate = new Date(event.date || event.event_start_utc);
          const isUpcoming = eventDate > new Date();
          
          urls.push({
            loc: `${this.baseUrl}/events/${slug}`,
            lastmod: lastmod.split("T")[0],
            changefreq: isUpcoming ? "weekly" : "monthly",
            priority: isUpcoming ? 0.8 : 0.6,
          });
        });
      }
    } catch (error) {
      log.error('Error generating events sitemap', { action: 'generateEventsSitemap', metadata: { error } });
    }

    return this.generateXML(urls);
  }

  async generateRestaurantsSitemap(): Promise<string> {
    const urls: SitemapUrl[] = [];

    try {
      const { data: restaurants, error } = await supabase
        .from("restaurants")
        .select("id, name, slug, updated_at, created_at, is_featured")
        .order("created_at", { ascending: false })
        .limit(10000);

      if (!error && restaurants) {
        restaurants.forEach((restaurant) => {
          const slug = restaurant.slug || this.createSlug(restaurant.name);
          const lastmod = restaurant.updated_at || restaurant.created_at || this.currentDate;
          const priority = restaurant.is_featured ? 0.9 : 0.7;

          urls.push({
            loc: `${this.baseUrl}/restaurants/${slug}`,
            lastmod: lastmod.split("T")[0],
            changefreq: "monthly",
            priority,
          });
        });
      }
    } catch (error) {
      log.error('Error generating restaurants sitemap', { action: 'generateRestaurantsSitemap', metadata: { error } });
    }

    return this.generateXML(urls);
  }

  async generateSitemapIndex(): Promise<string> {
    const sitemaps = [
      {
        loc: `${this.baseUrl}/sitemap.xml`,
        lastmod: this.currentDate,
      },
      {
        loc: `${this.baseUrl}/sitemap-events.xml`,
        lastmod: this.currentDate,
      },
      {
        loc: `${this.baseUrl}/sitemap-restaurants.xml`,
        lastmod: this.currentDate,
      }
    ];

    const header = '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
    const footer = "</sitemapindex>";

    const sitemapElements = sitemaps
      .map(sitemap => `  <sitemap>
    <loc>${this.escapeXml(sitemap.loc)}</loc>
    <lastmod>${sitemap.lastmod}</lastmod>
  </sitemap>`)
      .join("\n");

    return `${header}\n${sitemapElements}\n${footer}`;
  }

  private createSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  private generateXML(urls: SitemapUrl[]): string {
    const header = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
    const footer = "</urlset>";

    const urlElements = urls
      .map(url => `  <url>
    <loc>${this.escapeXml(url.loc)}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`)
      .join("\n");

    return `${header}\n${urlElements}\n${footer}`;
  }

  private escapeXml(unsafe: string): string {
    return unsafe.replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case "<": return "&lt;";
        case ">": return "&gt;";
        case "&": return "&amp;";
        case "'": return "&apos;";
        case '"': return "&quot;";
        default: return c;
      }
    });
  }
}

// Function to generate and save all sitemaps
export async function generateAllSitemaps(): Promise<void> {
  const generator = new EnhancedSitemapGenerator();
  
  try {
    // Generate main sitemap
    const mainSitemap = await generator.generateMainSitemap();
    log.info('Main sitemap generated', { action: 'generateAllSitemaps' });
    
    // Generate events sitemap
    const eventsSitemap = await generator.generateEventsSitemap();
    log.info('Events sitemap generated', { action: 'generateAllSitemaps' });
    
    // Generate restaurants sitemap
    const restaurantsSitemap = await generator.generateRestaurantsSitemap();
    log.info('Restaurants sitemap generated', { action: 'generateAllSitemaps' });
    
    // Generate sitemap index
    const sitemapIndex = await generator.generateSitemapIndex();
    log.info('Sitemap index generated', { action: 'generateAllSitemaps' });
    
    // In a real implementation, these would be saved to the public folder
    // For now, we'll log them for debugging
    
  } catch (error) {
    log.error('Error generating sitemaps', { action: 'generateAllSitemaps', metadata: { error } });
  }
}