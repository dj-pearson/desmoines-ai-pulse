import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SitemapUrl {
  loc: string;
  lastmod: string;
  changefreq: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority: number;
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

function createSlug(title: string, event?: any): string {
  let slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  // Add date to event slugs
  if (event) {
    const eventDate = new Date(event.date || event.event_start_utc || event.created_at);
    if (!isNaN(eventDate.getTime())) {
      const dateStr = eventDate.toISOString().split('T')[0];
      slug = `${slug}-${dateStr}`;
    }
  }

  return slug;
}

function generateXML(urls: SitemapUrl[]): string {
  const header = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
  const footer = "</urlset>";

  const urlElements = urls
    .map(url => `  <url>
    <loc>${escapeXml(url.loc)}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`)
    .join("\n");

  return `${header}\n${urlElements}\n${footer}`;
}

function escapeXml(unsafe: string): string {
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const baseUrl = "https://desmoinesinsider.com";
    const currentDate = new Date().toISOString().split("T")[0];

    console.log("🗺️ Starting sitemap generation...");

    // Generate main sitemap
    const mainUrls: SitemapUrl[] = [
      {
        loc: `${baseUrl}/`,
        lastmod: currentDate,
        changefreq: "daily",
        priority: 1.0,
      },
      {
        loc: `${baseUrl}/events`,
        lastmod: currentDate,
        changefreq: "hourly",
        priority: 0.9,
      },
      {
        loc: `${baseUrl}/restaurants`,
        lastmod: currentDate,
        changefreq: "daily",
        priority: 0.8,
      },
      {
        loc: `${baseUrl}/playgrounds`,
        lastmod: currentDate,
        changefreq: "weekly",
        priority: 0.7,
      },
      {
        loc: `${baseUrl}/attractions`,
        lastmod: currentDate,
        changefreq: "weekly",
        priority: 0.7,
      }
    ];

    // Generate events sitemap
    const eventsUrls: SitemapUrl[] = [];
    try {
      const { data: events, error } = await supabase
        .from("events")
        .select("id, title, date, updated_at, created_at, event_start_utc")
        .gte("date", new Date().toISOString().split("T")[0])
        .order("date", { ascending: true })
        .limit(1000);

      if (!error && events) {
        console.log(`📅 Processing ${events.length} events`);
        events.forEach((event) => {
          const slug = createSlug(event.title, event);
          const lastmod = event.updated_at || event.created_at || currentDate;
          const eventDate = new Date(event.date || event.event_start_utc);
          const isUpcoming = eventDate > new Date();
          
          eventsUrls.push({
            loc: `${baseUrl}/events/${slug}`,
            lastmod: lastmod.split("T")[0],
            changefreq: isUpcoming ? "weekly" : "monthly",
            priority: isUpcoming ? 0.8 : 0.6,
          });
        });
      }
    } catch (error) {
      console.error("Error fetching events:", error);
    }

    // Generate restaurants sitemap
    const restaurantsUrls: SitemapUrl[] = [];
    try {
      const { data: restaurants, error } = await supabase
        .from("restaurants")
        .select("id, name, slug, updated_at, created_at, is_featured")
        .order("created_at", { ascending: false })
        .limit(1000);

      if (!error && restaurants) {
        console.log(`🍽️ Processing ${restaurants.length} restaurants`);
        restaurants.forEach((restaurant) => {
          const slug = restaurant.slug || createSlug(restaurant.name);
          const lastmod = restaurant.updated_at || restaurant.created_at || currentDate;
          const priority = restaurant.is_featured ? 0.9 : 0.7;

          restaurantsUrls.push({
            loc: `${baseUrl}/restaurants/${slug}`,
            lastmod: lastmod.split("T")[0],
            changefreq: "monthly",
            priority,
          });
        });
      }
    } catch (error) {
      console.error("Error fetching restaurants:", error);
    }

    // Generate XML content
    const mainSitemap = generateXML(mainUrls);
    const eventsSitemap = generateXML(eventsUrls);
    const restaurantsSitemap = generateXML(restaurantsUrls);

    // Generate sitemap index
    const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${baseUrl}/sitemap.xml</loc>
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
</sitemapindex>`;

    const result = {
      success: true,
      generated: {
        main_urls: mainUrls.length,
        events_urls: eventsUrls.length,
        restaurants_urls: restaurantsUrls.length,
        total_urls: mainUrls.length + eventsUrls.length + restaurantsUrls.length
      },
      sitemaps: {
        main: mainSitemap,
        events: eventsSitemap,
        restaurants: restaurantsSitemap,
        index: sitemapIndex
      }
    };

    console.log(`✅ Sitemap generation complete: ${result.generated.total_urls} URLs`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("❌ Sitemap generation error:", error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});