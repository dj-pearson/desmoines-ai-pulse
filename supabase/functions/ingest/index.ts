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

import scrapeEvents from "../_shared/routes/ingest/scrape-events.ts";
import restaurantOpeningScraper from "../_shared/routes/ingest/restaurant-opening-scraper.ts";
import aiCrawler from "../_shared/routes/ingest/ai-crawler.ts";
import firecrawlScraper from "../_shared/routes/ingest/firecrawl-scraper.ts";
import extractCatchdesmoinesUrls from "../_shared/routes/ingest/extract-catchdesmoines-urls.ts";
import dedupeContent from "../_shared/routes/ingest/dedupe-content.ts";
import fixBrokenEventUrls from "../_shared/routes/ingest/fix-broken-event-urls.ts";

type Handler = (req: Request) => Response | Promise<Response>;

const ROUTES: Record<string, Handler> = {
  "scrape-events": scrapeEvents,
  "restaurant-opening-scraper": restaurantOpeningScraper,
  "ai-crawler": aiCrawler,
  "firecrawl-scraper": firecrawlScraper,
  "extract-catchdesmoines-urls": extractCatchdesmoinesUrls,
  "dedupe-content": dedupeContent,
  "fix-broken-event-urls": fixBrokenEventUrls,
};

function resolveRoute(req: Request): string {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("ingest");
  if (idx >= 0 && parts[idx + 1]) return decodeURIComponent(parts[idx + 1]);
  return "";
}

Deno.serve((req) => {
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
  return handler(req);
});
