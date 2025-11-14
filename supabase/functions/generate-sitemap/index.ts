// ============================================================================
// Generate Sitemap Edge Function
// ============================================================================
// Purpose: Generate XML sitemap for search engines
// Returns: Complete sitemap.xml content
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { domain = "https://desmoinesinsider.com", include = [] } = await req.json();

    console.log("Generating sitemap for:", domain);
    const currentDate = new Date().toISOString().split("T")[0];

    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
  <!-- Generated on ${currentDate} -->

  <!-- Homepage -->
  <url>
    <loc>${domain}/</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`;

    // Static pages - expanded per SEO strategy
    const staticPages = [
      { path: "/events", priority: 0.9, freq: "daily" },
      { path: "/events/today", priority: 0.9, freq: "daily" },
      { path: "/events/this-weekend", priority: 0.9, freq: "daily" },
      { path: "/restaurants", priority: 0.8, freq: "weekly" },
      { path: "/attractions", priority: 0.7, freq: "weekly" },
      { path: "/playgrounds", priority: 0.7, freq: "monthly" },
      { path: "/articles", priority: 0.8, freq: "daily" },
      { path: "/guides", priority: 0.7, freq: "weekly" },
      { path: "/neighborhoods", priority: 0.6, freq: "monthly" },
      { path: "/weekend", priority: 0.7, freq: "weekly" },
      { path: "/iowa-state-fair", priority: 0.7, freq: "monthly" },
    ];

    for (const page of staticPages) {
      sitemap += `
  <url>
    <loc>${domain}${page.path}</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>${page.freq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`;
    }

    // Events
    const includeEvents = include.length === 0 || include.includes("events");
    if (includeEvents) {
      const { data: events } = await supabase
        .from("events")
        .select("title, date, slug, updated_at")
        .order("date", { ascending: false })
        .limit(5000);

      if (events) {
        console.log(`Adding ${events.length} events to sitemap`);
        for (const event of events) {
          const eventDate = event.date
            ? new Date(event.date).toISOString().split("T")[0]
            : currentDate;
          const lastmod = event.updated_at
            ? new Date(event.updated_at).toISOString().split("T")[0]
            : eventDate;

          // Use slug if available
          const slug = event.slug || event.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");

          sitemap += `
  <url>
    <loc>${domain}/events/${slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`;
        }
      }
    }

    // Restaurants
    const includeRestaurants = include.length === 0 || include.includes("restaurants");
    if (includeRestaurants) {
      const { data: restaurants } = await supabase
        .from("restaurants")
        .select("name, slug, is_featured, updated_at")
        .order("name")
        .limit(5000);

      if (restaurants) {
        console.log(`Adding ${restaurants.length} restaurants to sitemap`);
        for (const restaurant of restaurants) {
          const slug = restaurant.slug || restaurant.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
          const lastmod = restaurant.updated_at
            ? new Date(restaurant.updated_at).toISOString().split("T")[0]
            : currentDate;
          const priority = restaurant.is_featured ? 0.8 : 0.6;

          sitemap += `
  <url>
    <loc>${domain}/restaurants/${slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${priority}</priority>
  </url>`;
        }
      }
    }

    // Attractions
    const includeAttractions = include.length === 0 || include.includes("attractions");
    if (includeAttractions) {
      const { data: attractions } = await supabase
        .from("attractions")
        .select("name, is_featured, updated_at")
        .order("name")
        .limit(1000);

      if (attractions) {
        console.log(`Adding ${attractions.length} attractions to sitemap`);
        for (const attraction of attractions) {
          const slug = attraction.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
          const lastmod = attraction.updated_at
            ? new Date(attraction.updated_at).toISOString().split("T")[0]
            : currentDate;
          const priority = attraction.is_featured ? 0.8 : 0.6;

          sitemap += `
  <url>
    <loc>${domain}/attractions/${slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${priority}</priority>
  </url>`;
        }
      }
    }

    // Articles
    const includeArticles = include.length === 0 || include.includes("articles");
    if (includeArticles) {
      const { data: articles } = await supabase
        .from("articles")
        .select("title, slug, published_at, updated_at")
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(2000);

      if (articles) {
        console.log(`Adding ${articles.length} articles to sitemap`);
        for (const article of articles) {
          const lastmod = article.updated_at
            ? new Date(article.updated_at).toISOString().split("T")[0]
            : article.published_at
            ? new Date(article.published_at).toISOString().split("T")[0]
            : currentDate;

          sitemap += `
  <url>
    <loc>${domain}/articles/${article.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;
        }
      }
    }

    // Playgrounds
    const includePlaygrounds = include.length === 0 || include.includes("playgrounds");
    if (includePlaygrounds) {
      const { data: playgrounds } = await supabase
        .from("playgrounds")
        .select("name, slug, updated_at")
        .order("name")
        .limit(500);

      if (playgrounds) {
        console.log(`Adding ${playgrounds.length} playgrounds to sitemap`);
        for (const playground of playgrounds) {
          const slug = playground.slug || playground.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
          const lastmod = playground.updated_at
            ? new Date(playground.updated_at).toISOString().split("T")[0]
            : currentDate;

          sitemap += `
  <url>
    <loc>${domain}/playgrounds/${slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`;
        }
      }
    }

    // Neighborhoods
    const includeNeighborhoods = include.length === 0 || include.includes("neighborhoods");
    if (includeNeighborhoods) {
      const { data: neighborhoods } = await supabase
        .from("neighborhoods")
        .select("name, slug, updated_at")
        .order("name")
        .limit(100);

      if (neighborhoods) {
        console.log(`Adding ${neighborhoods.length} neighborhoods to sitemap`);
        for (const neighborhood of neighborhoods) {
          const slug = neighborhood.slug || neighborhood.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
          const lastmod = neighborhood.updated_at
            ? new Date(neighborhood.updated_at).toISOString().split("T")[0]
            : currentDate;

          sitemap += `
  <url>
    <loc>${domain}/neighborhoods/${slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;
        }
      }
    }

    sitemap += `
</urlset>`;

    return new Response(sitemap, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml",
        "Cache-Control": "public, max-age=3600", // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error("Error in generate-sitemap function:", error);

    return new Response(
      JSON.stringify({
        error: error.message,
        details: error.stack,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
