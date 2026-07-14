/**
 * SECURITY: verify_jwt = false
 * Reason: consolidated dispatcher; every hosted handler self-authenticates via
 *   requireAdminOrApiKey / getUser exactly as it did when deployed standalone.
 *   The gateway JWT check is intentionally off so cron (service-role bearer),
 *   admin UI (admin JWT), and API-key callers all reach the same in-function
 *   auth gate they used before.
 *
 * ingest — consolidated dispatcher for content-ingestion edge functions.
 *
 * Collapses several near-identical `scrape-*` / `crawl` / `enrich` functions
 * into one deployed function to stay under the Supabase edge-function cap.
 * Each former function's body now lives in `_shared/routes/ingest/<name>.ts`
 * as `export default (req) => Response`; this file holds the one router.
 *
 * Routing: the sub-path selects the handler —
 *   POST /functions/v1/ingest/<name>
 * The request (headers + body) is passed through untouched, so each handler's
 * own CORS, auth, and body parsing behave exactly as before. Request/response
 * shapes are unchanged; only the URL prefix gains `/ingest`.
 */
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";

import scrapeEvents from "../_shared/routes/ingest/scrape-events.ts";
import restaurantOpeningScraper from "../_shared/routes/ingest/restaurant-opening-scraper.ts";
import aiCrawler from "../_shared/routes/ingest/ai-crawler.ts";
import firecrawlScraper from "../_shared/routes/ingest/firecrawl-scraper.ts";
import extractCatchdesmoinesUrls from "../_shared/routes/ingest/extract-catchdesmoines-urls.ts";
import dedupeContent from "../_shared/routes/ingest/dedupe-content.ts";
import fixBrokenEventUrls from "../_shared/routes/ingest/fix-broken-event-urls.ts";
import autoEnrichRestaurants from "../_shared/routes/ingest/auto-enrich-restaurants.ts";
import validateSourceUrls from "../_shared/routes/ingest/validate-source-urls.ts";
import searchNewHotels from "../_shared/routes/ingest/search-new-hotels.ts";
import searchNewRestaurants from "../_shared/routes/ingest/search-new-restaurants.ts";
import crawlSite from "../_shared/routes/ingest/crawl-site.ts";

type Handler = (req: Request) => Response | Promise<Response>;

const ROUTES: Record<string, Handler> = {
  "scrape-events": scrapeEvents,
  "restaurant-opening-scraper": restaurantOpeningScraper,
  "ai-crawler": aiCrawler,
  "firecrawl-scraper": firecrawlScraper,
  "extract-catchdesmoines-urls": extractCatchdesmoinesUrls,
  "dedupe-content": dedupeContent,
  "fix-broken-event-urls": fixBrokenEventUrls,
  "auto-enrich-restaurants": autoEnrichRestaurants,
  "validate-source-urls": validateSourceUrls,
  "search-new-hotels": searchNewHotels,
  "search-new-restaurants": searchNewRestaurants,
  "crawl-site": crawlSite,
};

// Routes whose original standalone functions relied on the gateway's
// verify_jwt=true and carry no in-handler auth. The router enforces
// requireAdminOrApiKey for them (cron service-role bearer, admin JWT, or
// EDGE_FUNCTION_API_KEY all pass) so consolidation does not open them up.
const GATEWAY_AUTH = new Set<string>([
  "auto-enrich-restaurants",
  "validate-source-urls",
  "search-new-hotels",
  "search-new-restaurants",
  "crawl-site",
]);

function resolveRoute(req: Request): string {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("ingest");
  if (idx >= 0 && parts[idx + 1]) return decodeURIComponent(parts[idx + 1]);
  return "";
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  const route = resolveRoute(req);
  const handler = ROUTES[route];
  if (!handler) {
    const corsHeaders = getCorsHeaders(req.headers.get("origin") || undefined);
    return new Response(
      JSON.stringify({ error: `Unknown ingest route '${route}'`, available: Object.keys(ROUTES).sort() }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (GATEWAY_AUTH.has(route)) {
    const corsHeaders = getCorsHeaders(req.headers.get("origin") || undefined);
    const authError = await requireAdminOrApiKey(req, corsHeaders);
    if (authError) return authError;
  }

  return handler(req);
});
