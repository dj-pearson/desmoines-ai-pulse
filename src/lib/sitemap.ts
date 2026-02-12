import { supabase } from "@/integrations/supabase/client";
import { createEventSlugWithCentralTime } from "./timezone";
import { BRAND } from "./brandConfig";
import { createLogger } from '@/lib/logger';

const log = createLogger('SitemapGenerator');

interface SitemapUrl {
  loc: string;
  lastmod: string;
  changefreq:
    | "always"
    | "hourly"
    | "daily"
    | "weekly"
    | "monthly"
    | "yearly"
    | "never";
  priority: number;
}

export class SitemapGenerator {
  private baseUrl = BRAND.baseUrl;
  private currentDate = new Date().toISOString().split("T")[0];

  async generateSitemap(): Promise<string> {
    const urls: SitemapUrl[] = [];

    // Add static pages
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
        changefreq: "daily",
        priority: 0.9,
      },
      {
        loc: `${this.baseUrl}/restaurants`,
        lastmod: this.currentDate,
        changefreq: "weekly",
        priority: 0.8,
      },
      {
        loc: `${this.baseUrl}/auth`,
        lastmod: this.currentDate,
        changefreq: "monthly",
        priority: 0.5,
      }
    );

    // Add events
    try {
      const { data: events, error: eventsError } = await supabase
        .from("events")
        .select("id, title, date, updated_at, created_at")
        .order("created_at", { ascending: false });

      if (!eventsError && events) {
        events.forEach((event) => {
          const slug = createEventSlugWithCentralTime(event.title, event);
          const lastmod =
            event.updated_at || event.created_at || this.currentDate;
          urls.push({
            loc: `${this.baseUrl}/events/${slug}`,
            lastmod: lastmod.split("T")[0],
            changefreq: "weekly",
            priority: 0.7,
          });
        });
      }
    } catch (error) {
      log.error('Error fetching events for sitemap', { action: 'generateSitemap', metadata: { error } });
    }

    // Add restaurants
    try {
      const { data: restaurants, error: restaurantsError } = await supabase
        .from("restaurants")
        .select("id, name, slug, updated_at, created_at, is_featured")
        .order("created_at", { ascending: false });

      if (!restaurantsError && restaurants) {
        restaurants.forEach((restaurant) => {
          const slug = restaurant.slug || this.createSlug(restaurant.name);
          const lastmod =
            restaurant.updated_at || restaurant.created_at || this.currentDate;
          const priority = restaurant.is_featured ? 0.8 : 0.6;

          urls.push({
            loc: `${this.baseUrl}/restaurants/${slug}`,
            lastmod: lastmod.split("T")[0],
            changefreq: "monthly",
            priority,
          });
        });
      }
    } catch (error) {
      log.error('Error fetching restaurants for sitemap', { action: 'generateSitemap', metadata: { error } });
    }

    return this.generateXML(urls);
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
    const header =
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
    const footer = "</urlset>";

    const urlElements = urls
      .map(
        (url) => `  <url>
    <loc>${this.escapeXml(url.loc)}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`
      )
      .join("\n");

    return `${header}\n${urlElements}\n${footer}`;
  }

  private escapeXml(unsafe: string): string {
    return unsafe.replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case "&":
          return "&amp;";
        case "'":
          return "&apos;";
        case '"':
          return "&quot;";
        default:
          return c;
      }
    });
  }

  async saveSitemap(): Promise<void> {
    const sitemap = await this.generateSitemap();

    // In a real implementation, you would save this to a file
    // For now, we'll just log it or return it
    log.info('Generated sitemap', { action: 'saveSitemap' });

    // You can implement file writing logic here if needed
    // For example, using Node.js fs module or a build script
  }
}

// Export a function to generate and get the sitemap
export async function generateSitemap(): Promise<string> {
  const generator = new SitemapGenerator();
  return await generator.generateSitemap();
}

// Export a function that can be used in build scripts
export async function updateSitemap(): Promise<void> {
  const generator = new SitemapGenerator();
  await generator.saveSitemap();
}