import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runJob } from "../_shared/jobRunner.ts";

// WEB-AUTO-011: this function is now the primary, no-deploy sitemap path.
// It regenerates the content sitemaps, WRITES them to the public `sitemaps`
// Storage bucket (served fresh at /sitemap*.xml by the Cloudflare Pages
// middleware, with the build-time static files as fallback), pings search
// engines, and drains the sitemap_change_queue. Wrapped in the WEB-AUTO-001
// jobRunner for observability + failure alerts.
//
// BACKWARD COMPAT: the JSON response keeps the shape SEOTools.tsx reads
// (success, generated.{main_urls,events_urls,restaurants_urls,total_urls},
// sitemaps.main) — new keys are additive.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-trigger-source',
};

const BASE_URL = "https://desmoinesinsider.com";

// Storage files this function regenerates (the change-queue scope). The index
// (sitemap.xml) additionally references the curated static files
// (sitemap-static / -playgrounds / -guides) which stay build-time-generated and
// are served from the static fallback by the middleware.
const REGENERATED_FILES = [
  'sitemap.xml',
  'sitemap-events.xml',
  'sitemap-restaurants.xml',
  'sitemap-attractions.xml',
  'sitemap-articles.xml',
] as const;

interface SitemapUrl {
  loc: string;
  lastmod: string;
  changefreq: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority: number;
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

const CENTRAL_TZ = "America/Chicago";

/** Generic name slug (restaurants/attractions). */
function createSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Event slug matching the app's createEventSlugWithCentralTime so the
 * generated URL actually resolves in EventDetails: titleSlug + '-YYYY-MM-DD'
 * where the date is the event's CENTRAL calendar date (en-CA → ISO).
 */
function createEventSlug(title: string, event: { date?: string | null; event_start_utc?: string | null }): string {
  const titleSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const src = event.event_start_utc || event.date;
  if (!src) return titleSlug;
  try {
    const ymd = new Intl.DateTimeFormat("en-CA", {
      timeZone: CENTRAL_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(src));
    return `${titleSlug}-${ymd}`;
  } catch {
    return titleSlug;
  }
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

function generateXML(urls: SitemapUrl[]): string {
  const header = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
  const footer = "</urlset>";
  const urlElements = urls
    .map((url) => `  <url>
    <loc>${escapeXml(url.loc)}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`)
    .join("\n");
  return `${header}\n${urlElements}\n${footer}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Auth: admin JWT (SEOTools / Job Health re-run), the service-role bearer
  // (the 6h cron), or the EDGE_FUNCTION_API_KEY. Anonymous callers do no work.
  const authFail = await requireAdminOrApiKey(req, corsHeaders);
  if (authFail) return authFail;

  // Pause flag (admin-toggleable, no deploy). When paused, skip regeneration.
  try {
    const { data: pause } = await supabase
      .from("system_settings")
      .select("settings")
      .eq("setting_type", "sitemap_regen")
      .maybeSingle();
    if (pause?.settings?.paused === true) {
      return new Response(JSON.stringify({ success: true, paused: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (_e) {
    // Missing flag → proceed (fail-open: regenerating is the safe default).
  }

  const job = await runJob("generate-sitemaps", async (ctx) => {
    const currentDate = new Date().toISOString().split("T")[0];
    const today = currentDate;

    // Snapshot the queue BEFORE regenerating so rows enqueued mid-run stay
    // pending for the next cycle (no lost changes).
    const cutoff = new Date().toISOString();
    let affectedTypes: string[] = [];
    try {
      const { data: pending } = await supabase
        .from("sitemap_change_queue")
        .select("content_type")
        .is("processed_at", null)
        .lte("enqueued_at", cutoff)
        .limit(5000);
      affectedTypes = [...new Set((pending ?? []).map((r: { content_type: string }) => r.content_type))];
    } catch (_e) {
      // Queue table missing/unreadable → still regenerate everything (the 6h
      // cadence is the safety net), just report no affected types.
    }

    // --- Static-route URLs (informational for the admin UI; the curated
    //     sitemap-static.xml stays build-time-generated and is NOT overwritten).
    const mainUrls: SitemapUrl[] = [
      { loc: `${BASE_URL}/`, lastmod: currentDate, changefreq: "daily", priority: 1.0 },
      { loc: `${BASE_URL}/events`, lastmod: currentDate, changefreq: "hourly", priority: 0.9 },
      { loc: `${BASE_URL}/restaurants`, lastmod: currentDate, changefreq: "daily", priority: 0.8 },
      { loc: `${BASE_URL}/attractions`, lastmod: currentDate, changefreq: "weekly", priority: 0.7 },
      { loc: `${BASE_URL}/playgrounds`, lastmod: currentDate, changefreq: "weekly", priority: 0.7 },
    ];

    // --- Events (future-dated, not hidden/merged → mirrors public browse). ---
    const eventsUrls: SitemapUrl[] = [];
    {
      const { data: events, error } = await supabase
        .from("events")
        .select("id, title, date, updated_at, created_at, event_start_utc")
        .gte("date", today)
        .neq("is_hidden", true)   // WEB-AUTO-006 soft-hide
        .neq("is_merged", true)   // WEB-AUTO-005 dedupe loser
        .order("date", { ascending: true })
        .limit(5000);
      if (error) throw new Error(`events query failed: ${error.message}`);
      for (const event of events ?? []) {
        const slug = createEventSlug(event.title, event);
        const lastmod = (event.updated_at || event.created_at || currentDate).split("T")[0];
        const eventDate = new Date(event.date || event.event_start_utc);
        const isUpcoming = eventDate > new Date();
        eventsUrls.push({
          loc: `${BASE_URL}/events/${slug}`,
          lastmod,
          changefreq: isUpcoming ? "weekly" : "monthly",
          priority: isUpcoming ? 0.8 : 0.6,
        });
      }
    }

    // --- Restaurants (not merged). ---
    const restaurantsUrls: SitemapUrl[] = [];
    {
      const { data: restaurants, error } = await supabase
        .from("restaurants")
        .select("id, name, slug, updated_at, created_at, is_featured")
        .neq("is_merged", true)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw new Error(`restaurants query failed: ${error.message}`);
      for (const restaurant of restaurants ?? []) {
        const slug = restaurant.slug || createSlug(restaurant.name);
        const lastmod = (restaurant.updated_at || restaurant.created_at || currentDate).split("T")[0];
        restaurantsUrls.push({
          loc: `${BASE_URL}/restaurants/${slug}`,
          lastmod,
          changefreq: "monthly",
          priority: restaurant.is_featured ? 0.9 : 0.7,
        });
      }
    }

    // --- Attractions. ---
    const attractionsUrls: SitemapUrl[] = [];
    {
      const { data: attractions, error } = await supabase
        .from("attractions")
        .select("id, name, updated_at, created_at")
        .order("name", { ascending: true })
        .limit(5000);
      if (error) throw new Error(`attractions query failed: ${error.message}`);
      for (const attraction of attractions ?? []) {
        const slug = createSlug(attraction.name);
        const lastmod = (attraction.updated_at || attraction.created_at || currentDate).split("T")[0];
        attractionsUrls.push({
          loc: `${BASE_URL}/attractions/${slug}`,
          lastmod,
          changefreq: "monthly",
          priority: 0.7,
        });
      }
    }

    // --- Articles (published only). ---
    const articlesUrls: SitemapUrl[] = [];
    {
      const { data: articles, error } = await supabase
        .from("articles")
        .select("id, slug, status, updated_at, created_at")
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw new Error(`articles query failed: ${error.message}`);
      for (const article of articles ?? []) {
        const lastmod = (article.updated_at || article.created_at || currentDate).split("T")[0];
        articlesUrls.push({
          loc: `${BASE_URL}/articles/${article.slug || article.id}`,
          lastmod,
          changefreq: "weekly",
          priority: 0.8,
        });
      }
    }

    // Sitemap spec requires ≥1 <url> per file — fall back to the index page.
    if (eventsUrls.length === 0) eventsUrls.push({ loc: `${BASE_URL}/events`, lastmod: currentDate, changefreq: "daily", priority: 0.9 });
    if (restaurantsUrls.length === 0) restaurantsUrls.push({ loc: `${BASE_URL}/restaurants`, lastmod: currentDate, changefreq: "weekly", priority: 0.8 });
    if (attractionsUrls.length === 0) attractionsUrls.push({ loc: `${BASE_URL}/attractions`, lastmod: currentDate, changefreq: "monthly", priority: 0.7 });
    if (articlesUrls.length === 0) articlesUrls.push({ loc: `${BASE_URL}/articles`, lastmod: currentDate, changefreq: "weekly", priority: 0.8 });

    const mainSitemap = generateXML(mainUrls);
    const eventsSitemap = generateXML(eventsUrls);
    const restaurantsSitemap = generateXML(restaurantsUrls);
    const attractionsSitemap = generateXML(attractionsUrls);
    const articlesSitemap = generateXML(articlesUrls);

    // Index references the full set; the static/playgrounds/guides children are
    // served from the build-time static files (middleware fallback).
    const indexChildren = [
      "sitemap-static.xml",
      "sitemap-events.xml",
      "sitemap-restaurants.xml",
      "sitemap-attractions.xml",
      "sitemap-playgrounds.xml",
      "sitemap-articles.xml",
      "sitemap-guides.xml",
    ];
    const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${indexChildren.map((f) => `  <sitemap>
    <loc>${BASE_URL}/${f}</loc>
    <lastmod>${currentDate}</lastmod>
  </sitemap>`).join("\n")}
</sitemapindex>`;

    // --- Write the regenerated files to Storage (upsert). ---
    const fileContents: Record<string, string> = {
      "sitemap.xml": sitemapIndex,
      "sitemap-events.xml": eventsSitemap,
      "sitemap-restaurants.xml": restaurantsSitemap,
      "sitemap-attractions.xml": attractionsSitemap,
      "sitemap-articles.xml": articlesSitemap,
    };
    let storageWritten = 0;
    const storageErrors: string[] = [];
    for (const name of REGENERATED_FILES) {
      try {
        const { error } = await supabase.storage
          .from("sitemaps")
          .upload(name, new Blob([fileContents[name]], { type: "application/xml" }), {
            upsert: true,
            contentType: "application/xml; charset=utf-8",
            cacheControl: "600",
          });
        if (error) {
          storageErrors.push(`${name}: ${error.message}`);
        } else {
          storageWritten++;
        }
      } catch (e) {
        storageErrors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // --- Ping search engines (best-effort; result logged). Google deprecated
    //     its unauthenticated sitemap-ping endpoint in 2023, so this is a
    //     best-effort nudge — GSC/Bing Webmaster remain the authoritative path.
    const ping: Record<string, number | string> = {};
    if (storageWritten > 0) {
      const indexUrl = encodeURIComponent(`${BASE_URL}/sitemap.xml`);
      const targets: Record<string, string> = {
        google: `https://www.google.com/ping?sitemap=${indexUrl}`,
        bing: `https://www.bing.com/ping?sitemap=${indexUrl}`,
      };
      for (const [engine, url] of Object.entries(targets)) {
        try {
          const res = await fetch(url, { method: "GET" });
          ping[engine] = res.status;
        } catch (e) {
          ping[engine] = e instanceof Error ? e.message : "error";
        }
      }
    }

    // --- Drain the queue: mark the snapshot processed, prune old processed. ---
    let queueProcessed = 0;
    if (storageWritten > 0) {
      try {
        const { data: marked } = await supabase
          .from("sitemap_change_queue")
          .update({ processed_at: new Date().toISOString() })
          .is("processed_at", null)
          .lte("enqueued_at", cutoff)
          .select("id");
        queueProcessed = marked?.length ?? 0;
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        await supabase
          .from("sitemap_change_queue")
          .delete()
          .lt("processed_at", sevenDaysAgo);
      } catch (_e) {
        // Queue maintenance is best-effort; regeneration already succeeded.
      }
    }

    const generated = {
      main_urls: mainUrls.length,
      events_urls: eventsUrls.length,
      restaurants_urls: restaurantsUrls.length,
      attractions_urls: attractionsUrls.length,
      articles_urls: articlesUrls.length,
      total_urls:
        mainUrls.length + eventsUrls.length + restaurantsUrls.length +
        attractionsUrls.length + articlesUrls.length,
    };

    ctx.processed(generated.total_urls);
    if (storageErrors.length > 0) ctx.failed(storageErrors.length);
    ctx.meta({
      generated,
      storageWritten,
      storageErrors,
      ping,
      affectedTypes,
      queueProcessed,
    });

    // If we wrote nothing to Storage, surface it as a terminal failure so the
    // watchdog alerts (a build still serves the static fallback, but the
    // event-driven path is broken and needs attention).
    if (storageWritten === 0) {
      throw new Error(`sitemap storage write failed: ${storageErrors.join("; ") || "no files written"}`);
    }

    return {
      generated,
      sitemaps: {
        main: mainSitemap,
        events: eventsSitemap,
        restaurants: restaurantsSitemap,
        attractions: attractionsSitemap,
        articles: articlesSitemap,
        index: sitemapIndex,
      },
      storage: { written: storageWritten, errors: storageErrors },
      ping,
      affected: affectedTypes,
      queueProcessed,
    };
  });

  if (!job.ok || !job.result) {
    return new Response(JSON.stringify({ success: false, error: job.error || "sitemap generation failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const r = job.result;
  return new Response(JSON.stringify({
    success: true,
    generated: r.generated,
    sitemaps: r.sitemaps,
    storage: r.storage,
    ping: r.ping,
    affected: r.affected,
    queueProcessed: r.queueProcessed,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
